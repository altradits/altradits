package workers

import (
	"context"
	"log"
	"time"

	"github.com/altradits/altradits/server/internal/wallet"
)

// ExchangeRateWorker periodically refreshes the cached BTC/KES exchange rate
// so wallet requests rarely fall through to a live Coingecko fetch.
type ExchangeRateWorker struct {
	rates    *wallet.ExchangeRateService
	interval time.Duration
}

// NewExchangeRateWorker creates a new exchange rate background worker.
func NewExchangeRateWorker(rates *wallet.ExchangeRateService) *ExchangeRateWorker {
	return &ExchangeRateWorker{
		rates:    rates,
		interval: 5 * time.Minute,
	}
}

// Run starts the worker loop. Call in a goroutine.
func (w *ExchangeRateWorker) Run(ctx context.Context) {
	log.Println("₿ Exchange rate worker started")

	if _, err := w.rates.Refresh(ctx); err != nil {
		log.Printf("₿ Exchange rate worker initial refresh failed: %v", err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("₿ Exchange rate worker stopped")
			return
		case <-ticker.C:
			if _, err := w.rates.Refresh(ctx); err != nil {
				log.Printf("₿ Exchange rate worker refresh failed: %v", err)
			}
		}
	}
}
