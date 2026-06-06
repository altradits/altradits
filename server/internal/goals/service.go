package goals

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Goal represents a savings goal.
type Goal struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Emoji       string    `json:"emoji"`
	Target      float64   `json:"target"`
	Saved       float64   `json:"saved"`
	Remaining   float64   `json:"remaining"`
	Percent     float64   `json:"percent"`
	Deadline    *string   `json:"deadline"`
	Completed   bool      `json:"completed"`
	CompletedAt *string   `json:"completed_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreateInput is the request body for creating a goal.
type CreateInput struct {
	Name     string  `json:"name"     binding:"required"`
	Emoji    string  `json:"emoji"`
	Target   float64 `json:"target"   binding:"required,min=1"`
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
			id, name, emoji, target, saved,
			TO_CHAR(deadline, 'YYYY-MM-DD'),
			completed,
			TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
		FROM goals
		WHERE user_id = $1
		ORDER BY completed ASC, created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Goal
	for rows.Next() {
		var g Goal
		if err := rows.Scan(
			&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt,
		); err != nil {
			return nil, err
		}
		hydrate(&g)
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

	var g Goal
	var deadline *string
	if input.Deadline != "" {
		deadline = &input.Deadline
	}

	err := s.db.QueryRow(ctx, `
		INSERT INTO goals (user_id, name, emoji, target, deadline)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING
			id, name, emoji, target, saved,
			TO_CHAR(deadline, 'YYYY-MM-DD'),
			completed,
			TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
	`, userID, input.Name, emoji, input.Target, deadline).
		Scan(&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create goal: %w", err)
	}
	hydrate(&g)
	return &g, nil
}

// Contribute adds an amount to a goal's saved total.
func (s *Service) Contribute(ctx context.Context, userID, id string, amount float64) (*Goal, error) {
	var g Goal
	err := s.db.QueryRow(ctx, `
		UPDATE goals
		SET
			saved      = saved + $2,
			completed  = CASE WHEN (saved + $2) >= target THEN TRUE ELSE FALSE END,
			completed_at = CASE WHEN (saved + $2) >= target AND completed = FALSE
			               THEN NOW() ELSE completed_at END,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $3
		RETURNING
			id, name, emoji, target, saved,
			TO_CHAR(deadline, 'YYYY-MM-DD'),
			completed,
			TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
	`, id, amount, userID).
		Scan(&g.ID, &g.Name, &g.Emoji, &g.Target, &g.Saved,
			&g.Deadline, &g.Completed, &g.CompletedAt, &g.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to update goal: %w", err)
	}
	hydrate(&g)
	return &g, nil
}

// Delete removes a goal.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM goals WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
