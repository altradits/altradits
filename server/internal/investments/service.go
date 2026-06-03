package investments

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Position is a single investment holding.
type Position struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Institution  string    `json:"institution"`
	Type         string    `json:"type"`
	Principal    float64   `json:"principal"`
	CurrentValue float64   `json:"current_value"`
	Growth       float64   `json:"growth"`     // current_value - principal
	GrowthPct    float64   `json:"growth_pct"` // growth / principal * 100
	Currency     string    `json:"currency"`
	Notes        *string   `json:"notes"`
	IsActive     bool      `json:"is_active"`
	StartedAt    *string   `json:"started_at"`
	MaturesAt    *string   `json:"matures_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// Portfolio is the aggregated view of all investments.
type Portfolio struct {
	TotalPrincipal float64           `json:"total_principal"`
	TotalValue     float64           `json:"total_value"`
	TotalGrowth    float64           `json:"total_growth"`
	TotalGrowthPct float64           `json:"total_growth_pct"`
	Allocation     []AllocationSlice `json:"allocation"`
	FreedomScore   FreedomScore      `json:"freedom_score"`
	Positions      []*Position       `json:"positions"`
}

// AllocationSlice is one type's share of the total portfolio.
type AllocationSlice struct {
	Type    string  `json:"type"`
	Label   string  `json:"label"`
	Value   float64 `json:"value"`
	Percent float64 `json:"percent"`
}

// FreedomScore shows how close the user is to financial freedom.
type FreedomScore struct {
	MonthlyExpenses  float64 `json:"monthly_expenses"`
	EstimatedPassive float64 `json:"estimated_passive"` // rough annual return / 12
	CoveragePercent  float64 `json:"coverage_percent"`
	Message          string  `json:"message"`
}

// CreateInput is the request body for adding a position.
type CreateInput struct {
	Name         string  `json:"name"          binding:"required"`
	Institution  string  `json:"institution"`
	Type         string  `json:"type"          binding:"required"`
	Principal    float64 `json:"principal"     binding:"required,min=1"`
	CurrentValue float64 `json:"current_value"`
	Notes        string  `json:"notes"`
	StartedAt    string  `json:"started_at"` // YYYY-MM-DD
	MaturesAt    string  `json:"matures_at"` // YYYY-MM-DD
}

// UpdateInput is the request body for updating a position's current value.
type UpdateInput struct {
	CurrentValue float64 `json:"current_value" binding:"required,min=0"`
	Notes        string  `json:"notes"`
}

// typeLabel maps investment type codes to human-readable labels.
var typeLabel = map[string]string{
	"mmf":    "Money Market",
	"tbill":  "Treasury Bills",
	"bond":   "Bonds",
	"stock":  "Stocks",
	"etf":    "ETFs",
	"sacco":  "SACCO",
	"fixed":  "Fixed Deposit",
	"crypto": "Crypto",
	"other":  "Other",
}

// estimatedAnnualReturn gives a rough annual return rate by asset type.
// These are conservative estimates for the freedom score calculation.
var estimatedReturn = map[string]float64{
	"mmf":    0.12, // 12% p.a.
	"tbill":  0.145,
	"bond":   0.135,
	"stock":  0.10,
	"etf":    0.10,
	"sacco":  0.12,
	"fixed":  0.10,
	"crypto": 0.05, // conservative
	"other":  0.08,
}

// Service handles investment business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new investments service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// hydrate fills computed fields on a position.
func hydrate(p *Position) {
	p.Growth = p.CurrentValue - p.Principal
	if p.Principal > 0 {
		p.GrowthPct = (p.Growth / p.Principal) * 100
	}
}

// List returns all active investment positions.
func (s *Service) List(ctx context.Context) ([]*Position, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			id::text, name, COALESCE(institution,''), type::text,
			principal, current_value, currency,
			notes,
			is_active,
			TO_CHAR(started_at, 'YYYY-MM-DD'),
			TO_CHAR(matures_at, 'YYYY-MM-DD'),
			created_at
		FROM investments
		WHERE user_id IS NULL AND is_active = TRUE
		ORDER BY current_value DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []*Position
	for rows.Next() {
		var p Position
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Institution, &p.Type,
			&p.Principal, &p.CurrentValue, &p.Currency,
			&p.Notes, &p.IsActive, &p.StartedAt, &p.MaturesAt,
			&p.CreatedAt,
		); err != nil {
			return nil, err
		}
		hydrate(&p)
		positions = append(positions, &p)
	}
	return positions, rows.Err()
}

// Summary returns the portfolio-level aggregation.
func (s *Service) Summary(ctx context.Context) (*Portfolio, error) {
	positions, err := s.List(ctx)
	if err != nil {
		return nil, err
	}

	var totalPrincipal, totalValue float64
	typeValues := map[string]float64{}

	for _, p := range positions {
		totalPrincipal += p.Principal
		totalValue += p.CurrentValue
		typeValues[p.Type] += p.CurrentValue
	}

	totalGrowth := totalValue - totalPrincipal
	totalGrowthPct := 0.0
	if totalPrincipal > 0 {
		totalGrowthPct = (totalGrowth / totalPrincipal) * 100
	}

	// Build allocation slices
	var allocation []AllocationSlice
	for typ, val := range typeValues {
		pct := 0.0
		if totalValue > 0 {
			pct = (val / totalValue) * 100
		}
		label := typeLabel[typ]
		if label == "" {
			label = typ
		}
		allocation = append(allocation, AllocationSlice{
			Type:    typ,
			Label:   label,
			Value:   val,
			Percent: pct,
		})
	}

	// Calculate estimated passive income (annual return / 12)
	estimatedAnnual := 0.0
	for _, p := range positions {
		rate := estimatedReturn[p.Type]
		if rate == 0 {
			rate = 0.08
		}
		estimatedAnnual += p.CurrentValue * rate
	}
	estimatedMonthly := estimatedAnnual / 12

	// Get average monthly expenses from last 3 months of transactions
	var avgMonthlyExpenses float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) / 3.0
		FROM transactions
		WHERE created_at >= NOW() - INTERVAL '3 months'
		AND source != 'income'
	`).Scan(&avgMonthlyExpenses)

	coveragePct := 0.0
	if avgMonthlyExpenses > 0 {
		coveragePct = (estimatedMonthly / avgMonthlyExpenses) * 100
		if coveragePct > 100 {
			coveragePct = 100
		}
	}

	freedomMsg := buildFreedomMessage(coveragePct, estimatedMonthly, avgMonthlyExpenses)

	return &Portfolio{
		TotalPrincipal: totalPrincipal,
		TotalValue:     totalValue,
		TotalGrowth:    totalGrowth,
		TotalGrowthPct: totalGrowthPct,
		Allocation:     allocation,
		FreedomScore: FreedomScore{
			MonthlyExpenses:  avgMonthlyExpenses,
			EstimatedPassive: estimatedMonthly,
			CoveragePercent:  coveragePct,
			Message:          freedomMsg,
		},
		Positions: positions,
	}, nil
}

// Create adds a new investment position.
func (s *Service) Create(ctx context.Context, input CreateInput) (*Position, error) {
	currentValue := input.CurrentValue
	if currentValue == 0 {
		currentValue = input.Principal
	}

	var startedAt, maturesAt *string
	if input.StartedAt != "" {
		startedAt = &input.StartedAt
	}
	if input.MaturesAt != "" {
		maturesAt = &input.MaturesAt
	}

	var notes *string
	if input.Notes != "" {
		notes = &input.Notes
	}

	var p Position
	err := s.db.QueryRow(ctx, `
		INSERT INTO investments
			(name, institution, type, principal, current_value, currency, notes, started_at, matures_at)
		VALUES ($1, $2, $3::investment_type, $4, $5, 'KES', $6, $7, $8)
		RETURNING
			id::text, name, COALESCE(institution,''), type::text,
			principal, current_value, currency,
			notes, is_active,
			TO_CHAR(started_at, 'YYYY-MM-DD'),
			TO_CHAR(matures_at, 'YYYY-MM-DD'),
			created_at
	`, input.Name, input.Institution, input.Type, input.Principal,
		currentValue, notes, startedAt, maturesAt).
		Scan(&p.ID, &p.Name, &p.Institution, &p.Type,
			&p.Principal, &p.CurrentValue, &p.Currency,
			&p.Notes, &p.IsActive, &p.StartedAt, &p.MaturesAt,
			&p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create investment: %w", err)
	}
	hydrate(&p)
	return &p, nil
}

// Update updates the current value of an investment.
func (s *Service) Update(ctx context.Context, id string, input UpdateInput) (*Position, error) {
	var p Position
	err := s.db.QueryRow(ctx, `
		UPDATE investments
		SET current_value = $2,
		    notes = COALESCE(NULLIF($3,''), notes),
		    updated_at = NOW()
		WHERE id = $1::uuid AND user_id IS NULL
		RETURNING
			id::text, name, COALESCE(institution,''), type::text,
			principal, current_value, currency,
			notes, is_active,
			TO_CHAR(started_at, 'YYYY-MM-DD'),
			TO_CHAR(matures_at, 'YYYY-MM-DD'),
			created_at
	`, id, input.CurrentValue, input.Notes).
		Scan(&p.ID, &p.Name, &p.Institution, &p.Type,
			&p.Principal, &p.CurrentValue, &p.Currency,
			&p.Notes, &p.IsActive, &p.StartedAt, &p.MaturesAt,
			&p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to update investment: %w", err)
	}
	hydrate(&p)
	return &p, nil
}

// Delete soft-deletes an investment by setting is_active = false.
func (s *Service) Delete(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE investments SET is_active = FALSE, updated_at = NOW()
		WHERE id = $1::uuid AND user_id IS NULL
	`, id)
	return err
}

// GetByID retrieves an investment by its ID.
func (s *Service) GetByID(ctx context.Context, id string) (*Position, error) {
	var p Position
	err := s.db.QueryRow(ctx, `
		SELECT
			id::text, name, COALESCE(institution,''), type::text,
			principal, current_value, currency,
			notes,
			is_active,
			TO_CHAR(started_at, 'YYYY-MM-DD'),
			TO_CHAR(matures_at, 'YYYY-MM-DD'),
			created_at
		FROM investments
		WHERE id = $1 AND user_id IS NULL
	`).Scan(
		&p.ID, &p.Name, &p.Institution, &p.Type,
		&p.Principal, &p.CurrentValue, &p.Currency,
		&p.Notes, &p.IsActive, &p.StartedAt, &p.MaturesAt,
		&p.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	hydrate(&p)
	return &p, nil
}

// ErrNotFound is returned when an investment is not found.
var ErrNotFound = newNotFoundError("investment")

type notFoundError struct {
	entity string
}

func newNotFoundError(entity string) error {
	return &notFoundError{entity: entity}
}

func (e *notFoundError) Error() string {
	return e.entity + " not found"
}

// buildFreedomMessage returns a calm, plain-language freedom status.
func buildFreedomMessage(pct, passive, expenses float64) string {
	switch {
	case expenses == 0:
		return "Start tracking your spending to see your freedom timeline."
	case pct >= 100:
		return "Your investments could cover your monthly expenses. 🌱"
	case pct >= 75:
		return fmt.Sprintf(
			"Your money is working — covering %.0f%% of monthly expenses.",
			pct)
	case pct >= 50:
		return fmt.Sprintf(
			"Halfway there. KES %.0f/mo passive income, KES %.0f/mo expenses.",
			passive, expenses)
	case pct >= 25:
		return fmt.Sprintf(
			"Your investments cover %.0f%% of expenses. Keep growing.", pct)
	default:
		return "Every investment compounds over time. This is the beginning. 🌱"
	}
}
