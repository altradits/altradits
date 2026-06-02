package affordability

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CheckInput is the request body.
type CheckInput struct {
	Item   string  `json:"item"   binding:"required"`
	Amount float64 `json:"amount" binding:"required,min=1"`
}

// ComfortLevel describes how affordable something is.
type ComfortLevel string

const (
	ComfortGood    ComfortLevel = "good"
	ComfortCaution ComfortLevel = "caution"
	ComfortTight   ComfortLevel = "tight"
)

// CheckResult is the affordability response.
type CheckResult struct {
	Item           string       `json:"item"`
	Amount         float64      `json:"amount"`
	Comfort        ComfortLevel `json:"comfort"`
	Message        string       `json:"message"`
	Detail         string       `json:"detail"`
	BudgetHeadroom float64      `json:"budget_headroom"`
	GoalImpact     *GoalImpact  `json:"goal_impact,omitempty"`
}

// GoalImpact describes how the purchase affects the nearest active goal.
type GoalImpact struct {
	GoalName    string  `json:"goal_name"`
	GoalEmoji   string  `json:"goal_emoji"`
	CurrentPct  float64 `json:"current_pct"`
	AfterPct    float64 `json:"after_pct"`
	DaysDelayed int     `json:"days_delayed"`
}

// Service handles affordability checks.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new affordability service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Check evaluates whether the user can afford an item.
func (s *Service) Check(ctx context.Context, input CheckInput) (*CheckResult, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// ── 1. Total budget allocated this month ─────────────────────────────
	var totalAllocated float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM budgets WHERE user_id IS NULL
	`).Scan(&totalAllocated)

	// ── 2. Total spent this month ─────────────────────────────────────────
	var totalSpent float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0)
		FROM transactions
		WHERE created_at >= $1
	`, monthStart).Scan(&totalSpent)

	// ── 3. Budget headroom ────────────────────────────────────────────────
	headroom := totalAllocated - totalSpent

	// ── 4. Days remaining this month ─────────────────────────────────────
	daysInMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Day()
	daysRemaining := daysInMonth - now.Day() + 1
	dailyBudget := 0.0
	if daysRemaining > 0 && totalAllocated > 0 {
		dailyBudget = (headroom) / float64(daysRemaining)
	}

	// ── 5. Nearest active goal ────────────────────────────────────────────
	var goalID, goalName, goalEmoji string
	var goalTarget, goalSaved float64
	err := s.db.QueryRow(ctx, `
		SELECT id::text, name, emoji, target, saved
		FROM goals
		WHERE user_id IS NULL AND completed = FALSE AND target > 0
		ORDER BY (saved / target) DESC
		LIMIT 1
	`).Scan(&goalID, &goalName, &goalEmoji, &goalTarget, &goalSaved)

	var goalImpact *GoalImpact
	if err == nil && goalTarget > 0 {
		currentPct := (goalSaved / goalTarget) * 100
		// If the user spent this amount, how much would they have left for the goal?
		remaining := goalTarget - goalSaved
		daysToGoal := 0
		if dailyBudget > 0 && remaining > 0 {
			daysToGoal = int(remaining / dailyBudget)
		}
		daysDelayed := 0
		if dailyBudget > 0 {
			daysDelayed = int(input.Amount / dailyBudget)
		}
		afterSaved := goalSaved // purchase doesn't reduce goal savings directly
		afterPct := (afterSaved / goalTarget) * 100
		_ = daysToGoal
		_ = goalID

		goalImpact = &GoalImpact{
			GoalName:    goalName,
			GoalEmoji:   goalEmoji,
			CurrentPct:  currentPct,
			AfterPct:    afterPct,
			DaysDelayed: daysDelayed,
		}
	}

	// ── 6. Determine comfort level ────────────────────────────────────────
	var comfort ComfortLevel
	var message, detail string

	percentOfHeadroom := 0.0
	if headroom > 0 {
		percentOfHeadroom = (input.Amount / headroom) * 100
	}

	switch {
	case headroom <= 0:
		// Already over budget
		comfort = ComfortTight
		message = "This month is already feeling full."
		detail = fmt.Sprintf(
			"You have spent KES %.0f against a KES %.0f plan. "+
				"Adding KES %.0f would push things further.",
			totalSpent, totalAllocated, input.Amount,
		)

	case input.Amount > headroom:
		// Purchase exceeds remaining headroom
		comfort = ComfortTight
		message = "This week feels tight for that."
		detail = fmt.Sprintf(
			"Your remaining headroom this month is KES %.0f. "+
				"KES %.0f would go beyond that — next month may be easier.",
			headroom, input.Amount,
		)

	case percentOfHeadroom > 50:
		// Purchase is more than half the remaining headroom
		comfort = ComfortCaution
		message = "This looks okay, but it's a big chunk of what's left."
		detail = fmt.Sprintf(
			"KES %.0f is %.0f%% of your remaining KES %.0f this month. "+
				"It's doable — just worth knowing.",
			input.Amount, percentOfHeadroom, headroom,
		)

	case percentOfHeadroom > 25:
		// Purchase is noticeable but manageable
		comfort = ComfortCaution
		message = "This looks manageable."
		detail = fmt.Sprintf(
			"KES %.0f fits within your plan — you'd have KES %.0f left "+
				"for the rest of the month.",
			input.Amount, headroom-input.Amount,
		)

	default:
		// Comfortable
		comfort = ComfortGood
		message = "This looks comfortable."
		detail = fmt.Sprintf(
			"KES %.0f fits well. You'd still have KES %.0f headroom "+
				"for the rest of the month.",
			input.Amount, headroom-input.Amount,
		)
	}

	// Add goal context to detail if relevant
	if goalImpact != nil && goalImpact.DaysDelayed > 0 && comfort != ComfortTight {
		detail += fmt.Sprintf(
			" Buying this may slow your %s %s goal by roughly %d day%s.",
			goalImpact.GoalEmoji, goalImpact.GoalName,
			goalImpact.DaysDelayed,
			func() string {
				if goalImpact.DaysDelayed == 1 {
					return ""
				}
				return "s"
			}(),
		)
	}

	return &CheckResult{
		Item:           input.Item,
		Amount:         input.Amount,
		Comfort:        comfort,
		Message:        message,
		Detail:         detail,
		BudgetHeadroom: headroom,
		GoalImpact:     goalImpact,
	}, nil
}
