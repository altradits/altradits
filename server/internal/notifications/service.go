package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Notification is a single notification item.
type Notification struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Title     string                 `json:"title"`
	Body      string                 `json:"body"`
	Status    string                 `json:"status"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt time.Time              `json:"created_at"`
	ReadAt    *string                `json:"read_at"`
}

// Preferences holds the user's notification settings.
type Preferences struct {
	BedtimeReminder     bool   `json:"bedtime_reminder"`
	BedtimeReminderTime string `json:"bedtime_reminder_time"`
	BillApproaching     bool   `json:"bill_approaching"`
	GoalMilestone       bool   `json:"goal_milestone"`
	StreakAtRisk        bool   `json:"streak_at_risk"`
	WeeklySummary       bool   `json:"weekly_summary"`
	WeeklySummaryDay    int    `json:"weekly_summary_day"`
	QuietHoursStart     string `json:"quiet_hours_start"`
	QuietHoursEnd       string `json:"quiet_hours_end"`
}

// PreferencesInput is the request body for updating preferences.
type PreferencesInput struct {
	BedtimeReminder     *bool  `json:"bedtime_reminder"`
	BedtimeReminderTime string `json:"bedtime_reminder_time"`
	BillApproaching     *bool  `json:"bill_approaching"`
	GoalMilestone       *bool  `json:"goal_milestone"`
	StreakAtRisk        *bool  `json:"streak_at_risk"`
	WeeklySummary       *bool  `json:"weekly_summary"`
	QuietHoursStart     string `json:"quiet_hours_start"`
	QuietHoursEnd       string `json:"quiet_hours_end"`
}

// Service handles notification logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new notifications service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// Send creates a new notification for a user.
// It checks quiet hours and user preferences before creating.
func (s *Service) Send(ctx context.Context, userID, notifType, title, body string, metadata map[string]interface{}) error {
	if s.isQuietHours(ctx, userID) {
		return nil
	}

	if !s.isEnabled(ctx, userID, notifType) {
		return nil
	}

	var recentCount int
	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE user_id = $1::uuid
		  AND type = $2::notification_type
		  AND title = $3
		  AND created_at > NOW() - INTERVAL '6 hours'
	`, userID, notifType, title).Scan(&recentCount)
	if recentCount > 0 {
		return nil
	}

	metaJSON := []byte("{}")
	if metadata != nil {
		if encoded, err := json.Marshal(metadata); err == nil {
			metaJSON = encoded
		}
	}

	_, err := s.db.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, metadata, expires_at)
		VALUES ($1::uuid, $2::notification_type, $3, $4, $5, NOW() + INTERVAL '7 days')
	`, userID, notifType, title, body, metaJSON)
	return err
}

// List returns recent notifications for a user.
func (s *Service) List(ctx context.Context, userID string, limit int) ([]*Notification, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.db.Query(ctx, `
		SELECT id::text, type::text, title, body, status::text,
		       metadata, created_at,
		       TO_CHAR(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM notifications
		WHERE user_id = $1::uuid
		  AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Notification
	for rows.Next() {
		var n Notification
		var metaJSON []byte
		var readAt *string
		if err := rows.Scan(
			&n.ID, &n.Type, &n.Title, &n.Body, &n.Status,
			&metaJSON, &n.CreatedAt, &readAt,
		); err != nil {
			return nil, err
		}
		n.ReadAt = readAt
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &n.Metadata)
		}
		result = append(result, &n)
	}
	return result, rows.Err()
}

// UnreadCount returns the number of unread notifications.
func (s *Service) UnreadCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE user_id = $1::uuid AND status IN ('pending','delivered')
		AND (expires_at IS NULL OR expires_at > NOW())
	`, userID).Scan(&count)
	return count, err
}

// MarkRead marks a notification as read.
func (s *Service) MarkRead(ctx context.Context, userID, notifID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE notifications
		SET status = 'read', read_at = NOW()
		WHERE id = $1::uuid AND user_id = $2::uuid
	`, notifID, userID)
	return err
}

// MarkAllRead marks all notifications as read for a user.
func (s *Service) MarkAllRead(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE notifications
		SET status = 'read', read_at = NOW()
		WHERE user_id = $1::uuid AND status IN ('pending','delivered')
	`, userID)
	return err
}

// GetPreferences returns the user's notification preferences.
// Creates default preferences if none exist.
func (s *Service) GetPreferences(ctx context.Context, userID string) (*Preferences, error) {
	var p Preferences
	err := s.db.QueryRow(ctx, `
		SELECT
			bedtime_reminder,
			TO_CHAR(bedtime_reminder_time, 'HH24:MI'),
			bill_approaching,
			goal_milestone,
			streak_at_risk,
			weekly_summary,
			weekly_summary_day,
			TO_CHAR(quiet_hours_start, 'HH24:MI'),
			TO_CHAR(quiet_hours_end, 'HH24:MI')
		FROM notification_preferences
		WHERE user_id = $1::uuid
	`, userID).Scan(
		&p.BedtimeReminder, &p.BedtimeReminderTime,
		&p.BillApproaching, &p.GoalMilestone,
		&p.StreakAtRisk, &p.WeeklySummary, &p.WeeklySummaryDay,
		&p.QuietHoursStart, &p.QuietHoursEnd,
	)
	if err != nil {
		_, insertErr := s.db.Exec(ctx, `
			INSERT INTO notification_preferences (user_id)
			VALUES ($1::uuid)
			ON CONFLICT (user_id) DO NOTHING
		`, userID)
		if insertErr != nil {
			return nil, insertErr
		}
		return &Preferences{
			BedtimeReminder:     true,
			BedtimeReminderTime: "21:00",
			BillApproaching:     true,
			GoalMilestone:       true,
			StreakAtRisk:        true,
			WeeklySummary:       true,
			WeeklySummaryDay:    1,
			QuietHoursStart:     "22:00",
			QuietHoursEnd:       "07:00",
		}, nil
	}
	return &p, nil
}

// UpdatePreferences saves updated notification preferences.
func (s *Service) UpdatePreferences(ctx context.Context, userID string, input PreferencesInput) (*Preferences, error) {
	current, err := s.GetPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}

	if input.BedtimeReminder != nil {
		current.BedtimeReminder = *input.BedtimeReminder
	}
	if input.BedtimeReminderTime != "" {
		current.BedtimeReminderTime = input.BedtimeReminderTime
	}
	if input.BillApproaching != nil {
		current.BillApproaching = *input.BillApproaching
	}
	if input.GoalMilestone != nil {
		current.GoalMilestone = *input.GoalMilestone
	}
	if input.StreakAtRisk != nil {
		current.StreakAtRisk = *input.StreakAtRisk
	}
	if input.WeeklySummary != nil {
		current.WeeklySummary = *input.WeeklySummary
	}
	if input.QuietHoursStart != "" {
		current.QuietHoursStart = input.QuietHoursStart
	}
	if input.QuietHoursEnd != "" {
		current.QuietHoursEnd = input.QuietHoursEnd
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO notification_preferences
			(user_id, bedtime_reminder, bedtime_reminder_time,
			 bill_approaching, goal_milestone, streak_at_risk,
			 weekly_summary, quiet_hours_start, quiet_hours_end, updated_at)
		VALUES ($1::uuid, $2, $3::time, $4, $5, $6, $7, $8::time, $9::time, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			bedtime_reminder      = EXCLUDED.bedtime_reminder,
			bedtime_reminder_time = EXCLUDED.bedtime_reminder_time,
			bill_approaching      = EXCLUDED.bill_approaching,
			goal_milestone        = EXCLUDED.goal_milestone,
			streak_at_risk        = EXCLUDED.streak_at_risk,
			weekly_summary        = EXCLUDED.weekly_summary,
			quiet_hours_start     = EXCLUDED.quiet_hours_start,
			quiet_hours_end       = EXCLUDED.quiet_hours_end,
			updated_at            = NOW()
	`, userID,
		current.BedtimeReminder, current.BedtimeReminderTime,
		current.BillApproaching, current.GoalMilestone, current.StreakAtRisk,
		current.WeeklySummary,
		current.QuietHoursStart, current.QuietHoursEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to save preferences: %w", err)
	}

	return current, nil
}

// CheckAndSendBedtimeReminder sends a bedtime reminder if the user hasn't
// closed their day and it's past their reminder time.
func (s *Service) CheckAndSendBedtimeReminder(ctx context.Context, userID string) error {
	prefs, err := s.GetPreferences(ctx, userID)
	if err != nil || !prefs.BedtimeReminder {
		return nil
	}

	if time.Now().Format("15:04") < prefs.BedtimeReminderTime {
		return nil
	}

	today := time.Now().Format("2006-01-02")
	var closedAt *string
	_ = s.db.QueryRow(ctx, `
		SELECT TO_CHAR(closed_at, 'HH24:MI')
		FROM daily_snapshots
		WHERE user_id = $1::uuid AND snapshot_date = $2 AND closed_at IS NOT NULL
	`, userID, today).Scan(&closedAt)

	if closedAt != nil {
		return nil
	}

	return s.Send(ctx, userID, "bedtime_reminder",
		"Ready to close today? 🌙",
		"A few minutes of reflection makes tomorrow feel easier.",
		nil)
}

// CheckAndSendGoalMilestones checks all active goals and sends milestone
// notifications for any that have crossed 25%, 50%, 75%, or 100%.
func (s *Service) CheckAndSendGoalMilestones(ctx context.Context, userID string) error {
	prefs, err := s.GetPreferences(ctx, userID)
	if err != nil || !prefs.GoalMilestone {
		return nil
	}

	rows, err := s.db.Query(ctx, `
		SELECT id::text, name, emoji,
		       CASE WHEN target > 0 THEN (saved / target * 100) ELSE 0 END as pct
		FROM goals
		WHERE user_id = $1::uuid AND completed = FALSE AND target > 0
	`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	// Highest milestone first: a goal that jumps straight to 80% only
	// celebrates 75%, and milestones already celebrated are not repeated.
	milestones := []int{100, 75, 50, 25}
	for rows.Next() {
		var id, name, emoji string
		var pct float64
		if err := rows.Scan(&id, &name, &emoji, &pct); err != nil {
			continue
		}
		for _, m := range milestones {
			if pct < float64(m) {
				continue
			}
			var alreadySent bool
			_ = s.db.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM notifications
					WHERE user_id = $1::uuid AND type = 'goal_milestone'
					  AND metadata->>'goal_id' = $2 AND metadata->>'milestone' = $3
				)
			`, userID, id, fmt.Sprintf("%d", m)).Scan(&alreadySent)
			if !alreadySent {
				_ = s.Send(ctx, userID, "goal_milestone",
					fmt.Sprintf("%s %s is %d%% complete", emoji, name, m),
					fmt.Sprintf("You're %d%% of the way to your %s goal. One step at a time. 🌱", m, name),
					map[string]interface{}{"goal_id": id, "milestone": m})
			}
			break
		}
	}
	return rows.Err()
}

// CheckAndSendStreakAtRisk notifies the user if their streak is at risk today.
func (s *Service) CheckAndSendStreakAtRisk(ctx context.Context, userID string) error {
	prefs, err := s.GetPreferences(ctx, userID)
	if err != nil || !prefs.StreakAtRisk {
		return nil
	}

	var streakDays int
	var lastCheckin *string
	_ = s.db.QueryRow(ctx, `
		SELECT streak_days, TO_CHAR(last_checkin, 'YYYY-MM-DD')
		FROM companion_state WHERE user_id = $1::uuid
	`, userID).Scan(&streakDays, &lastCheckin)

	if streakDays < 2 {
		return nil
	}

	today := time.Now().Format("2006-01-02")
	if lastCheckin != nil && *lastCheckin == today {
		return nil
	}

	return s.Send(ctx, userID, "streak_at_risk",
		fmt.Sprintf("Your %d-day streak is waiting 🔥", streakDays),
		"Close your day before midnight to keep it going.",
		map[string]interface{}{"streak_days": streakDays})
}

// SendWeeklySummary sends a Monday morning summary notification.
func (s *Service) SendWeeklySummary(ctx context.Context, userID string) error {
	prefs, err := s.GetPreferences(ctx, userID)
	if err != nil || !prefs.WeeklySummary {
		return nil
	}

	var totalSpent float64
	var entryCount, bedtimeCount int
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0), COUNT(*)
		FROM transactions
		WHERE user_id = $1::uuid AND created_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&totalSpent, &entryCount)

	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM daily_snapshots
		WHERE user_id = $1::uuid
		  AND snapshot_date >= CURRENT_DATE - 7
		  AND closed_at IS NOT NULL
	`, userID).Scan(&bedtimeCount)

	body := fmt.Sprintf(
		"Last week: %d entries, KES %.0f tracked, %d evenings reflected. This week is fresh. 🌱",
		entryCount, totalSpent, bedtimeCount,
	)

	return s.Send(ctx, userID, "weekly_summary",
		"Your week in a glance",
		body,
		map[string]interface{}{
			"total_spent":   totalSpent,
			"entry_count":   entryCount,
			"bedtime_count": bedtimeCount,
		})
}

// CheckAndSendPriceAlerts checks the user's active BTC price alerts against
// the latest exchange rate, notifying and deactivating any that have been
// crossed.
func (s *Service) CheckAndSendPriceAlerts(ctx context.Context, userID string) error {
	if s.isQuietHours(ctx, userID) {
		return nil
	}

	var rate float64
	if err := s.db.QueryRow(ctx, `
		SELECT btc_to_kes FROM exchange_rates ORDER BY updated_at DESC LIMIT 1
	`).Scan(&rate); err != nil || rate <= 0 {
		return nil
	}

	rows, err := s.db.Query(ctx, `
		SELECT id::text, direction, target_kes FROM price_alerts
		WHERE user_id = $1::uuid AND active = TRUE
		  AND (
		    (direction = 'above' AND $2 >= target_kes)
		    OR (direction = 'below' AND $2 <= target_kes)
		  )
	`, userID, rate)
	if err != nil {
		return nil
	}
	defer rows.Close()

	type hit struct {
		id        string
		direction string
		target    float64
	}
	var hits []hit
	for rows.Next() {
		var h hit
		if err := rows.Scan(&h.id, &h.direction, &h.target); err != nil {
			continue
		}
		hits = append(hits, h)
	}
	if err := rows.Err(); err != nil {
		return nil
	}

	for _, h := range hits {
		verb := "risen above"
		if h.direction == "below" {
			verb = "fallen below"
		}
		title := fmt.Sprintf("₿ BTC has %s KES %.0f", verb, h.target)
		body := fmt.Sprintf("Bitcoin is now KES %.0f.", rate)

		if err := s.Send(ctx, userID, "price_alert", title, body, map[string]interface{}{
			"alert_id":   h.id,
			"direction":  h.direction,
			"target_kes": h.target,
			"rate_kes":   rate,
		}); err != nil {
			continue
		}

		_, _ = s.db.Exec(ctx, `
			UPDATE price_alerts SET active = FALSE, triggered_at = NOW()
			WHERE id = $1::uuid
		`, h.id)
	}
	return nil
}

func (s *Service) isQuietHours(ctx context.Context, userID string) bool {
	now := time.Now()
	var quietStart, quietEnd string
	err := s.db.QueryRow(ctx, `
		SELECT TO_CHAR(quiet_hours_start,'HH24:MI'), TO_CHAR(quiet_hours_end,'HH24:MI')
		FROM notification_preferences WHERE user_id = $1::uuid
	`, userID).Scan(&quietStart, &quietEnd)
	if err != nil {
		h := now.Hour()
		return h >= 22 || h < 7
	}

	currentHHMM := now.Format("15:04")
	if quietStart > quietEnd {
		return currentHHMM >= quietStart || currentHHMM < quietEnd
	}
	return currentHHMM >= quietStart && currentHHMM < quietEnd
}

func (s *Service) isEnabled(ctx context.Context, userID, notifType string) bool {
	prefs, err := s.GetPreferences(ctx, userID)
	if err != nil {
		return false
	}
	switch notifType {
	case "bedtime_reminder":
		return prefs.BedtimeReminder
	case "bill_approaching":
		return prefs.BillApproaching
	case "goal_milestone":
		return prefs.GoalMilestone
	case "streak_at_risk":
		return prefs.StreakAtRisk
	case "weekly_summary":
		return prefs.WeeklySummary
	default:
		return true
	}
}
