package budget

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CategoryBudget holds a budget allocation and the actual spending for a period.
type CategoryBudget struct {
	ID        string  `json:"id"`
	Category  string  `json:"category"`
	Allocated float64 `json:"allocated"`
	Spent     float64 `json:"spent"`
	Remaining float64 `json:"remaining"`
	Percent   float64 `json:"percent"` // spent / allocated * 100
	Period    string  `json:"period"`
}

// UpdateInput is the request body for setting a budget amount.
type UpdateInput struct {
	Category string  `json:"category" binding:"required"`
	Amount   float64 `json:"amount" binding:"required,min=0"`
}

// Service handles budget business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new budget service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Summary returns all budget categories with actual spending for the current month.
func (s *Service) Summary(ctx context.Context) ([]*CategoryBudget, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// Get all budgets (system defaults where user_id IS NULL for now)
	rows, err := s.db.Query(ctx, `
		SELECT id, category, amount, period
		FROM budgets
		WHERE user_id IS NULL
		ORDER BY
			CASE category
				WHEN 'food'          THEN 1
				WHEN 'transport'     THEN 2
				WHEN 'bills'         THEN 3
				WHEN 'family'        THEN 4
				WHEN 'investments'   THEN 5
				WHEN 'savings'       THEN 6
				WHEN 'fun'           THEN 7
				WHEN 'health'        THEN 8
				ELSE                      9
			END
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var budgets []*CategoryBudget
	for rows.Next() {
		var b CategoryBudget
		if err := rows.Scan(&b.ID, &b.Category, &b.Allocated, &b.Period); err != nil {
			return nil, err
		}
		budgets = append(budgets, &b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Get this month's spending per category from transactions
	spendRows, err := s.db.Query(ctx, `
		SELECT category, COALESCE(SUM(amount), 0) as total
		FROM transactions
		WHERE created_at >= $1
		GROUP BY category
	`, monthStart)
	if err != nil {
		return nil, err
	}
	defer spendRows.Close()

	spending := map[string]float64{}
	for spendRows.Next() {
		var cat string
		var total float64
		if err := spendRows.Scan(&cat, &total); err != nil {
			return nil, err
		}
		spending[cat] = total
	}

	// Merge spending into budgets
	for _, b := range budgets {
		b.Spent = spending[b.Category]
		b.Remaining = b.Allocated - b.Spent
		if b.Allocated > 0 {
			b.Percent = (b.Spent / b.Allocated) * 100
			if b.Percent > 100 {
				b.Percent = 100
			}
		}
	}

	return budgets, nil
}

// Update sets a new allocation amount for a category.
func (s *Service) Update(ctx context.Context, category string, amount float64) (*CategoryBudget, error) {
	var b CategoryBudget
	err := s.db.QueryRow(ctx, `
		UPDATE budgets
		SET amount = $2, updated_at = NOW()
		WHERE category = $1 AND user_id IS NULL
		RETURNING id, category, amount, period
	`, category, amount).
		Scan(&b.ID, &b.Category, &b.Allocated, &b.Period)
	if err != nil {
		return nil, err
	}
	return &b, nil
}