package companion

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// XP awards per behavior
const (
	XPBedtime    = 15 // completing a bedtime logoff
	XPCapture    = 3  // logging a transaction
	XPGoal       = 10 // contributing to a goal
	XPReflection = 5  // writing a reflection note
	XPStreak3    = 20 // 3-day streak bonus
	XPStreak7    = 50 // 7-day streak bonus
	XPStreak30   = 100 // 30-day streak bonus
)

// XP thresholds for each level
var levelThresholds = map[string]int{
	"sprout":     50,
	"growing":    150,
	"thriving":   300,
	"flourishing": 999999, // no cap
}

// levelOrder for progression
var levelOrder = []string{"sprout", "growing", "thriving", "flourishing"}

// CompanionState is the full companion data.
type CompanionState struct {
	ID            string      `json:"id"`
	Companion     string      `json:"companion"`
	Level         string      `json:"level"`
	LevelLabel    string      `json:"level_label"`
	XP            int         `json:"xp"`
	XPToNext      int         `json:"xp_to_next"`
	XPPercent     float64     `json:"xp_percent"`
	StreakDays    int         `json:"streak_days"`
	LongestStreak int         `json:"longest_streak"`
	TotalCheckins int         `json:"total_checkins"`
	LastCheckin   *string     `json:"last_checkin"`
	Milestones    []Milestone `json:"milestones"`
	Emoji         string      `json:"emoji"`
	Greeting      string      `json:"greeting"`
}

// Milestone is a behavioral achievement.
type Milestone struct {
	Label string `json:"label"`
	Emoji string `json:"emoji"`
	Date  string `json:"date"`
}

// CheckinInput is the request body for awarding XP.
type CheckinInput struct {
	EventType string `json:"event_type" binding:"required"`
	Note      string `json:"note"`
}

// ChooseInput is the request body for selecting a companion.
type ChooseInput struct {
	Companion string `json:"companion" binding:"required"`
}

// Service handles companion business logic.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new companion service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// companionEmoji returns the emoji for a companion type and level.
func companionEmoji(companion, level string) string {
	emojis := map[string]map[string]string{
		"seed": {
			"sprout":     "🌱",
			"growing":    "🌿",
			"thriving":   "🌳",
			"flourishing": "🌲",
		},
		"puppy": {
			"sprout":     "🐾",
			"growing":    "🐶",
			"thriving":   "🐕",
			"flourishing": "🦮",
		},
		"kitten": {
			"sprout":     "🐾",
			"growing":    "🐱",
			"thriving":   "🐈",
			"flourishing": "🦁",
		},
		"tree": {
			"sprout":     "🌱",
			"growing":    "🌿",
			"thriving":   "🌳",
			"flourishing": "🌲",
		},
	}
	if c, ok := emojis[companion]; ok {
		if e, ok := c[level]; ok {
			return e
		}
	}
	return "🌱"
}

// levelLabel returns a human-readable level name.
func levelLabel(level string) string {
	labels := map[string]string{
		"sprout":     "Just Starting",
		"growing":    "Building Habits",
		"thriving":   "Consistent",
		"flourishing": "Flourishing",
	}
	if l, ok := labels[level]; ok {
		return l
	}
	return "Growing"
}

// greeting returns a companion-specific greeting based on level.
func greeting(companion, level string) string {
	greetings := map[string]map[string]string{
		"seed": {
			"sprout":     "Every log is a drop of water. Keep going. 🌱",
			"growing":    "You're building something real. 🌿",
			"thriving":   "Look how far you've come. 🌳",
			"flourishing": "You are the forest now. 🌲",
		},
		"puppy": {
			"sprout":     "New here and already trying. That's everything. 🐾",
			"growing":    "Getting into the rhythm. 🐶",
			"thriving":   "You show up every day. That's rare. 🐕",
			"flourishing": "Consistency mastered. 🦮",
		},
		"kitten": {
			"sprout":     "Curious and careful. A good start. 🐾",
			"growing":    "Noticing the patterns. 🐱",
			"thriving":   "Grace and discipline. Both at once. 🐈",
			"flourishing": "Quiet strength. 🦁",
		},
		"tree": {
			"sprout":     "Roots first. Always. 🌱",
			"growing":    "Growing slowly, growing well. 🌿",
			"thriving":   "Branches reaching. 🌳",
			"flourishing": "Deep roots hold through any season. 🌲",
		},
	}
	if c, ok := greetings[companion]; ok {
		if g, ok := c[level]; ok {
			return g
		}
	}
	return "Keep going. 🌱"
}

// Get returns the current companion state.
func (s *Service) Get(ctx context.Context, userID string) (*CompanionState, error) {
	var cs CompanionState
	var milestonesJSON []byte
	var lastCheckin *string

	err := s.db.QueryRow(ctx, `
		SELECT
			id::text, companion::text, level::text,
			xp, xp_to_next, streak_days, longest_streak,
			total_checkins,
			TO_CHAR(last_checkin, 'YYYY-MM-DD'),
			milestones
		FROM companion_state
		WHERE user_id = $1
	`, userID).Scan(
		&cs.ID, &cs.Companion, &cs.Level,
		&cs.XP, &cs.XPToNext, &cs.StreakDays, &cs.LongestStreak,
		&cs.TotalCheckins, &lastCheckin, &milestonesJSON,
	)
	if err != nil {
		return nil, fmt.Errorf("companion not found: %w", err)
	}

	cs.LastCheckin = lastCheckin
	cs.Emoji = companionEmoji(cs.Companion, cs.Level)
	cs.LevelLabel = levelLabel(cs.Level)
	cs.Greeting = greeting(cs.Companion, cs.Level)

	if cs.XPToNext > 0 {
		cs.XPPercent = float64(cs.XP) / float64(cs.XPToNext) * 100
		if cs.XPPercent > 100 {
			cs.XPPercent = 100
		}
	}

	if len(milestonesJSON) > 0 {
		_ = json.Unmarshal(milestonesJSON, &cs.Milestones)
	}
	if cs.Milestones == nil {
		cs.Milestones = []Milestone{}
	}

	return &cs, nil
}

// Choose sets the user's companion choice.
func (s *Service) Choose(ctx context.Context, userID string, input ChooseInput) (*CompanionState, error) {
	valid := map[string]bool{"seed": true, "puppy": true, "kitten": true, "tree": true}
	if !valid[input.Companion] {
		return nil, fmt.Errorf("invalid companion: must be seed, puppy, kitten, or tree")
	}

	_, err := s.db.Exec(ctx, `
		UPDATE companion_state
		SET companion = $1::companion_type, updated_at = NOW()
		WHERE user_id = $2
	`, input.Companion, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to set companion: %w", err)
	}

	return s.Get(ctx, userID)
}

// Checkin awards XP for a behavioral event and handles leveling up.
func (s *Service) Checkin(ctx context.Context, userID string, input CheckinInput) (*CompanionState, error) {
	xp := xpForEvent(input.EventType)
	if xp == 0 {
		return s.Get(ctx, userID)
	}

	today := time.Now().Format("2006-01-02")

	// Get current state
	var currentXP, currentXPToNext, streakDays, longestStreak, totalCheckins int
	var currentLevel, currentCompanion string
	var lastCheckin *string
	var milestonesJSON []byte

	err := s.db.QueryRow(ctx, `
		SELECT xp, xp_to_next, level::text, companion::text,
		       streak_days, longest_streak, total_checkins,
		       TO_CHAR(last_checkin, 'YYYY-MM-DD'),
		       milestones
		FROM companion_state WHERE user_id = $1
	`, userID).Scan(&currentXP, &currentXPToNext, &currentLevel, &currentCompanion,
		&streakDays, &longestStreak, &totalCheckins, &lastCheckin, &milestonesJSON)
	if err != nil {
		return nil, err
	}

	// Update streak for bedtime events
	if input.EventType == "bedtime" {
		yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
		if lastCheckin == nil || *lastCheckin == yesterday {
			streakDays++
		} else if lastCheckin != nil && *lastCheckin != today {
			streakDays = 1 // reset
		}
		if streakDays > longestStreak {
			longestStreak = streakDays
		}
		totalCheckins++
	}

	// Streak bonus XP
	streakBonus := 0
	if input.EventType == "bedtime" {
		switch {
		case streakDays == 30:
			streakBonus = XPStreak30
		case streakDays == 7:
			streakBonus = XPStreak7
		case streakDays == 3:
			streakBonus = XPStreak3
		}
	}
	totalXP := xp + streakBonus

	// Calculate new XP and level
	newXP := currentXP + totalXP
	newLevel := currentLevel
	newXPToNext := currentXPToNext

	// Check for level up
	if newXP >= currentXPToNext {
		newLevel = nextLevel(currentLevel)
		newXPToNext = levelThresholds[newLevel]
		newXP = newXP - currentXPToNext // carry over XP
	}

	// Build milestones
	var milestones []Milestone
	if len(milestonesJSON) > 0 {
		_ = json.Unmarshal(milestonesJSON, &milestones)
	}

	// Add milestone for level up
	if newLevel != currentLevel {
		milestones = append([]Milestone{{
			Label: fmt.Sprintf("Reached %s!", levelLabel(newLevel)),
			Emoji: companionEmoji(currentCompanion, newLevel),
			Date:  today,
		}}, milestones...)
	}

	// Add milestone for streak bonuses
	if streakBonus > 0 {
		milestones = append([]Milestone{{
			Label: fmt.Sprintf("%d-day streak! 🔥", streakDays),
			Emoji: "🔥",
			Date:  today,
		}}, milestones...)
	}

	// Keep only last 10 milestones
	if len(milestones) > 10 {
		milestones = milestones[:10]
	}

	milestonesData, _ := json.Marshal(milestones)

	// Save companion event
	_, _ = s.db.Exec(ctx, `
		INSERT INTO companion_events (user_id, event_type, xp_awarded, note)
		VALUES ($1, $2, $3, $4)
	`, userID, input.EventType, totalXP, input.Note)

	// Update companion state
	lastCheckinUpdate := today
	if input.EventType != "bedtime" {
		lastCheckinUpdate = today // always update last checkin
	}

	_, err = s.db.Exec(ctx, `
		UPDATE companion_state SET
			xp             = $1,
			xp_to_next     = $2,
			level          = $3::companion_level,
			streak_days    = $4,
			longest_streak = $5,
			total_checkins = $6,
			last_checkin   = $7::date,
			milestones     = $8,
			updated_at     = NOW()
		WHERE user_id = $9
	`, newXP, newXPToNext, newLevel, streakDays, longestStreak,
		totalCheckins, lastCheckinUpdate, milestonesData, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to update companion: %w", err)
	}

	return s.Get(ctx, userID)
}

// History returns recent companion events.
func (s *Service) History(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(ctx, `
		SELECT event_type, xp_awarded, COALESCE(note,''),
		       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI')
		FROM companion_events
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 20
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []map[string]interface{}
	for rows.Next() {
		var evType, note, createdAt string
		var xpAwarded int
		if err := rows.Scan(&evType, &xpAwarded, &note, &createdAt); err != nil {
			return nil, err
		}
		events = append(events, map[string]interface{}{
			"event_type": evType,
			"xp_awarded": xpAwarded,
			"note":       note,
			"created_at": createdAt,
		})
	}
	return events, rows.Err()
}

// xpForEvent returns XP for a given event type.
func xpForEvent(eventType string) int {
	switch eventType {
	case "bedtime":
		return XPBedtime
	case "capture":
		return XPCapture
	case "goal":
		return XPGoal
	case "reflection":
		return XPReflection
	default:
		return 0
	}
}

// nextLevel returns the next level in the progression.
func nextLevel(current string) string {
	for i, l := range levelOrder {
		if l == current && i < len(levelOrder)-1 {
			return levelOrder[i+1]
		}
	}
	return "flourishing"
}
