package wallet

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	minDepositKES   = 10
	maxDepositKES   = 250_000 // Safaricom M-Pesa STK Push per-transaction limit
	minWithdrawSats = 10_000
	maxWithdrawKES  = 250_000 // Safaricom M-Pesa B2C per-transaction limit
)

// lightningAddressDomain returns the domain used for Lightning addresses
// (username@domain), configurable via LIGHTNING_ADDRESS_DOMAIN.
func lightningAddressDomain() string {
	if domain := os.Getenv("LIGHTNING_ADDRESS_DOMAIN"); domain != "" {
		return domain
	}
	return "altradits.com"
}

// ErrUserNotFound is returned when the authenticated user's ID no longer
// matches a row in the users table (e.g. a JWT issued for a deleted account).
var ErrUserNotFound = errors.New("user not found")

// Service implements wallet balance, deposit, withdrawal, and history
// operations on top of the wallet_transactions ledger and the per-user sats
// balance columns on the users table.
type Service struct {
	db        *pgxpool.Pool
	rates     *ExchangeRateService
	mpesa     MpesaProvider
	lightning LightningProvider
}

// NewService creates the wallet service.
func NewService(db *pgxpool.Pool, rates *ExchangeRateService, mpesa MpesaProvider, lightning LightningProvider) *Service {
	return &Service{db: db, rates: rates, mpesa: mpesa, lightning: lightning}
}

// LightningStatus reports whether the configured Lightning provider is a
// real LND node or the mock, and whether it's currently reachable.
func (s *Service) LightningStatus(ctx context.Context) LightningStatus {
	return s.lightning.Status(ctx)
}

// GetBalance returns the user's wallet balance in sats, BTC, and KES.
func (s *Service) GetBalance(ctx context.Context, userID string) (*Balance, error) {
	rate, rateErr := s.rates.GetRate(ctx)

	var sats, received, withdrawn int64
	var preferredCurrency, username string
	var mpesaPhone *string
	err := s.db.QueryRow(ctx, `
		SELECT current_sats_balance, total_sats_received, total_sats_withdrawn, preferred_currency, mpesa_phone_number, username
		FROM users WHERE id = $1
	`, userID).Scan(&sats, &received, &withdrawn, &preferredCurrency, &mpesaPhone, &username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	if rateErr != nil && rate.BTCToKES == 0 {
		return nil, fmt.Errorf("could not load exchange rate: %w", rateErr)
	}

	balance := &Balance{
		SatsBalance:        sats,
		BTCBalance:         SatsToBTC(sats),
		KESValue:           SatsToKES(sats, rate),
		TotalSatsReceived:  received,
		TotalSatsWithdrawn: withdrawn,
		PreferredCurrency:  preferredCurrency,
		Username:           username,
		LightningAddress:   username + "@" + lightningAddressDomain(),
		Rate:               rate,
	}
	if mpesaPhone != nil {
		balance.MpesaPhoneNumber = *mpesaPhone
	}
	return balance, nil
}

// DepositMpesaInput is the request body for POST /wallet/deposit/mpesa.
type DepositMpesaInput struct {
	AmountKES float64 `json:"amount_kes" binding:"required"`
	Phone     string  `json:"phone_number" binding:"required"`
}

// DepositMpesa converts a KES amount to sats at the current rate, sends an
// STK push, and (in mock mode) credits the wallet immediately on success.
func (s *Service) DepositMpesa(ctx context.Context, userID string, input DepositMpesaInput) (*Transaction, error) {
	if input.AmountKES < minDepositKES {
		return nil, fmt.Errorf("minimum deposit is KSh %d", minDepositKES)
	}
	if input.AmountKES > maxDepositKES {
		return nil, fmt.Errorf("maximum deposit is KSh %d", maxDepositKES)
	}
	phone, err := NormalizeMpesaPhone(input.Phone)
	if err != nil {
		return nil, err
	}

	rate, rateErr := s.rates.GetRate(ctx)
	if rateErr != nil && rate.BTCToKES == 0 {
		return nil, fmt.Errorf("could not load exchange rate: %w", rateErr)
	}
	sats := KESToSats(input.AmountKES, rate)
	if sats <= 0 {
		return nil, fmt.Errorf("amount too small to convert to sats")
	}

	result, err := s.mpesa.STKPush(ctx, phone, input.AmountKES, "Altradits Wallet")
	if err != nil {
		return nil, err
	}

	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	status := StatusPending
	var completedAt *time.Time
	if result.Success {
		status = StatusCompleted
		now := time.Now()
		completedAt = &now
	}

	var wt Transaction
	err = dbTx.QueryRow(ctx, `
		INSERT INTO wallet_transactions (user_id, amount_sats, amount_kes, type, status, mpesa_transaction_id, description, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, amount_sats, amount_kes, type, status, mpesa_transaction_id, description, created_at, completed_at
	`, userID, sats, input.AmountKES, TypeDepositMpesa, status, result.TransactionID, result.Message, completedAt).Scan(
		&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.MpesaTransactionID, &wt.Description, &wt.CreatedAt, &wt.CompletedAt,
	)
	if err != nil {
		return nil, err
	}

	if status == StatusCompleted {
		if _, err := dbTx.Exec(ctx, `
			UPDATE users SET current_sats_balance = current_sats_balance + $1,
			                  total_sats_received = total_sats_received + $1,
			                  mpesa_phone_number = COALESCE(mpesa_phone_number, $2)
			WHERE id = $3
		`, sats, phone, userID); err != nil {
			return nil, err
		}
	} else if _, err := dbTx.Exec(ctx, `
		UPDATE users SET mpesa_phone_number = COALESCE(mpesa_phone_number, $1) WHERE id = $2
	`, phone, userID); err != nil {
		return nil, err
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &wt, nil
}

// DepositLightningInput is the request body for POST /wallet/deposit/lightning.
type DepositLightningInput struct {
	AmountSats int64  `json:"amount_sats" binding:"required"`
	Memo       string `json:"memo"`
}

// DepositLightning generates a Lightning invoice for the requested amount.
// The transaction stays "pending" until the invoice is paid — see
// SimulateLightningDeposit for the mock confirmation path.
func (s *Service) DepositLightning(ctx context.Context, userID string, input DepositLightningInput) (*Transaction, error) {
	if input.AmountSats <= 0 {
		return nil, fmt.Errorf("enter an amount greater than zero")
	}

	invoice, err := s.lightning.CreateInvoice(ctx, input.AmountSats, input.Memo)
	if err != nil {
		return nil, err
	}

	description := input.Memo
	if description == "" {
		description = "Lightning deposit"
	}

	var wt Transaction
	err = s.db.QueryRow(ctx, `
		INSERT INTO wallet_transactions (user_id, amount_sats, type, status, lightning_invoice, lightning_payment_hash, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, amount_sats, amount_kes, type, status, lightning_invoice, lightning_payment_hash, description, created_at, completed_at
	`, userID, input.AmountSats, TypeDepositLightning, StatusPending, invoice.PaymentRequest, invoice.PaymentHash, description).Scan(
		&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.LightningInvoice, &wt.LightningPaymentHash, &wt.Description, &wt.CreatedAt, &wt.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &wt, nil
}

// SimulateLightningDeposit marks a pending Lightning deposit invoice as paid
// and credits the wallet. The mock provider has no real node to receive a
// payment-settled webhook from, so this endpoint stands in for that webhook
// in local development.
func (s *Service) SimulateLightningDeposit(ctx context.Context, userID, txID string) (*Transaction, error) {
	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var wt Transaction
	err = dbTx.QueryRow(ctx, `
		SELECT id, amount_sats, amount_kes, type, status, lightning_invoice, lightning_payment_hash, description, created_at, completed_at
		FROM wallet_transactions WHERE id = $1 AND user_id = $2 FOR UPDATE
	`, txID, userID).Scan(&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.LightningInvoice, &wt.LightningPaymentHash, &wt.Description, &wt.CreatedAt, &wt.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("transaction not found")
	}
	if wt.Type != TypeDepositLightning {
		return nil, fmt.Errorf("not a lightning deposit")
	}
	if wt.Status != StatusPending {
		return nil, fmt.Errorf("invoice is already %s", wt.Status)
	}

	if err := completeLightningDeposit(ctx, dbTx, &wt, userID); err != nil {
		return nil, err
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &wt, nil
}

// CheckLightningDeposit asks the Lightning node whether a pending deposit
// invoice has been settled. If so, the transaction is marked completed and
// the wallet credited, exactly as SimulateLightningDeposit does. If the
// invoice is still unpaid (or the transaction is not a pending Lightning
// deposit), it is returned unchanged so the caller can poll again.
func (s *Service) CheckLightningDeposit(ctx context.Context, userID, txID string) (*Transaction, error) {
	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var wt Transaction
	err = dbTx.QueryRow(ctx, `
		SELECT id, amount_sats, amount_kes, type, status, lightning_invoice, lightning_payment_hash, description, created_at, completed_at
		FROM wallet_transactions WHERE id = $1 AND user_id = $2 FOR UPDATE
	`, txID, userID).Scan(&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.LightningInvoice, &wt.LightningPaymentHash, &wt.Description, &wt.CreatedAt, &wt.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("transaction not found")
	}
	if wt.Type != TypeDepositLightning {
		return nil, fmt.Errorf("not a lightning deposit")
	}
	if wt.Status != StatusPending || wt.LightningPaymentHash == nil {
		return &wt, nil
	}

	settled, err := s.lightning.CheckInvoice(ctx, *wt.LightningPaymentHash)
	if err != nil {
		return nil, err
	}
	if !settled {
		return &wt, nil
	}

	if err := completeLightningDeposit(ctx, dbTx, &wt, userID); err != nil {
		return nil, err
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &wt, nil
}

// completeLightningDeposit marks a pending Lightning deposit transaction as
// completed and credits the user's wallet for its amount. wt must have been
// loaded with a FOR UPDATE lock within dbTx.
func completeLightningDeposit(ctx context.Context, dbTx pgx.Tx, wt *Transaction, userID string) error {
	now := time.Now()
	if err := dbTx.QueryRow(ctx, `
		UPDATE wallet_transactions SET status = $1, completed_at = $2 WHERE id = $3
		RETURNING status, completed_at
	`, StatusCompleted, now, wt.ID).Scan(&wt.Status, &wt.CompletedAt); err != nil {
		return err
	}

	if _, err := dbTx.Exec(ctx, `
		UPDATE users SET current_sats_balance = current_sats_balance + $1,
		                  total_sats_received = total_sats_received + $1
		WHERE id = $2
	`, wt.AmountSats, userID); err != nil {
		return err
	}
	return nil
}

// WithdrawMpesaInput is the request body for POST /wallet/withdraw/mpesa.
type WithdrawMpesaInput struct {
	AmountSats int64  `json:"amount_sats" binding:"required"`
	Phone      string `json:"phone_number" binding:"required"`
}

// WithdrawMpesa converts sats to KES at the current rate and sends a B2C
// payout, debiting the wallet immediately on success.
func (s *Service) WithdrawMpesa(ctx context.Context, userID string, input WithdrawMpesaInput) (*Transaction, error) {
	if input.AmountSats < minWithdrawSats {
		return nil, fmt.Errorf("minimum withdrawal is %s sats", FormatSats(minWithdrawSats))
	}
	phone, err := NormalizeMpesaPhone(input.Phone)
	if err != nil {
		return nil, err
	}

	rate, rateErr := s.rates.GetRate(ctx)
	if rateErr != nil && rate.BTCToKES == 0 {
		return nil, fmt.Errorf("could not load exchange rate: %w", rateErr)
	}
	amountKES := SatsToKES(input.AmountSats, rate)
	if amountKES > maxWithdrawKES {
		return nil, fmt.Errorf("maximum withdrawal is KSh %d", maxWithdrawKES)
	}

	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var balance int64
	if err := dbTx.QueryRow(ctx, `SELECT current_sats_balance FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return nil, err
	}
	if balance < input.AmountSats {
		return nil, fmt.Errorf("insufficient balance")
	}

	result, err := s.mpesa.B2C(ctx, phone, amountKES, "Altradits Wallet withdrawal")
	if err != nil {
		return nil, err
	}

	status := StatusPending
	var completedAt *time.Time
	if result.Success {
		status = StatusCompleted
		now := time.Now()
		completedAt = &now
	}

	var wt Transaction
	err = dbTx.QueryRow(ctx, `
		INSERT INTO wallet_transactions (user_id, amount_sats, amount_kes, type, status, mpesa_transaction_id, description, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, amount_sats, amount_kes, type, status, mpesa_transaction_id, description, created_at, completed_at
	`, userID, input.AmountSats, amountKES, TypeWithdrawMpesa, status, result.TransactionID, result.Message, completedAt).Scan(
		&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.MpesaTransactionID, &wt.Description, &wt.CreatedAt, &wt.CompletedAt,
	)
	if err != nil {
		return nil, err
	}

	if status == StatusCompleted {
		if _, err := dbTx.Exec(ctx, `
			UPDATE users SET current_sats_balance = current_sats_balance - $1,
			                  total_sats_withdrawn = total_sats_withdrawn + $1,
			                  mpesa_phone_number = COALESCE(mpesa_phone_number, $2)
			WHERE id = $3
		`, input.AmountSats, phone, userID); err != nil {
			return nil, err
		}
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &wt, nil
}

// WithdrawLightningInput is the request body for POST /wallet/withdraw/lightning.
type WithdrawLightningInput struct {
	AmountSats  int64  `json:"amount_sats" binding:"required"`
	Destination string `json:"destination" binding:"required"`
}

// WithdrawLightning pays a bolt11 invoice or Lightning address, debiting the
// wallet for the amount sent plus any routing fee.
func (s *Service) WithdrawLightning(ctx context.Context, userID string, input WithdrawLightningInput) (*Transaction, error) {
	if input.AmountSats <= 0 {
		return nil, fmt.Errorf("enter an amount greater than zero")
	}
	if strings.TrimSpace(input.Destination) == "" {
		return nil, fmt.Errorf("enter a Lightning invoice or address")
	}

	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var balance int64
	if err := dbTx.QueryRow(ctx, `SELECT current_sats_balance FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return nil, err
	}
	if balance < input.AmountSats {
		return nil, fmt.Errorf("insufficient balance")
	}

	payment, err := s.lightning.PayInvoice(ctx, input.Destination, input.AmountSats)
	if err != nil {
		return nil, err
	}

	// Re-check including the routing fee: the amount alone was affordable,
	// but a real LND provider may charge a fee that pushes the total over
	// the available balance.
	total := input.AmountSats + payment.FeeSats
	if balance < total {
		return nil, fmt.Errorf("insufficient balance to cover the %s sat routing fee", FormatSats(payment.FeeSats))
	}

	now := time.Now()
	var wt Transaction
	err = dbTx.QueryRow(ctx, `
		INSERT INTO wallet_transactions (user_id, amount_sats, type, status, lightning_invoice, lightning_payment_hash, description, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, amount_sats, amount_kes, type, status, lightning_invoice, lightning_payment_hash, description, created_at, completed_at
	`, userID, total, TypeWithdrawLightning, StatusCompleted, input.Destination, payment.PaymentHash,
		fmt.Sprintf("Sent %s sats via Lightning", FormatSats(input.AmountSats)), now).Scan(
		&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.LightningInvoice, &wt.LightningPaymentHash, &wt.Description, &wt.CreatedAt, &wt.CompletedAt,
	)
	if err != nil {
		return nil, err
	}

	if _, err := dbTx.Exec(ctx, `
		UPDATE users SET current_sats_balance = current_sats_balance - $1,
		                  total_sats_withdrawn = total_sats_withdrawn + $1
		WHERE id = $2
	`, total, userID); err != nil {
		return nil, err
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &wt, nil
}

// ListTransactions returns the user's wallet ledger, most recent first.
func (s *Service) ListTransactions(ctx context.Context, userID string, limit int) ([]Transaction, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, amount_sats, amount_kes, type, status, mpesa_transaction_id, lightning_invoice, lightning_payment_hash, description, created_at, completed_at
		FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	transactions := []Transaction{}
	for rows.Next() {
		var wt Transaction
		if err := rows.Scan(&wt.ID, &wt.AmountSats, &wt.AmountKES, &wt.Type, &wt.Status, &wt.MpesaTransactionID, &wt.LightningInvoice, &wt.LightningPaymentHash, &wt.Description, &wt.CreatedAt, &wt.CompletedAt); err != nil {
			return nil, err
		}
		transactions = append(transactions, wt)
	}
	return transactions, rows.Err()
}

// ExportTransactionsCSV renders the user's full wallet ledger as CSV.
func (s *Service) ExportTransactionsCSV(ctx context.Context, userID string) ([]byte, error) {
	transactions, err := s.ListTransactions(ctx, userID, 1000)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"date", "type", "status", "amount_sats", "amount_kes", "description", "reference"})
	for _, t := range transactions {
		kes := ""
		if t.AmountKES != nil {
			kes = strconv.FormatFloat(*t.AmountKES, 'f', 2, 64)
		}
		ref := ""
		switch {
		case t.MpesaTransactionID != nil:
			ref = *t.MpesaTransactionID
		case t.LightningPaymentHash != nil:
			ref = *t.LightningPaymentHash
		}
		_ = w.Write([]string{
			t.CreatedAt.Format(time.RFC3339),
			t.Type,
			t.Status,
			strconv.FormatInt(t.AmountSats, 10),
			kes,
			t.Description,
			ref,
		})
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// SettingsInput is the request body for PUT /wallet/settings.
type SettingsInput struct {
	PreferredCurrency *string `json:"preferred_currency"`
	MpesaPhoneNumber  *string `json:"mpesa_phone_number"`
}

// UpdateSettings updates the user's preferred display currency and/or saved
// M-Pesa phone number.
func (s *Service) UpdateSettings(ctx context.Context, userID string, input SettingsInput) error {
	if input.PreferredCurrency != nil {
		switch *input.PreferredCurrency {
		case "btc", "sats", "kes":
		default:
			return fmt.Errorf("preferred currency must be btc, sats, or kes")
		}
		if _, err := s.db.Exec(ctx, `UPDATE users SET preferred_currency = $1 WHERE id = $2`, *input.PreferredCurrency, userID); err != nil {
			return err
		}
	}
	if input.MpesaPhoneNumber != nil {
		phone, err := NormalizeMpesaPhone(*input.MpesaPhoneNumber)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(ctx, `UPDATE users SET mpesa_phone_number = $1 WHERE id = $2`, phone, userID); err != nil {
			return err
		}
	}
	return nil
}

// FormatSats renders a sats amount with thousands separators, e.g.
// 1234567 -> "1,234,567", for use in user-facing error and description text.
func FormatSats(sats int64) string {
	digits := strconv.FormatInt(sats, 10)
	neg := strings.HasPrefix(digits, "-")
	if neg {
		digits = digits[1:]
	}

	var out strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(d)
	}

	if neg {
		return "-" + out.String()
	}
	return out.String()
}
