package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/notifications"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BedtimeWorker checks nightly for users who haven't closed their day.
type BedtimeWorker struct {
	db           *pgxpool.Pool
	notifService *notifications.Service
	interval     time.Duration
}

// NewBedtimeWorker creates a new bedtime background worker.
func NewBedtimeWorker(db *pgxpool.Pool, notifService *notifications.Service) *BedtimeWorker {
	return &BedtimeWorker{
		db:           db,
		notifService: notifService,
		interval:     30 * time.Minute,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *BedtimeWorker) Run(ctx context.Context) {
	log.Println("🌙 Bedtime worker started")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🌙 Bedtime worker stopped")
			return
		case <-ticker.C:
			w.checkAll(ctx)
		}
	}
}

func (w *BedtimeWorker) checkAll(ctx context.Context) {
	rows, err := w.db.Query(ctx, `
		SELECT id::text FROM users
	`)
	if err != nil {
		log.Printf("🌙 Bedtime worker error fetching users: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = w.notifService.CheckAndSendBedtimeReminder(ctx, userID)
		if time.Now().Hour() >= 18 {
			_ = w.notifService.CheckAndSendStreakAtRisk(ctx, userID)
		}
		_ = w.notifService.CheckAndSendGoalMilestones(ctx, userID)
		if time.Now().Weekday() == time.Monday && time.Now().Hour() == 8 {
			_ = w.notifService.SendWeeklySummary(ctx, userID)
		}
	}
}
