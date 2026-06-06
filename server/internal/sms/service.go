package sms

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ParseRequest is the input for the parse endpoint.
type ParseRequest struct {
	RawText string `json:"raw_text" binding:"required"`
}

// ParseResponse is what the frontend receives after parsing.
// Nothing is saved yet — the user must confirm.
type ParseResponse struct {
	InboxID    string  `json:"inbox_id"`
	Sender     string  `json:"sender"`
	Amount     float64 `json:"amount"`
	Currency   string  `json:"currency"`
	TxType     string  `json:"tx_type"`
	Recipient  string  `json:"recipient"`
	Category   string  `json:"category"`
	Confidence int     `json:"confidence"`
	Message    string  `json:"message"`
	CanParse   bool    `json:"can_parse"`
}

// ConfirmRequest is the input for the confirm endpoint.
type ConfirmRequest struct {
	InboxID     string  `json:"inbox_id"  binding:"required"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"    binding:"required,min=1"`
	Category    string  `json:"category"`
}

// ConfirmResponse is returned after a successful confirmation.
type ConfirmResponse struct {
	TransactionID string `json:"transaction_id"`
	Message       string `json:"message"`
}

// InboxItem is a pending SMS in the inbox.
type InboxItem struct {
	ID         string    `json:"id"`
	Sender     string    `json:"sender"`
	RawText    string    `json:"raw_text"`
	ParsedDesc *string   `json:"parsed_desc"`
	ParsedAmt  *float64  `json:"parsed_amount"`
	Category   *string   `json:"category"`
	TxType     *string   `json:"tx_type"`
	Confidence int       `json:"confidence"`
	Status     string    `json:"status"`
	ReceivedAt time.Time `json:"received_at"`
}

// Service handles SMS ingestion.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new SMS service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Parse parses a raw SMS string and stores it in the inbox as pending.
// The transaction is NOT saved until the user calls Confirm.
func (s *Service) Parse(ctx context.Context, userID, rawText string) (*ParseResponse, error) {
	result := Parse(rawText)

	if result == nil || result.Amount <= 0 {
		// Store as unparseable so the user can see it
		var id string
		err := s.db.QueryRow(ctx, `
			INSERT INTO sms_inbox (user_id, raw_text, sender, confidence, status)
			VALUES ($1, $2, 'Unknown', 0, 'pending')
			RETURNING id::text
		`, userID, rawText).Scan(&id)
		if err != nil {
			return nil, err
		}
		return &ParseResponse{
			InboxID:    id,
			CanParse:   false,
			Message:    "Could not read this message. You can still add it manually in Capture.",
			Confidence: 0,
		}, nil
	}

	// Store the parsed result in the inbox
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO sms_inbox
			(user_id, raw_text, sender, parsed_amount, parsed_desc, parsed_category, parsed_type, confidence, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
		RETURNING id::text
	`, userID, rawText, result.Sender, result.Amount,
		result.Recipient, result.Category, result.TxType, result.Confidence).
		Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("failed to store SMS: %w", err)
	}

	// Build a human-readable message for the confirmation screen
	msg := buildConfirmMessage(result)

	return &ParseResponse{
		InboxID:    id,
		Sender:     result.Sender,
		Amount:     result.Amount,
		Currency:   result.Currency,
		TxType:     result.TxType,
		Recipient:  result.Recipient,
		Category:   result.Category,
		Confidence: result.Confidence,
		Message:    msg,
		CanParse:   true,
	}, nil
}

// Confirm saves the SMS as a real transaction and marks it confirmed.
// This is the only way a transaction gets created from an SMS.
func (s *Service) Confirm(ctx context.Context, userID string, req ConfirmRequest) (*ConfirmResponse, error) {
	// Save the transaction
	var txID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO transactions (user_id, raw_input, description, amount, category, source, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'sms', NOW())
		RETURNING id::text
	`, userID, req.Description, req.Description, req.Amount, req.Category).
		Scan(&txID)
	if err != nil {
		return nil, fmt.Errorf("failed to save transaction: %w", err)
	}

	// Mark the inbox item as confirmed
	_, err = s.db.Exec(ctx, `
		UPDATE sms_inbox
		SET status = 'confirmed',
		    transaction_id = $2::uuid,
		    confirmed_at = NOW(),
		    parsed_amount = $3,
		    parsed_desc = $4,
		    parsed_category = $5
		WHERE id = $1::uuid
	`, req.InboxID, txID, req.Amount, req.Description, req.Category)
	if err != nil {
		return nil, fmt.Errorf("failed to update inbox: %w", err)
	}

	return &ConfirmResponse{
		TransactionID: txID,
		Message:       fmt.Sprintf("Got it — %s, KES %.0f. Saved. 🌱", req.Description, req.Amount),
	}, nil
}

// Dismiss marks an inbox item as dismissed without saving a transaction.
func (s *Service) Dismiss(ctx context.Context, inboxID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE sms_inbox SET status = 'dismissed' WHERE id = $1::uuid
	`, inboxID)
	return err
}

// Pending returns all pending (unconfirmed) SMS inbox items.
func (s *Service) Pending(ctx context.Context, userID string) ([]*InboxItem, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id::text, COALESCE(sender,''), raw_text,
		       parsed_desc, parsed_amount, parsed_category, parsed_type,
		       confidence, status::text, received_at
		FROM sms_inbox
		WHERE user_id = $1 AND status = 'pending'
		ORDER BY received_at DESC
		LIMIT 20
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*InboxItem
	for rows.Next() {
		var item InboxItem
		if err := rows.Scan(
			&item.ID, &item.Sender, &item.RawText,
			&item.ParsedDesc, &item.ParsedAmt, &item.Category, &item.TxType,
			&item.Confidence, &item.Status, &item.ReceivedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

// buildConfirmMessage creates the human-readable confirmation prompt.
func buildConfirmMessage(p *ParsedSMS) string {
	switch p.TxType {
	case "credit":
		return fmt.Sprintf("Looks like you received KES %.0f from %s. Save this?",
			p.Amount, p.Recipient)
	case "debit":
		if p.Confidence >= 85 {
			return fmt.Sprintf("%s detected — KES %.0f to %s. Confidence: %d%%.",
				p.Sender, p.Amount, p.Recipient, p.Confidence)
		}
		return fmt.Sprintf("Possible expense detected — KES %.0f. Please confirm the details.",
			p.Amount)
	default:
		return fmt.Sprintf("KES %.0f detected. Confirm and save?", p.Amount)
	}
}
