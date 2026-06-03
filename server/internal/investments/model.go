package investments

import (
	"time"
)

// Investment represents a user's investment position.
type Investment struct {
	ID             string     `json:"id" db:"id"`
	UserID         string     `json:"user_id,omitempty" db:"user_id"`
	Type           string     `json:"type" db:"type"` // e.g., mmf, tbill, bond, stock, etf, saccos, fixed, crypto, other
	Name           string     `json:"name" db:"name"`
	Institution    string     `json:"institution,omitempty" db:"institution"`
	CurrentValue   float64    `json:"current_value" db:"current_value"`
	InvestedAmount float64    `json:"invested_amount" db:"principal"` // Note: mapping to principal column
	Currency       string     `json:"currency,omitempty" db:"currency"`
	Notes          string     `json:"notes,omitempty" db:"notes"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	StartedAt      *time.Time `json:"started_at,omitempty" db:"started_at"`
	MaturesAt      *time.Time `json:"matures_at,omitempty" db:"matures_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}
