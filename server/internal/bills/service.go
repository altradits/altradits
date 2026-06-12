package bills

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Bill is a recurring expense the user wants reminders for.
type Bill struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Emoji        string    `json:"emoji"`
	Amount       float64   `json:"amount"`
	Category     string    `json:"category"`
	Frequency    string    `json:"frequency"` // "weekly", "monthly", or "yearly"
	NextDueDate  string    `json:"next_due_date"`
	DaysUntilDue int       `json:"days_until_due"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"created_at"`
}

// CreateInput is the request body for adding a recurring bill.
type CreateInput struct {
	Name        string  `json:"name"          binding:"required"`
	Emoji       string  `json:"emoji"`
	Amount      float64 `json:"amount"        binding:"required,min=1"`
	Category    string  `json:"category"`
	Frequency   string  `json:"frequency"`
	NextDueDate string  `json:"next_due_date" binding:"required"` // YYYY-MM-DD
}

// UpdateInput is the request body for editing a recurring bill.
type UpdateInput struct {
	Name        string  `json:"name"          binding:"required"`
	Emoji       string  `json:"emoji"`
	Amount      float64 `json:"amount"        binding:"required,min=1"`
	Category    string  `json:"category"`
	Frequency   string  `json:"frequency"      binding:"required"`
	NextDueDate string  `json:"next_due_date" binding:"required"`
}

// Service handles recurring bills business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new bills service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

const billColumns = `
	id, name, emoji, amount, category, frequency,
	TO_CHAR(next_due_date, 'YYYY-MM-DD'),
	(next_due_date - CURRENT_DATE)::int,
	active, created_at
`

func scanBill(row pgx.Row) (*Bill, error) {
	var b Bill
	if err := row.Scan(&b.ID, &b.Name, &b.Emoji, &b.Amount, &b.Category, &b.Frequency,
		&b.NextDueDate, &b.DaysUntilDue, &b.Active, &b.CreatedAt); err != nil {
		return nil, err
	}
	return &b, nil
}

func validFrequency(f string) bool {
	switch f {
	case "weekly", "monthly", "yearly":
		return true
	default:
		return false
	}
}

// List returns all bills ordered by urgency, soonest due date first.
func (s *Service) List(ctx context.Context, userID string) ([]*Bill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+billColumns+`
		FROM bills
		WHERE user_id = $1
		ORDER BY active DESC, next_due_date ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Bill
	for rows.Next() {
		b, err := scanBill(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, rows.Err()
}

// Create adds a new recurring bill.
func (s *Service) Create(ctx context.Context, userID string, input CreateInput) (*Bill, error) {
	emoji := input.Emoji
	if emoji == "" {
		emoji = "🧾"
	}
	category := input.Category
	if category == "" {
		category = "bills"
	}
	frequency := input.Frequency
	if frequency == "" {
		frequency = "monthly"
	}
	if !validFrequency(frequency) {
		return nil, fmt.Errorf("frequency must be weekly, monthly, or yearly")
	}

	b, err := scanBill(s.db.QueryRow(ctx, `
		INSERT INTO bills (user_id, name, emoji, amount, category, frequency, next_due_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+billColumns,
		userID, input.Name, emoji, input.Amount, category, frequency, input.NextDueDate))
	if err != nil {
		return nil, fmt.Errorf("failed to add bill: %w", err)
	}
	return b, nil
}

// Update edits an existing bill's details.
func (s *Service) Update(ctx context.Context, userID, id string, input UpdateInput) (*Bill, error) {
	if !validFrequency(input.Frequency) {
		return nil, fmt.Errorf("frequency must be weekly, monthly, or yearly")
	}
	emoji := input.Emoji
	if emoji == "" {
		emoji = "🧾"
	}
	category := input.Category
	if category == "" {
		category = "bills"
	}

	b, err := scanBill(s.db.QueryRow(ctx, `
		UPDATE bills
		SET name = $3, emoji = $4, amount = $5, category = $6,
		    frequency = $7, next_due_date = $8, last_notified_for = NULL
		WHERE id = $1 AND user_id = $2
		RETURNING `+billColumns,
		id, userID, input.Name, emoji, input.Amount, category, input.Frequency, input.NextDueDate))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("bill not found")
		}
		return nil, fmt.Errorf("failed to update bill: %w", err)
	}
	return b, nil
}

// ToggleActive flips a bill between active and paused.
func (s *Service) ToggleActive(ctx context.Context, userID, id string) (*Bill, error) {
	b, err := scanBill(s.db.QueryRow(ctx, `
		UPDATE bills SET active = NOT active
		WHERE id = $1 AND user_id = $2
		RETURNING `+billColumns,
		id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("bill not found")
		}
		return nil, fmt.Errorf("failed to update bill: %w", err)
	}
	return b, nil
}

// Delete removes a recurring bill.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM bills WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
