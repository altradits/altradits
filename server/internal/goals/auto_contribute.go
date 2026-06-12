package goals

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// AutoContribution is a recurring contribution schedule for a goal.
type AutoContribution struct {
	ID        string  `json:"id"`
	GoalID    string  `json:"goal_id"`
	Amount    float64 `json:"amount"`
	Frequency string  `json:"frequency"` // "daily", "weekly", or "monthly"
	Active    bool    `json:"active"`
	NextRunAt string  `json:"next_run_at"`
	LastRunAt *string `json:"last_run_at"`
}

// AutoContributionInput is the request body for setting up a recurring
// contribution.
type AutoContributionInput struct {
	Amount    float64 `json:"amount"    binding:"required,min=1"`
	Frequency string  `json:"frequency" binding:"required"`
}

// SetAutoContribution creates or replaces a goal's recurring contribution
// schedule, scheduling the first run one interval from now.
func (s *Service) SetAutoContribution(ctx context.Context, userID, goalID string, input AutoContributionInput) (*AutoContribution, error) {
	switch input.Frequency {
	case "daily", "weekly", "monthly":
	default:
		return nil, fmt.Errorf("frequency must be daily, weekly, or monthly")
	}

	var a AutoContribution
	err := s.db.QueryRow(ctx, `
		INSERT INTO goal_auto_contributions (goal_id, user_id, amount, frequency, next_run_at)
		SELECT $1, $2, $3, $4::text,
			NOW() + CASE $4::text
				WHEN 'daily' THEN INTERVAL '1 day'
				WHEN 'weekly' THEN INTERVAL '7 days'
				ELSE INTERVAL '1 month'
			END
		WHERE EXISTS (SELECT 1 FROM goals WHERE id = $1 AND user_id = $2)
		ON CONFLICT (goal_id) DO UPDATE SET
			amount      = EXCLUDED.amount,
			frequency   = EXCLUDED.frequency,
			active      = TRUE,
			next_run_at = EXCLUDED.next_run_at
		RETURNING id, goal_id, amount, frequency, active,
			TO_CHAR(next_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			TO_CHAR(last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, goalID, userID, input.Amount, input.Frequency).
		Scan(&a.ID, &a.GoalID, &a.Amount, &a.Frequency, &a.Active, &a.NextRunAt, &a.LastRunAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("goal not found")
		}
		return nil, fmt.Errorf("failed to set auto-save: %w", err)
	}
	return &a, nil
}

// ClearAutoContribution removes a goal's recurring contribution schedule.
func (s *Service) ClearAutoContribution(ctx context.Context, userID, goalID string) error {
	_, err := s.db.Exec(ctx, `
		DELETE FROM goal_auto_contributions WHERE goal_id = $1 AND user_id = $2
	`, goalID, userID)
	return err
}
