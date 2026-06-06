package capture

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Transaction represents a saved transaction record.
type Transaction struct {
	ID          string    `json:"id"`
	RawInput    string    `json:"raw_input"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"`
	Category    string    `json:"category"`
	Source      string    `json:"source"`
	CreatedAt   time.Time `json:"created_at"`
}

// Service handles the capture business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new capture service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// CaptureInput is the request body for a capture.
type CaptureInput struct {
	Raw string `json:"raw" binding:"required"`
}

// CaptureResult is returned to the client after a successful capture.
type CaptureResult struct {
	Transaction *Transaction `json:"transaction"`
	Message     string       `json:"message"`
}

// Save parses and persists a raw capture input.
func (s *Service) Save(ctx context.Context, userID, raw string) (*CaptureResult, error) {
	entry, err := Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("could not parse input: %w", err)
	}

	var tx Transaction
	err = s.db.QueryRow(ctx, `
		INSERT INTO transactions (user_id, raw_input, description, amount, category, source)
		VALUES ($1, $2, $3, $4, $5, 'manual')
		RETURNING id, raw_input, description, amount, category, source, created_at
	`, userID, entry.RawInput, entry.Description, entry.Amount, entry.Category).
		Scan(&tx.ID, &tx.RawInput, &tx.Description, &tx.Amount, &tx.Category, &tx.Source, &tx.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to save transaction: %w", err)
	}

	return &CaptureResult{
		Transaction: &tx,
		Message:     fmt.Sprintf("Got it — %s, KES %.0f. Saved. 🌱", tx.Description, tx.Amount),
	}, nil
}

// Recent returns the last N transactions.
func (s *Service) Recent(ctx context.Context, userID string, limit int) ([]*Transaction, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, raw_input, description, amount, category, source, created_at
		FROM transactions
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Transaction
	for rows.Next() {
		var tx Transaction
		if err := rows.Scan(&tx.ID, &tx.RawInput, &tx.Description, &tx.Amount, &tx.Category, &tx.Source, &tx.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, &tx)
	}
	return results, rows.Err()
}
