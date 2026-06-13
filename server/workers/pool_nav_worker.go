package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/treasury"
)

// PoolNAVWorker periodically records the pool's AUM and blended APY in
// pool_nav_snapshots, feeding the Trader Dashboard's NAV/P&L/risk charts.
type PoolNAVWorker struct {
	treasury *treasury.Service
	interval time.Duration
}

// NewPoolNAVWorker creates a new pool NAV background worker.
func NewPoolNAVWorker(treasury *treasury.Service) *PoolNAVWorker {
	return &PoolNAVWorker{
		treasury: treasury,
		interval: 24 * time.Hour,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *PoolNAVWorker) Run(ctx context.Context) {
	log.Println("📊 Pool NAV worker started")

	if err := w.treasury.SnapshotNAV(ctx); err != nil {
		log.Printf("📊 Pool NAV worker initial snapshot failed: %v", err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("📊 Pool NAV worker stopped")
			return
		case <-ticker.C:
			if err := w.treasury.SnapshotNAV(ctx); err != nil {
				log.Printf("📊 Pool NAV worker snapshot failed: %v", err)
			}
		}
	}
}
