package dashboard

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Summary is the complete dashboard payload.
type Summary struct {
	Date        string         `json:"date"`
	Greeting    string         `json:"greeting"`
	Today       TodaySummary   `json:"today"`
	Budget      BudgetSnapshot `json:"budget"`
	Goals       GoalsSnapshot  `json:"goals"`
	BedtimeDone bool           `json:"bedtime_done"`
	Streak      int            `json:"streak"`
}

// TodaySummary is today's spending at a glance.
type TodaySummary struct {
	TotalSpent  float64      `json:"total_spent"`
	EntryCount  int          `json:"entry_count"`
	TopCategory string       `json:"top_category"`
	RecentItems []RecentItem `json:"recent_items"`
}

// RecentItem is a single recent transaction for the dashboard feed.
type RecentItem struct {
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	CreatedAt   string  `json:"created_at"`
}

// BudgetSnapshot shows the top categories by spend this month.
type BudgetSnapshot struct {
	TotalAllocated float64          `json:"total_allocated"`
	TotalSpent     float64          `json:"total_spent"`
	Percent        float64          `json:"percent"`
	TopCategories  []CategoryHealth `json:"top_categories"`
}

// CategoryHealth is one budget category for the dashboard.
type CategoryHealth struct {
	Category  string  `json:"category"`
	Allocated float64 `json:"allocated"`
	Spent     float64 `json:"spent"`
	Percent   float64 `json:"percent"`
}

// GoalsSnapshot shows active goals ordered by proximity to completion.
type GoalsSnapshot struct {
	ActiveCount int           `json:"active_count"`
	Goals       []GoalPreview `json:"goals"`
}

// GoalPreview is a condensed goal for the dashboard.
type GoalPreview struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Emoji   string  `json:"emoji"`
	Percent float64 `json:"percent"`
	Saved   float64 `json:"saved"`
	Target  float64 `json:"target"`
}

// Service handles dashboard aggregation.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new dashboard service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// greeting returns a time-appropriate greeting.
func greeting() string {
	hour := time.Now().Hour()
	switch {
	case hour < 12:
		return "Good morning."
	case hour < 17:
		return "Good afternoon."
	case hour < 21:
		return "Good evening."
	default:
		return "Good night."
	}
}

// Get assembles the full dashboard summary.
func (s *Service) Get(ctx context.Context) (*Summary, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	summary := &Summary{
		Date:     today,
		Greeting: greeting(),
	}

	// ── Today's spending ──────────────────────────────────────────────────
	var totalSpent float64
	var entryCount int
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0), COUNT(*)
		FROM transactions
		WHERE DATE(created_at) = $1
	`, today).Scan(&totalSpent, &entryCount)

	// Top category today
	var topCategory string
	_ = s.db.QueryRow(ctx, `
		SELECT category
		FROM transactions
		WHERE DATE(created_at) = $1
		GROUP BY category
		ORDER BY SUM(amount) DESC
		LIMIT 1
	`, today).Scan(&topCategory)

	// Recent items (last 3)
	rows, err := s.db.Query(ctx, `
		SELECT description, amount, category,
		       TO_CHAR(created_at AT TIME ZONE 'UTC', 'HH24:MI') as time
		FROM transactions
		WHERE DATE(created_at) = $1
		ORDER BY created_at DESC
		LIMIT 3
	`, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recentItems []RecentItem
	for rows.Next() {
		var item RecentItem
		if err := rows.Scan(&item.Description, &item.Amount,
			&item.Category, &item.CreatedAt); err != nil {
			return nil, err
		}
		recentItems = append(recentItems, item)
	}
	rows.Close()

	summary.Today = TodaySummary{
		TotalSpent:  totalSpent,
		EntryCount:  entryCount,
		TopCategory: topCategory,
		RecentItems: recentItems,
	}

	// ── Budget snapshot ───────────────────────────────────────────────────
	var totalAllocated, totalSpentMonth float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM budgets WHERE user_id IS NULL
	`).Scan(&totalAllocated)

	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0)
		FROM transactions
		WHERE created_at >= $1
	`, monthStart).Scan(&totalSpentMonth)

	// Top 3 categories by spend this month
	catRows, err := s.db.Query(ctx, `
		SELECT
			t.category,
			COALESCE(b.amount, 0) as allocated,
			COALESCE(SUM(t.amount), 0) as spent
		FROM transactions t
		LEFT JOIN budgets b ON b.category = t.category AND b.user_id IS NULL
		WHERE t.created_at >= $1
		GROUP BY t.category, b.amount
		ORDER BY spent DESC
		LIMIT 3
	`, monthStart)
	if err != nil {
		return nil, err
	}
	defer catRows.Close()

	var topCategories []CategoryHealth
	for catRows.Next() {
		var ch CategoryHealth
		if err := catRows.Scan(&ch.Category, &ch.Allocated, &ch.Spent); err != nil {
			return nil, err
		}
		if ch.Allocated > 0 {
			ch.Percent = (ch.Spent / ch.Allocated) * 100
			if ch.Percent > 100 {
				ch.Percent = 100
			}
		}
		topCategories = append(topCategories, ch)
	}
	catRows.Close()

	budgetPercent := 0.0
	if totalAllocated > 0 {
		budgetPercent = (totalSpentMonth / totalAllocated) * 100
		if budgetPercent > 100 {
			budgetPercent = 100
		}
	}

	summary.Budget = BudgetSnapshot{
		TotalAllocated: totalAllocated,
		TotalSpent:     totalSpentMonth,
		Percent:        budgetPercent,
		TopCategories:  topCategories,
	}

	// ── Goals snapshot ────────────────────────────────────────────────────
	goalRows, err := s.db.Query(ctx, `
		SELECT id::text, name, emoji, target, saved
		FROM goals
		WHERE user_id IS NULL AND completed = FALSE
		ORDER BY (saved / NULLIF(target, 0)) DESC
		LIMIT 3
	`)
	if err != nil {
		return nil, err
	}
	defer goalRows.Close()

	var goalPreviews []GoalPreview
	var activeCount int
	for goalRows.Next() {
		var g GoalPreview
		if err := goalRows.Scan(&g.ID, &g.Name, &g.Emoji,
			&g.Target, &g.Saved); err != nil {
			return nil, err
		}
		if g.Target > 0 {
			g.Percent = (g.Saved / g.Target) * 100
		}
		goalPreviews = append(goalPreviews, g)
		activeCount++
	}
	goalRows.Close()

	// Get total active count
	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM goals WHERE user_id IS NULL AND completed = FALSE
	`).Scan(&activeCount)

	summary.Goals = GoalsSnapshot{
		ActiveCount: activeCount,
		Goals:       goalPreviews,
	}

	// ── Bedtime status ────────────────────────────────────────────────────
	var closedAt *string
	_ = s.db.QueryRow(ctx, `
		SELECT TO_CHAR(closed_at, 'HH24:MI')
		FROM daily_snapshots
		WHERE snapshot_date = $1 AND user_id IS NULL AND closed_at IS NOT NULL
	`, today).Scan(&closedAt)
	summary.BedtimeDone = closedAt != nil

	// ── Streak (consecutive days closed) ─────────────────────────────────
	var streak int
	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM (
			SELECT snapshot_date,
				   snapshot_date - ROW_NUMBER() OVER (ORDER BY snapshot_date DESC)::integer AS grp
			FROM daily_snapshots
			WHERE user_id IS NULL AND closed_at IS NOT NULL
			ORDER BY snapshot_date DESC
		) t
		WHERE grp = (
			SELECT snapshot_date - 1
			FROM daily_snapshots
			WHERE user_id IS NULL AND closed_at IS NOT NULL
			ORDER BY snapshot_date DESC
			LIMIT 1
		)
	`).Scan(&streak)
	summary.Streak = streak

	return summary, nil
}
