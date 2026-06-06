package coaching

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CoachingContext holds everything the AI needs to generate a personalised note.
type CoachingContext struct {
	Date          string
	DayOfWeek     string
	TotalSpent    float64
	EntryCount    int
	TopCategory   string
	Categories    []CategorySpend
	Mood          string
	Reflection    string
	BudgetStatus  BudgetStatus
	ActiveGoals   []GoalStatus
	StreakDays    int
}

// CategorySpend is one category's spending for today.
type CategorySpend struct {
	Category string
	Amount   float64
	Count    int
}

// BudgetStatus describes this month's budget health.
type BudgetStatus struct {
	TotalAllocated float64
	TotalSpent     float64
	Percent        float64
	Headroom       float64
}

// GoalStatus is a condensed view of one active goal.
type GoalStatus struct {
	Name    string
	Emoji   string
	Percent float64
	Saved   float64
	Target  float64
}

// CoachingNote is the AI's response.
type CoachingNote struct {
	Note         string `json:"note"`
	TomorrowHint string `json:"tomorrow_hint"`
	Source       string `json:"source"` // "ai" or "fallback"
}

// Service handles AI coaching.
type Service struct {
	db     *pgxpool.Pool
	client *anthropic.Client
	apiKey string
}

// NewService creates a new coaching service.
func NewService(db *pgxpool.Pool) *Service {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	var client *anthropic.Client
	if apiKey != "" {
		c := anthropic.NewClient()
		client = &c
	} else {
		log.Println("⚠️  ANTHROPIC_API_KEY not set — coaching will use fallback mode")
	}
	return &Service{db: db, client: client, apiKey: apiKey}
}

// GatherContext builds the full context from the database for today.
func (s *Service) GatherContext(ctx context.Context, userID, mood, reflection string) (*CoachingContext, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	cc := &CoachingContext{
		Date:       today,
		DayOfWeek:  now.Weekday().String(),
		Mood:       mood,
		Reflection: reflection,
	}

	// Today's totals
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0), COUNT(*)
		FROM transactions
		WHERE DATE(created_at AT TIME ZONE 'Africa/Nairobi') = $1 AND user_id = $2
	`, today, userID).Scan(&cc.TotalSpent, &cc.EntryCount)

	// Category breakdown today
	rows, err := s.db.Query(ctx, `
		SELECT category, SUM(amount), COUNT(*)
		FROM transactions
		WHERE DATE(created_at AT TIME ZONE 'Africa/Nairobi') = $1 AND user_id = $2
		GROUP BY category
		ORDER BY SUM(amount) DESC
	`, today, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var cs CategorySpend
		if err := rows.Scan(&cs.Category, &cs.Amount, &cs.Count); err != nil {
			return nil, err
		}
		cc.Categories = append(cc.Categories, cs)
	}
	rows.Close()
	if len(cc.Categories) > 0 {
		cc.TopCategory = cc.Categories[0].Category
	}

	// Budget status this month
	var allocated, spentMonth float64
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(SUM(amount),0) FROM budgets WHERE user_id = $1`, userID).
		Scan(&allocated)
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0) FROM transactions WHERE created_at >= $1 AND user_id = $2
	`, monthStart, userID).Scan(&spentMonth)

	percent := 0.0
	if allocated > 0 {
		percent = (spentMonth / allocated) * 100
	}
	cc.BudgetStatus = BudgetStatus{
		TotalAllocated: allocated,
		TotalSpent:     spentMonth,
		Percent:        percent,
		Headroom:       allocated - spentMonth,
	}

	// Active goals
	goalRows, err := s.db.Query(ctx, `
		SELECT name, emoji, target, saved
		FROM goals
		WHERE user_id = $1 AND completed = FALSE AND target > 0
		ORDER BY (saved / target) DESC
		LIMIT 3
	`, userID)
	if err != nil {
		return nil, err
	}
	defer goalRows.Close()
	for goalRows.Next() {
		var g GoalStatus
		if err := goalRows.Scan(&g.Name, &g.Emoji, &g.Target, &g.Saved); err != nil {
			return nil, err
		}
		if g.Target > 0 {
			g.Percent = (g.Saved / g.Target) * 100
		}
		cc.ActiveGoals = append(cc.ActiveGoals, g)
	}
	goalRows.Close()

	// Streak
	_ = s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM daily_snapshots
		WHERE user_id = $1 AND closed_at IS NOT NULL
		AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
	`, userID).Scan(&cc.StreakDays)

	return cc, nil
}

// buildPrompt constructs the system and user prompts for Claude.
func buildPrompt(cc *CoachingContext) (systemPrompt, userPrompt string) {
	systemPrompt = `You are Altradits, a calm financial companion. You are kind, gentle, honest, and non-judgmental.

Your role is to write a personalised bedtime coaching note based on today's actual financial data.

Rules you must always follow:
- Never shame the user. Never use words like "overspending", "poor discipline", or "you should".
- Never give generic advice. Every sentence must reference the user's actual data.
- Be Socratic — ask a gentle question or make an observation, never give directives.
- Keep the note short: 2–3 sentences maximum.
- Keep the tomorrow hint short: 1 sentence maximum.
- Write in a warm, human tone — like a trusted friend who understands money.
- If the user had a hard day (mood: stressed or harder), lead with empathy before any observation.
- If today had no entries, acknowledge the quiet without judgment.
- Never use bullet points, headers, or markdown. Plain prose only.
- Never mention percentages or raw numbers unless they tell a meaningful story.

Respond with valid JSON only. No preamble. No markdown. Exactly this structure:
{"note": "...", "tomorrow_hint": "..."}`

	// Build the user prompt from real data
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Today is %s (%s).\n\n", cc.Date, cc.DayOfWeek))

	if cc.EntryCount == 0 {
		sb.WriteString("The user logged no transactions today.\n")
	} else {
		sb.WriteString(fmt.Sprintf("The user logged %d transaction(s) today totalling KES %.0f.\n",
			cc.EntryCount, cc.TotalSpent))
		sb.WriteString("Breakdown by category:\n")
		for _, cat := range cc.Categories {
			sb.WriteString(fmt.Sprintf("  - %s: KES %.0f (%d entries)\n",
				cat.Category, cat.Amount, cat.Count))
		}
	}

	sb.WriteString(fmt.Sprintf("\nThis month: KES %.0f spent of KES %.0f planned (%.0f%%). Headroom: KES %.0f.\n",
		cc.BudgetStatus.TotalSpent,
		cc.BudgetStatus.TotalAllocated,
		cc.BudgetStatus.Percent,
		cc.BudgetStatus.Headroom,
	))

	if len(cc.ActiveGoals) > 0 {
		sb.WriteString("\nActive savings goals:\n")
		for _, g := range cc.ActiveGoals {
			sb.WriteString(fmt.Sprintf("  - %s %s: %.0f%% complete (KES %.0f of KES %.0f saved)\n",
				g.Emoji, g.Name, g.Percent, g.Saved, g.Target))
		}
	}

	if cc.Mood != "" {
		sb.WriteString(fmt.Sprintf("\nThe user said money felt: %s today.\n", cc.Mood))
	}

	if cc.Reflection != "" {
		sb.WriteString(fmt.Sprintf("Their reflection: \"%s\"\n", cc.Reflection))
	}

	if cc.StreakDays > 1 {
		sb.WriteString(fmt.Sprintf("\nThis is day %d of their bedtime logoff streak.\n", cc.StreakDays))
	}

	sb.WriteString("\nWrite the coaching note and tomorrow hint now.")

	return systemPrompt, sb.String()
}

// fallbackNote returns a rule-based note when the AI is unavailable.
func fallbackNote(cc *CoachingContext) *CoachingNote {
	if cc.EntryCount == 0 {
		return &CoachingNote{
			Note:         "Quiet day — sometimes that's exactly right. 🌙",
			TomorrowHint: "Tomorrow is a fresh start. Ready when you are.",
			Source:       "fallback",
		}
	}

	dayOfWeek := cc.DayOfWeek
	isWeekend := dayOfWeek == "Saturday" || dayOfWeek == "Sunday"

	var note, hint string
	switch {
	case cc.TopCategory == "investments":
		note = "You put money toward growth today. That's a quiet kind of discipline. 🌱"
		hint = "Consistency compounds. Same time tomorrow?"
	case cc.TopCategory == "family":
		note = "Family spending today. Some money moves that way on purpose. 👨‍👩‍👧"
		hint = "Check your goals tomorrow — make sure your own savings are still moving."
	case cc.TopCategory == "bills":
		note = "Bills handled. The unsexy part of a solid financial life. ✅"
		hint = "With bills out of the way, tomorrow is cleaner."
	case cc.Mood == "stressed":
		note = "Stress and money don't always agree. You still showed up today."
		hint = "Rest helps. Tomorrow is lighter."
	case cc.Mood == "harder":
		note = "Harder days happen. You tracked it honestly. That counts."
		hint = "Small steps compound quietly."
	case isWeekend:
		note = "Weekends tend to feel fuller — yours did. That's allowed. 🌙"
		hint = "Monday usually resets the rhythm."
	default:
		note = fmt.Sprintf("You tracked %d moment%s today. That awareness is the foundation. 🌱",
			cc.EntryCount,
			func() string {
				if cc.EntryCount == 1 {
					return ""
				}
				return "s"
			}())
		hint = "Tiny progress compounds. Same time tomorrow."
	}

	return &CoachingNote{Note: note, TomorrowHint: hint, Source: "fallback"}
}

// Generate calls Claude to produce a personalised coaching note.
// Falls back to rule-based note if the API is unavailable.
func (s *Service) Generate(ctx context.Context, userID, mood, reflection string) (*CoachingNote, error) {
	// Gather context from the database
	cc, err := s.GatherContext(ctx, userID, mood, reflection)
	if err != nil {
		return fallbackNote(&CoachingContext{Mood: mood}), nil
	}

	// If no API key, use fallback immediately
	if s.client == nil || s.apiKey == "" {
		return fallbackNote(cc), nil
	}

	systemPrompt, userPrompt := buildPrompt(cc)

	// Call Claude with a short timeout so we don't block the user
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	msg, err := s.client.Messages.New(callCtx, anthropic.MessageNewParams{
		Model:     "claude-3-5-haiku-latest",
		MaxTokens: 300,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(userPrompt)),
		},
	})
	if err != nil {
		log.Printf("⚠️  Claude API error (using fallback): %v", err)
		return fallbackNote(cc), nil
	}

	if len(msg.Content) == 0 {
		log.Println("⚠️  Claude returned empty content (using fallback)")
		return fallbackNote(cc), nil
	}

	// Parse the JSON response using encoding/json
	raw := strings.TrimSpace(msg.Content[0].Text)

	// Strip markdown code fences if present
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	// Robustly extract JSON object from response
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start != -1 && end != -1 && end > start {
		raw = raw[start : end+1]
	}

	var noteResp CoachingNote
	if err := json.Unmarshal([]byte(raw), &noteResp); err != nil {
		log.Printf("⚠️  Could not parse Claude response (using fallback): %v\nraw: %s", err, raw)
		return fallbackNote(cc), nil
	}

	if noteResp.Note == "" {
		log.Println("⚠️  Claude response missing note field (using fallback):", raw)
		return fallbackNote(cc), nil
	}

	noteResp.Source = "ai"
	return &noteResp, nil
}
