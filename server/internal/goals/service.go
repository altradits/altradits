package goals

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Goal represents a savings goal. Currency is either "kes" (saved is a
// manually-tracked running total) or "sats" (saved is earmarked from the
// user's Lightning wallet balance via Contribute/Delete).
type Goal struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Emoji       string    `json:"emoji"`
	Target      float64   `json:"target"`
	Saved       float64   `json:"saved"`
	Remaining   float64   `json:"remaining"`
	Percent     float64   `json:"percent"`
	Currency    string    `json:"currency"`
	Deadline    *string   `json:"deadline"`
	Completed   bool      `json:"completed"`
	CompletedAt *string   `json:"completed_at"`
	CreatedAt   time.Time `json:"created_at"`

	AutoContribution *AutoContribution `json:"auto_contribution,omitempty"`
}

// CreateInput is the request body for creating a goal.
type CreateInput struct {
	Name     string  `json:"name"     binding:"required"`
	Emoji    string  `json:"emoji"`
	Target   float64 `json:"target"   binding:"required,min=1"`
	Currency string  `json:"currency"` // "kes" (default) or "sats"
	Deadline string  `json:"deadline"` // optional, YYYY-MM-DD
}

// ContributeInput is the request body for adding money to a goal.
type ContributeInput struct {
	Amount float64 `json:"amount" binding:"required,min=1"`
}

// Service handles goals business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new goals service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// hydrate fills computed fields on a goal.
func hydrate(g *Goal) {
	g.Remaining = g.Target - g.Saved
	if g.Remaining < 0 {
		g.Remaining = 0
	}
	if g.Target > 0 {
		g.Percent = (g.Saved / g.Target) * 100
		if g.Percent > 100 {
			g.Percent = 100
		}
	}
}

// List returns all goals ordered by creation date.
func (s *Service) List(ctx context.Context, userID string) ([]*Goal, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			g.id, g.name, g.emoji, g.target, g.saved, g.currency,
			TO_CHAR(g.deadline, 'YYYY-MM-DD'),
			g.completed,
			TO_CHAR(g.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			g.created_at,
			ac.id, ac.amount, ac.frequency, ac.active,
			TO_CHAR(ac.next_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			TO_CHAR(ac.last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM goals g
		LEFT JOIN goal_auto_contributions ac ON ac.goal_id = g.id AND ac.active = TRUE
		WHERE g.user_id = $1
		ORDER BY g.completed ASC, g.created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Goal
	for rows.Next() {
		var g Goal
		var acID, acFrequency, acNextRun, acLastRun *string
		var acAmount *float64
		var acActive *bool
		if err := rows.Scan(
			&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved, &g.Currency,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt,
			&acID, &acAmount, &acFrequency, &acActive, &acNextRun, &acLastRun,
		); err != nil {
			return nil, err
		}
		hydrate(&g)
		if acID != nil {
			g.AutoContribution = &AutoContribution{
				ID:        *acID,
				GoalID:    g.ID,
				Amount:    *acAmount,
				Frequency: *acFrequency,
				Active:    *acActive,
				NextRunAt: *acNextRun,
				LastRunAt: acLastRun,
			}
		}
		result = append(result, &g)
	}
	return result, rows.Err()
}

// Create adds a new goal.
func (s *Service) Create(ctx context.Context, userID string, input CreateInput) (*Goal, error) {
	emoji := input.Emoji
	if emoji == "" {
		emoji = "🎯"
	}

	currency := input.Currency
	if currency == "" {
		currency = "kes"
	}
	if currency != "kes" && currency != "sats" {
		return nil, fmt.Errorf("currency must be kes or sats")
	}

	var g Goal
	var deadline *string
	if input.Deadline != "" {
		deadline = &input.Deadline
	}

	err := s.db.QueryRow(ctx, `
		INSERT INTO goals (user_id, name, emoji, target, currency, deadline)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING
			id, name, emoji, target, saved, currency,
			TO_CHAR(deadline, 'YYYY-MM-DD'),
			completed,
			TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
	`, userID, input.Name, emoji, input.Target, currency, deadline).
		Scan(&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved, &g.Currency,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create goal: %w", err)
	}
	hydrate(&g)
	return &g, nil
}

// Contribute adds an amount to a goal's saved total. For sats-denominated
// goals, the amount is moved out of the user's Lightning wallet balance and
// earmarked against the goal; for KES goals it is a manually-tracked total.
func (s *Service) Contribute(ctx context.Context, userID, id string, amount float64) (*Goal, error) {
	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var currency string
	if err := dbTx.QueryRow(ctx, `
		SELECT currency FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE
	`, id, userID).Scan(&currency); err != nil {
		return nil, fmt.Errorf("goal not found")
	}

	if currency == "sats" {
		amountSats := int64(amount + 0.5)

		var balance int64
		if err := dbTx.QueryRow(ctx, `
			SELECT current_sats_balance FROM users WHERE id = $1 FOR UPDATE
		`, userID).Scan(&balance); err != nil {
			return nil, err
		}
		if balance < amountSats {
			return nil, fmt.Errorf("insufficient wallet balance")
		}

		if _, err := dbTx.Exec(ctx, `
			UPDATE users SET current_sats_balance = current_sats_balance - $1 WHERE id = $2
		`, amountSats, userID); err != nil {
			return nil, err
		}
		amount = float64(amountSats)
	}

	var g Goal
	err = dbTx.QueryRow(ctx, `
		UPDATE goals
		SET
			saved      = saved + $2,
			completed  = CASE WHEN (saved + $2) >= target THEN TRUE ELSE FALSE END,
			completed_at = CASE WHEN (saved + $2) >= target AND completed = FALSE
			               THEN NOW() ELSE completed_at END,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $3
		RETURNING
			id, name, emoji, target, saved, currency,
			TO_CHAR(deadline, 'YYYY-MM-DD'),
			completed,
			TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
	`, id, amount, userID).
		Scan(&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved, &g.Currency,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to update goal: %w", err)
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	hydrate(&g)
	return &g, nil
}

// Delete removes a goal. If it is a sats goal with sats earmarked against
// it, those sats are returned to the user's Lightning wallet balance first.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer dbTx.Rollback(ctx)

	var currency string
	var saved float64
	err = dbTx.QueryRow(ctx, `
		SELECT currency, saved FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE
	`, id, userID).Scan(&currency, &saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	if currency == "sats" && saved > 0 {
		if _, err := dbTx.Exec(ctx, `
			UPDATE users SET current_sats_balance = current_sats_balance + $1 WHERE id = $2
		`, int64(saved+0.5), userID); err != nil {
			return err
		}
	}

	if _, err := dbTx.Exec(ctx, `DELETE FROM goals WHERE id = $1 AND user_id = $2`, id, userID); err != nil {
		return err
	}

	return dbTx.Commit(ctx)
}
