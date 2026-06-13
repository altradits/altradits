package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/liquidity"
)

// LiquidityWorker periodically appends routing fee revenue history and
// applies liquidity/M-Pesa float automation (auto-open channels,
// auto-replenish/sweep the float), feeding the Lightning & Liquidity
// Dashboard.
type LiquidityWorker struct {
	liquidity *liquidity.Service
	interval  time.Duration
}

// NewLiquidityWorker creates a new liquidity automation background worker.
func NewLiquidityWorker(liquidity *liquidity.Service) *LiquidityWorker {
	return &LiquidityWorker{
		liquidity: liquidity,
		interval:  24 * time.Hour,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *LiquidityWorker) Run(ctx context.Context) {
	log.Println("⚡ Liquidity worker started")

	if err := w.liquidity.RunAutomation(ctx); err != nil {
		log.Printf("⚡ Liquidity worker initial run failed: %v", err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("⚡ Liquidity worker stopped")
			return
		case <-ticker.C:
			if err := w.liquidity.RunAutomation(ctx); err != nil {
				log.Printf("⚡ Liquidity worker run failed: %v", err)
			}
		}
	}
}
