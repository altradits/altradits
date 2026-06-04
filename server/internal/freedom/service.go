package freedom

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Plan is the complete financial freedom response.
type Plan struct {
	CurrentState  CurrentState   `json:"current_state"`
	Target        Target         `json:"target"`
	Projection    []ProjectionYear `json:"projection"`
	FreedomYear   *int           `json:"freedom_year"`
	FreedomAge    *int           `json:"freedom_age"`
	Message       string         `json:"message"`
	Milestone     string         `json:"milestone"`
}

// CurrentState is the user's financial snapshot today.
type CurrentState struct {
	TotalInvested      float64 `json:"total_invested"`
	TotalValue         float64 `json:"total_value"`
	EstimatedPassive   float64 `json:"estimated_passive"`   // monthly
	AvgMonthlyExpenses float64 `json:"avg_monthly_expenses"`
	AvgMonthlySavings  float64 `json:"avg_monthly_savings"`
	CoveragePercent    float64 `json:"coverage_percent"`
}

// Target is what the user is aiming for.
type Target struct {
	MonthlySavings    float64 `json:"monthly_savings"`
	TargetPassive     float64 `json:"target_passive"`
	AssumedReturnPct  float64 `json:"assumed_return_pct"`
}

// ProjectionYear is one year in the freedom projection.
type ProjectionYear struct {
	Year           int     `json:"year"`
	YearsFromNow   int     `json:"years_from_now"`
	PortfolioValue float64 `json:"portfolio_value"`
	PassiveIncome  float64 `json:"passive_income"`  // monthly
	Expenses       float64 `json:"expenses"`          // monthly (flat, no inflation for simplicity)
	IsFreedom      bool    `json:"is_freedom"`
}

// TargetInput is the request body for setting a freedom target.
type TargetInput struct {
	MonthlySavings   float64 `json:"monthly_savings"   binding:"required,min=0"`
	TargetPassive    float64 `json:"target_passive"    binding:"required,min=0"`
	AssumedReturnPct float64 `json:"assumed_return_pct"`
}

// Service handles financial freedom calculations.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new freedom service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// GetPlan calculates and returns the full financial freedom plan.
func (s *Service) GetPlan(ctx context.Context) (*Plan, error) {
	now := time.Now()
	currentYear := now.Year()
	monthStart3 := time.Date(now.Year(), now.Month()-3, 1, 0, 0, 0, 0, now.Location())

	// Defaults when DB is unavailable
	totalInvested := 0.0
	totalValue := 0.0
	avgMonthlyExpenses := 50000.0 // KES 50k/mo default
	avgMonthlySavings := 0.0
	monthlySavings := 10000.0
	targetPassive := avgMonthlyExpenses
	returnPct := 12.0
	estimatedMonthly := 0.0
	var annualReturn float64

	if s.db != nil {
		// ── 1. Current portfolio value ────────────────────────────────────────
		_ = s.db.QueryRow(ctx, `
			SELECT COALESCE(SUM(principal),0), COALESCE(SUM(current_value),0)
			FROM investments
			WHERE user_id IS NULL AND is_active = TRUE
		`).Scan(&totalInvested, &totalValue)

		// ── 2. Average monthly expenses (last 3 months) ───────────────────────
		_ = s.db.QueryRow(ctx, `
			SELECT COALESCE(SUM(amount),0) / 3.0
			FROM transactions
			WHERE created_at >= $1
		`, monthStart3).Scan(&avgMonthlyExpenses)

		if avgMonthlyExpenses == 0 {
			avgMonthlyExpenses = 50000 // KES 50k/mo default
		}

		// ── 3. Average monthly savings (budget category) ──────────────────────
		_ = s.db.QueryRow(ctx, `
			SELECT COALESCE(amount, 0)
			FROM budgets
			WHERE category IN ('savings','investments') AND user_id IS NULL
			LIMIT 1
		`).Scan(&avgMonthlySavings)

		// ── 4. Load freedom target ────────────────────────────────────────────
		err := s.db.QueryRow(ctx, `
			SELECT monthly_savings, target_passive, assumed_return_pct
			FROM freedom_targets
			WHERE user_id IS NULL
		`).Scan(&monthlySavings, &targetPassive, &returnPct)
		if err != nil {
			monthlySavings = avgMonthlySavings
			if monthlySavings == 0 {
				monthlySavings = 10000
			}
			targetPassive = avgMonthlyExpenses
			returnPct = 12.0
		}

		annualReturn = returnPct / 100.0

		// ── 5. Estimated monthly passive income today ─────────────────────────
		var estimatedAnnual float64
		rows, err := s.db.Query(ctx, `
			SELECT type::text, COALESCE(SUM(current_value),0)
			FROM investments
			WHERE user_id IS NULL AND is_active = TRUE
			GROUP BY type
		`)
		if err == nil {
			defer rows.Close()
			returnByType := map[string]float64{
				"mmf": 0.12, "tbill": 0.145, "bond": 0.135,
				"stock": 0.10, "etf": 0.10, "sacco": 0.12,
				"fixed": 0.10, "crypto": 0.05, "other": 0.08,
			}
			for rows.Next() {
				var typStr string
				var val float64
				if rows.Scan(&typStr, &val) == nil {
					r := returnByType[typStr]
					if r == 0 {
						r = 0.10
					}
					estimatedAnnual += val * r
				}
			}
			rows.Close()
		}
		estimatedMonthly = estimatedAnnual / 12
	}

	coveragePct := 0.0
	if avgMonthlyExpenses > 0 {
		coveragePct = (estimatedMonthly / avgMonthlyExpenses) * 100
		if coveragePct > 100 {
			coveragePct = 100
		}
	}

	annualReturn = returnPct / 100.0

	// ── 6. Build projection (30 years max) ───────────────────────────────
	portfolio := totalValue
	annualSavings := monthlySavings * 12
	var projection []ProjectionYear
	var freedomYear *int
	var freedomYearsFromNow *int

	for y := 1; y <= 30; y++ {
		portfolio = portfolio*(1+annualReturn) + annualSavings
		monthlyPassive := (portfolio * annualReturn) / 12

		isFreedom := monthlyPassive >= targetPassive && targetPassive > 0
		if isFreedom && freedomYear == nil {
			yr := currentYear + y
			yfn := y
			freedomYear = &yr
			freedomYearsFromNow = &yfn
		}

		projection = append(projection, ProjectionYear{
			Year:           currentYear + y,
			YearsFromNow:   y,
			PortfolioValue: math.Round(portfolio),
			PassiveIncome:  math.Round(monthlyPassive),
			Expenses:       math.Round(avgMonthlyExpenses),
			IsFreedom:      isFreedom,
		})

		if freedomYearsFromNow != nil && y >= *freedomYearsFromNow+5 {
			break
		}
	}

	// ── 7. Build message ──────────────────────────────────────────────────
	msg, milestone := buildMessages(coveragePct, freedomYearsFromNow, estimatedMonthly, avgMonthlyExpenses)

	_ = freedomAge // unused for now — add birth year to users table in future

	return &Plan{
		CurrentState: CurrentState{
			TotalInvested:      totalInvested,
			TotalValue:         totalValue,
			EstimatedPassive:   estimatedMonthly,
			AvgMonthlyExpenses: avgMonthlyExpenses,
			AvgMonthlySavings:  avgMonthlySavings,
			CoveragePercent:    coveragePct,
		},
		Target: Target{
			MonthlySavings:   monthlySavings,
			TargetPassive:    targetPassive,
			AssumedReturnPct: returnPct,
		},
		Projection:  projection,
		FreedomYear: freedomYear,
		Message:     msg,
		Milestone:   milestone,
	}, nil
}

// SetTarget saves or updates the user's freedom target.
func (s *Service) SetTarget(ctx context.Context, input TargetInput) (*Target, error) {
	returnPct := input.AssumedReturnPct
	if returnPct <= 0 {
		returnPct = 12.0
	}

	if s.db == nil {
		return &Target{
			MonthlySavings:   input.MonthlySavings,
			TargetPassive:    input.TargetPassive,
			AssumedReturnPct: returnPct,
		}, nil
	}

	var existing bool
	_ = s.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM freedom_targets WHERE user_id IS NULL)`).Scan(&existing)

	var err error
	if existing {
		_, err = s.db.Exec(ctx, `
			UPDATE freedom_targets
			SET monthly_savings=$1, target_passive=$2, assumed_return_pct=$3, updated_at=NOW()
			WHERE user_id IS NULL
		`, input.MonthlySavings, input.TargetPassive, returnPct)
	} else {
		_, err = s.db.Exec(ctx, `
			INSERT INTO freedom_targets (monthly_savings, target_passive, assumed_return_pct)
			VALUES ($1, $2, $3)
		`, input.MonthlySavings, input.TargetPassive, returnPct)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to save target: %w", err)
	}

	return &Target{
		MonthlySavings:   input.MonthlySavings,
		TargetPassive:    input.TargetPassive,
		AssumedReturnPct: returnPct,
	}, nil
}

// buildMessages returns a calm, data-driven message and milestone.
func buildMessages(coveragePct float64, yearsToFreedom *int, passive, expenses float64) (string, string) {
	var msg, milestone string

	switch {
	case coveragePct >= 100:
		msg = "Your investments already cover your monthly expenses. 🌱"
		milestone = "Financial freedom — today."

	case coveragePct >= 75:
		msg = fmt.Sprintf(
			"Your money covers %.0f%% of monthly expenses. You are close.", coveragePct)
		milestone = "Three quarters of the way."

	case coveragePct >= 50:
		msg = fmt.Sprintf(
			"Halfway there. KES %.0f passive income per month against KES %.0f in expenses.",
			passive, expenses)
		milestone = "The halfway point."

	case coveragePct >= 25:
		msg = fmt.Sprintf(
			"Your investments cover %.0f%% of expenses. The momentum is real.", coveragePct)
		milestone = "A quarter covered."

	default:
		msg = "Every amount invested now compounds over time. This is how it starts. 🌱"
		milestone = "The beginning."
	}

	if yearsToFreedom != nil {
		if *yearsToFreedom == 1 {
			msg += " At this rate, freedom is within a year."
		} else if *yearsToFreedom <= 5 {
			msg += fmt.Sprintf(" At this rate, freedom is %d years away.", *yearsToFreedom)
		} else if *yearsToFreedom <= 10 {
			msg += fmt.Sprintf(
				" At this rate, the crossing point is in %d years.", *yearsToFreedom)
		}
	}

	return msg, milestone
}

// freedomAge is a placeholder — will use birth year from users table in future.
var freedomAge *int = nil
