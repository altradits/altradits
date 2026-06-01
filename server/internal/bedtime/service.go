package bedtime

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DayReview is the spending summary for today — shown in step 1.
type DayReview struct {
	Date          string            `json:"date"`
	TotalSpent    float64           `json:"total_spent"`
	TotalEntries  int               `json:"total_entries"`
	Categories    []CategorySummary `json:"categories"`
	AlreadyClosed bool              `json:"already_closed"`
	SnapshotID    *string           `json:"snapshot_id"`
}

// CategorySummary is a spending breakdown by category for today.
type CategorySummary struct {
	Category string  `json:"category"`
	Amount   float64 `json:"amount"`
	Count    int     `json:"count"`
}

// CoachingNote is a calm observation based on today's spending.
type CoachingNote struct {
	Note         string `json:"note"`
	TomorrowHint string `json:"tomorrow_hint"`
}

// CloseInput is the request body for closing the day.
type CloseInput struct {
	Reflection string `json:"reflection"`
	Mood       string `json:"mood"`
}

// Snapshot is a saved daily record.
type Snapshot struct {
	ID              string  `json:"id"`
	SnapshotDate    string  `json:"snapshot_date"`
	TotalSpent      float64 `json:"total_spent"`
	TotalEntries    int     `json:"total_entries"`
	TopCategory     *string `json:"top_category"`
	Reflection      *string `json:"reflection"`
	Mood            *string `json:"mood"`
	CoachingNote    *string `json:"coaching_note"`
	TomorrowPreview *string `json:"tomorrow_preview"`
	ClosedAt        *string `json:"closed_at"`
}

// Service handles bedtime business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new bedtime service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// TodayReview returns a spending summary for today.
func (s *Service) TodayReview(ctx context.Context) (*DayReview, error) {
	today := time.Now().Format("2006-01-02")

	// Check if already closed today
	var snapshotID *string
	var closedAt *string
	_ = s.db.QueryRow(ctx, `
		SELECT id::text, TO_CHAR(closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM daily_snapshots
		WHERE snapshot_date = $1 AND user_id IS NULL
	`, today).Scan(&snapshotID, &closedAt)

	alreadyClosed := closedAt != nil

	// Get today's totals
	var totalSpent float64
	var totalEntries int
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0), COUNT(*)
		FROM transactions
		WHERE DATE(created_at AT TIME ZONE 'Africa/Nairobi') = $1
	`, today).Scan(&totalSpent, &totalEntries)

	// Get category breakdown
	rows, err := s.db.Query(ctx, `
		SELECT category, SUM(amount) as total, COUNT(*) as cnt
		FROM transactions
		WHERE DATE(created_at AT TIME ZONE 'Africa/Nairobi') = $1
		GROUP BY category
		ORDER BY total DESC
	`, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []CategorySummary
	for rows.Next() {
		var cs CategorySummary
		if err := rows.Scan(&cs.Category, &cs.Amount, &cs.Count); err != nil {
			return nil, err
		}
		categories = append(categories, cs)
	}

	return &DayReview{
		Date:          today,
		TotalSpent:    totalSpent,
		TotalEntries:  totalEntries,
		Categories:    categories,
		AlreadyClosed: alreadyClosed,
		SnapshotID:    snapshotID,
	}, nil
}

// GenerateCoaching produces a calm, data-driven coaching note without calling an LLM.
// In Phase 5+, this will be replaced by the AI coaching engine.
func (s *Service) GenerateCoaching(ctx context.Context, review *DayReview) *CoachingNote {
	if review.TotalEntries == 0 {
		return &CoachingNote{
			Note:         "Quiet day — sometimes that's exactly right. 🌙",
			TomorrowHint: "Tomorrow is a fresh start. Ready when you are.",
		}
	}

	topCat := ""
	if len(review.Categories) > 0 {
		topCat = review.Categories[0].Category
	}

	dayOfWeek := time.Now().Weekday().String()
	isWeekend := dayOfWeek == "Saturday" || dayOfWeek == "Sunday"

	var note, hint string

	switch {
	case review.TotalEntries == 1:
		note = "One entry today. Small day, honest record. That counts. 🌱"
		hint = "Tomorrow: keep the habit going."

	case topCat == "food":
		note = fmt.Sprintf("Food was the main chapter today — %d entries. Meals matter. 🍽️", review.TotalEntries)
		hint = "Transport and bills tend to follow their own rhythm. Worth a glance tomorrow."

	case topCat == "investments":
		note = "You put money toward growth today. That's a quiet kind of discipline. 🌱"
		hint = "Consistency compounds. Same time tomorrow?"

	case topCat == "family":
		note = "Family spending today. Some money moves that way on purpose. 👨‍👩‍👧"
		hint = "Check your goals tomorrow — make sure your own savings are still moving."

	case topCat == "bills":
		note = "Bills handled. The unsexy part of a solid financial life. ✅"
		hint = "With bills out of the way, tomorrow is cleaner."

	case topCat == "transport":
		note = "Transport was the main spend today. Some days are just movement. 🚗"
		hint = "If this week has felt heavy on transport, worth reviewing the pattern."

	case isWeekend:
		note = "Weekends tend to feel fuller — yours did. That's allowed. 🌙"
		hint = "Monday usually resets the rhythm."

	default:
		note = fmt.Sprintf("You tracked %d moments today. That awareness is the foundation. 🌱", review.TotalEntries)
		hint = "Tiny progress compounds. Same time tomorrow."
	}

	return &CoachingNote{Note: note, TomorrowHint: hint}
}

// Close saves the daily snapshot and marks the day as closed.
func (s *Service) Close(ctx context.Context, input CloseInput) (*Snapshot, error) {
	review, err := s.TodayReview(ctx)
	if err != nil {
		return nil, err
	}

	coaching := s.GenerateCoaching(ctx, review)
	today := time.Now().Format("2006-01-02")

	var topCategory *string
	if len(review.Categories) > 0 {
		topCategory = &review.Categories[0].Category
	}

	var reflection *string
	if input.Reflection != "" {
		reflection = &input.Reflection
	}

	var mood *string
	if input.Mood != "" {
		mood = &input.Mood
	}

	var snap Snapshot
	err = s.db.QueryRow(ctx, `
		INSERT INTO daily_snapshots
			(snapshot_date, total_spent, total_entries, top_category,
			 reflection, mood, coaching_note, tomorrow_preview, closed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (snapshot_date) WHERE user_id IS NULL
		DO UPDATE SET
			total_spent      = EXCLUDED.total_spent,
			total_entries    = EXCLUDED.total_entries,
			top_category     = EXCLUDED.top_category,
			reflection       = EXCLUDED.reflection,
			mood             = EXCLUDED.mood,
			coaching_note    = EXCLUDED.coaching_note,
			tomorrow_preview = EXCLUDED.tomorrow_preview,
			closed_at        = NOW()
		RETURNING
			id::text, snapshot_date::text, total_spent, total_entries,
			top_category, reflection, mood, coaching_note, tomorrow_preview,
			TO_CHAR(closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, today, review.TotalSpent, review.TotalEntries, topCategory,
		reflection, mood, coaching.Note, coaching.TomorrowHint).
		Scan(&snap.ID, &snap.SnapshotDate, &snap.TotalSpent, &snap.TotalEntries,
			&snap.TopCategory, &snap.Reflection, &snap.Mood,
			&snap.CoachingNote, &snap.TomorrowPreview, &snap.ClosedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to close day: %w", err)
	}

	return &snap, nil
}

// History returns the last N daily snapshots.
func (s *Service) History(ctx context.Context, limit int) ([]*Snapshot, error) {
	if limit <= 0 || limit > 30 {
		limit = 7
	}
	rows, err := s.db.Query(ctx, `
		SELECT id::text, snapshot_date::text, total_spent, total_entries,
		       top_category, reflection, mood, coaching_note, tomorrow_preview,
		       TO_CHAR(closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM daily_snapshots
		WHERE user_id IS NULL
		ORDER BY snapshot_date DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Snapshot
	for rows.Next() {
		var s Snapshot
		if err := rows.Scan(&s.ID, &s.SnapshotDate, &s.TotalSpent, &s.TotalEntries,
			&s.TopCategory, &s.Reflection, &s.Mood, &s.CoachingNote,
			&s.TomorrowPreview, &s.ClosedAt); err != nil {
			return nil, err
		}
		result = append(result, &s)
	}
	return result, rows.Err()
}
