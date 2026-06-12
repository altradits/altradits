package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/goals"
	"github.com/altradits/altradits/server/internal/notifications"
	"github.com/altradits/altradits/server/internal/wallet"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AutoContributionWorker periodically runs due recurring "auto-save"
// contributions into goals and notifies the user of the result.
type AutoContributionWorker struct {
	db           *pgxpool.Pool
	goalsService *goals.Service
	notifService *notifications.Service
	interval     time.Duration
}

// NewAutoContributionWorker creates a new auto-contribution background worker.
func NewAutoContributionWorker(db *pgxpool.Pool, goalsService *goals.Service, notifService *notifications.Service) *AutoContributionWorker {
	return &AutoContributionWorker{
		db:           db,
		goalsService: goalsService,
		notifService: notifService,
		interval:     15 * time.Minute,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *AutoContributionWorker) Run(ctx context.Context) {
	log.Println("🔁 Auto-contribution worker started")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🔁 Auto-contribution worker stopped")
			return
		case <-ticker.C:
			w.RunOnce(ctx)
		}
	}
}

type dueContribution struct {
	id, goalID, userID, frequency, name, emoji, currency string
	amount                                                float64
}

// RunOnce executes every recurring contribution that is currently due.
func (w *AutoContributionWorker) RunOnce(ctx context.Context) {
	rows, err := w.db.Query(ctx, `
		SELECT ac.id, ac.goal_id, ac.user_id, ac.amount, ac.frequency, g.name, g.emoji, g.currency
		FROM goal_auto_contributions ac
		JOIN goals g ON g.id = ac.goal_id
		WHERE ac.active = TRUE AND ac.next_run_at <= NOW()
	`)
	if err != nil {
		log.Printf("🔁 Auto-contribution worker error fetching due rows: %v", err)
		return
	}

	var due []dueContribution
	for rows.Next() {
		var d dueContribution
		if err := rows.Scan(&d.id, &d.goalID, &d.userID, &d.amount, &d.frequency, &d.name, &d.emoji, &d.currency); err != nil {
			continue
		}
		due = append(due, d)
	}
	rows.Close()

	for _, d := range due {
		w.run(ctx, d)
	}
}

func (w *AutoContributionWorker) run(ctx context.Context, d dueContribution) {
	goal, err := w.goalsService.Contribute(ctx, d.userID, d.goalID, d.amount)
	if err != nil {
		if _, dbErr := w.db.Exec(ctx, `
			UPDATE goal_auto_contributions SET active = FALSE, last_run_at = NOW() WHERE id = $1
		`, d.id); dbErr != nil {
			log.Printf("🔁 Auto-contribution worker error pausing %s: %v", d.id, dbErr)
		}
		_ = w.notifService.Send(ctx, d.userID, "auto_contribution",
			fmt.Sprintf("⏸ Auto-save paused for %s %s", d.emoji, d.name),
			fmt.Sprintf("We couldn't move this contribution (%s). Turn auto-save back on once you've topped up.", err.Error()),
			map[string]interface{}{"goal_id": d.goalID})
		return
	}

	if _, err := w.db.Exec(ctx, `
		UPDATE goal_auto_contributions
		SET last_run_at = NOW(),
			next_run_at = next_run_at + CASE frequency
				WHEN 'daily' THEN INTERVAL '1 day'
				WHEN 'weekly' THEN INTERVAL '7 days'
				ELSE INTERVAL '1 month'
			END,
			active = CASE WHEN $2 THEN FALSE ELSE active END
		WHERE id = $1
	`, d.id, goal.Completed); err != nil {
		log.Printf("🔁 Auto-contribution worker error advancing %s: %v", d.id, err)
	}

	amountLabel := fmt.Sprintf("KES %.0f", d.amount)
	if d.currency == "sats" {
		amountLabel = wallet.FormatSats(int64(d.amount+0.5)) + " sats"
	}

	title := fmt.Sprintf("🔁 Auto-saved to %s %s", d.emoji, d.name)
	body := fmt.Sprintf("Moved %s into %s. 🌱", amountLabel, d.name)
	if goal.Completed {
		title = fmt.Sprintf("🎉 %s %s — target reached!", d.emoji, d.name)
		body = fmt.Sprintf("Moved %s into %s — and you hit your target! Auto-save has been turned off.", amountLabel, d.name)
	}

	_ = w.notifService.Send(ctx, d.userID, "auto_contribution", title, body, map[string]interface{}{
		"goal_id": d.goalID,
		"amount":  d.amount,
	})
}
