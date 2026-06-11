package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/notifications"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PriceAlertWorker periodically checks active BTC price alerts against the
// latest exchange rate and notifies users whose thresholds have been crossed.
type PriceAlertWorker struct {
	db           *pgxpool.Pool
	notifService *notifications.Service
	interval     time.Duration
}

// NewPriceAlertWorker creates a new price alert background worker.
func NewPriceAlertWorker(db *pgxpool.Pool, notifService *notifications.Service) *PriceAlertWorker {
	return &PriceAlertWorker{
		db:           db,
		notifService: notifService,
		interval:     5 * time.Minute,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *PriceAlertWorker) Run(ctx context.Context) {
	log.Println("🔔 Price alert worker started")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🔔 Price alert worker stopped")
			return
		case <-ticker.C:
			w.checkAll(ctx)
		}
	}
}

func (w *PriceAlertWorker) checkAll(ctx context.Context) {
	rows, err := w.db.Query(ctx, `
		SELECT DISTINCT user_id::text FROM price_alerts WHERE active = TRUE
	`)
	if err != nil {
		log.Printf("🔔 Price alert worker error fetching users: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = w.notifService.CheckAndSendPriceAlerts(ctx, userID)
	}
}
