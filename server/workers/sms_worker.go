package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SMSWorker processes the SMS inbox in the background.
// In Phase 8, SMS are parsed on-demand via the API.
// In Phase 9+, this worker will poll for incoming SMS
// from a webhook or device bridge and auto-parse them.
type SMSWorker struct {
	db       *pgxpool.Pool
	interval time.Duration
}

// NewSMSWorker creates a new SMS background worker.
func NewSMSWorker(db *pgxpool.Pool) *SMSWorker {
	return &SMSWorker{
		db:       db,
		interval: 5 * time.Minute,
	}
}

// Run starts the worker loop. Call this in a goroutine.
// Currently a no-op — will be activated in Phase 9 (SMS webhook).
func (w *SMSWorker) Run(ctx context.Context) {
	log.Println("📱 SMS worker started (Phase 8: manual paste mode)")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("📱 SMS worker stopped")
			return
		case <-ticker.C:
			// Phase 9+: poll for new SMS from device bridge or webhook
			// For now, just log that the worker is alive
			log.Println("📱 SMS worker heartbeat — waiting for Phase 9 webhook integration")
		}
	}
}
