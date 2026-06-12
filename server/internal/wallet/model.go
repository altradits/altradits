package wallet

import "time"

// SatsPerBTC is the number of satoshis in one bitcoin.
const SatsPerBTC = 100_000_000

// Transaction types.
const (
	TypeDepositMpesa      = "deposit_mpesa"
	TypeDepositLightning  = "deposit_lightning"
	TypeWithdrawMpesa     = "withdraw_mpesa"
	TypeWithdrawLightning = "withdraw_lightning"
)

// Transaction statuses.
const (
	StatusPending   = "pending"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
)

// Transaction is a single entry in a user's wallet ledger.
type Transaction struct {
	ID                   string     `json:"id"`
	UserID               string     `json:"-"`
	AmountSats           int64      `json:"amount_sats"`
	AmountKES            *float64   `json:"amount_kes,omitempty"`
	Type                 string     `json:"type"`
	Status               string     `json:"status"`
	MpesaTransactionID   *string    `json:"mpesa_transaction_id,omitempty"`
	LightningInvoice     *string    `json:"lightning_invoice,omitempty"`
	LightningPaymentHash *string    `json:"lightning_payment_hash,omitempty"`
	Description          string     `json:"description"`
	CreatedAt            time.Time  `json:"created_at"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
}

// ExchangeRate is the latest known BTC/KES rate.
type ExchangeRate struct {
	BTCToKES  float64   `json:"btc_to_kes"`
	SatsToKES float64   `json:"sats_to_kes"`
	UpdatedAt time.Time `json:"updated_at"`
	Source    string    `json:"source"`
}

// PriceInfo is the current BTC/KES rate plus its change over the last 24h.
type PriceInfo struct {
	Rate         ExchangeRate `json:"rate"`
	Change24hKES float64      `json:"change_24h_kes"`
	Change24hPct float64      `json:"change_24h_pct"`
	HasHistory   bool         `json:"has_history"`
}

// Balance is the wallet balance shown to a user, expressed in every unit.
type Balance struct {
	SatsBalance        int64        `json:"sats_balance"`
	BTCBalance         float64      `json:"btc_balance"`
	KESValue           float64      `json:"kes_value"`
	TotalSatsReceived  int64        `json:"total_sats_received"`
	TotalSatsWithdrawn int64        `json:"total_sats_withdrawn"`
	PreferredCurrency  string       `json:"preferred_currency"`
	MpesaPhoneNumber   string       `json:"mpesa_phone_number,omitempty"`
	Rate               ExchangeRate `json:"rate"`
}

// SatsToBTC converts satoshis to whole bitcoin.
func SatsToBTC(sats int64) float64 {
	return float64(sats) / SatsPerBTC
}

// SatsToKES converts a satoshi amount to KES using the given rate.
func SatsToKES(sats int64, rate ExchangeRate) float64 {
	return float64(sats) * rate.BTCToKES / SatsPerBTC
}

// KESToSats converts a KES amount to satoshis using the given rate.
func KESToSats(kes float64, rate ExchangeRate) int64 {
	if rate.BTCToKES == 0 {
		return 0
	}
	return int64(kes/rate.BTCToKES*SatsPerBTC + 0.5)
}
