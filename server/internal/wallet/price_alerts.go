package wallet

import (
	"context"
	"fmt"
	"time"
)

// PriceAlert is a user-defined BTC/KES price threshold. Once the rate
// crosses the threshold the user is notified and the alert is deactivated.
type PriceAlert struct {
	ID          string    `json:"id"`
	Direction   string    `json:"direction"`
	TargetKES   float64   `json:"target_kes"`
	Active      bool      `json:"active"`
	TriggeredAt *string   `json:"triggered_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreatePriceAlertInput is the request body for POST /price-alerts.
type CreatePriceAlertInput struct {
	Direction string  `json:"direction" binding:"required"`
	TargetKES float64 `json:"target_kes" binding:"required,min=1"`
}

// CreatePriceAlert adds a new BTC price alert for the user.
func (s *Service) CreatePriceAlert(ctx context.Context, userID string, input CreatePriceAlertInput) (*PriceAlert, error) {
	if input.Direction != "above" && input.Direction != "below" {
		return nil, fmt.Errorf("direction must be above or below")
	}

	var a PriceAlert
	err := s.db.QueryRow(ctx, `
		INSERT INTO price_alerts (user_id, direction, target_kes)
		VALUES ($1, $2, $3)
		RETURNING id, direction, target_kes, active,
			TO_CHAR(triggered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
	`, userID, input.Direction, input.TargetKES).
		Scan(&a.ID, &a.Direction, &a.TargetKES, &a.Active, &a.TriggeredAt, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create price alert: %w", err)
	}
	return &a, nil
}

// ListPriceAlerts returns the user's price alerts, most recent first.
func (s *Service) ListPriceAlerts(ctx context.Context, userID string) ([]*PriceAlert, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, direction, target_kes, active,
			TO_CHAR(triggered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			created_at
		FROM price_alerts
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*PriceAlert
	for rows.Next() {
		var a PriceAlert
		if err := rows.Scan(&a.ID, &a.Direction, &a.TargetKES, &a.Active, &a.TriggeredAt, &a.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

// DeletePriceAlert removes a price alert belonging to the user.
func (s *Service) DeletePriceAlert(ctx context.Context, userID, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
