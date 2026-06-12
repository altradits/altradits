package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/notifications"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BillReminderWorker periodically checks active recurring bills and notifies
// users when one is approaching its due date.
type BillReminderWorker struct {
	db           *pgxpool.Pool
	notifService *notifications.Service
	interval     time.Duration
}

// NewBillReminderWorker creates a new bill reminder background worker.
func NewBillReminderWorker(db *pgxpool.Pool, notifService *notifications.Service) *BillReminderWorker {
	return &BillReminderWorker{
		db:           db,
		notifService: notifService,
		interval:     6 * time.Hour,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *BillReminderWorker) Run(ctx context.Context) {
	log.Println("🧾 Bill reminder worker started")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🧾 Bill reminder worker stopped")
			return
		case <-ticker.C:
			w.checkAll(ctx)
		}
	}
}

func (w *BillReminderWorker) checkAll(ctx context.Context) {
	rows, err := w.db.Query(ctx, `
		SELECT DISTINCT user_id::text FROM bills WHERE active = TRUE
	`)
	if err != nil {
		log.Printf("🧾 Bill reminder worker error fetching users: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = w.notifService.CheckAndSendBillsApproaching(ctx, userID)
	}
}
