package wallet

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const exchangeRateCacheKey = "wallet:exchange_rate:btc_kes"

// defaultBTCToKES is used only when Coingecko has never been reached and the
// database has no cached row yet (e.g. a brand new install offline).
const defaultBTCToKES = 13_000_000

// ExchangeRateService fetches and caches the BTC/KES exchange rate.
//
// Lookup order: Redis (fast path, ~5 min TTL) -> Postgres (last known good
// rate) -> live Coingecko fetch (cold start). The background worker keeps
// Redis and Postgres warm so requests rarely fall through to Coingecko.
type ExchangeRateService struct {
	db         *pgxpool.Pool
	redis      *redis.Client
	httpClient *http.Client
	apiBaseURL string
	cacheTTL   time.Duration
}

// NewExchangeRateService creates a new exchange rate service.
func NewExchangeRateService(db *pgxpool.Pool, rdb *redis.Client) *ExchangeRateService {
	apiBaseURL := os.Getenv("EXCHANGE_RATE_API_URL")
	if apiBaseURL == "" {
		apiBaseURL = "https://api.coingecko.com/api/v3"
	}

	cacheTTL := 5 * time.Minute
	if raw := os.Getenv("EXCHANGE_RATE_CACHE_TTL"); raw != "" {
		if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
			cacheTTL = time.Duration(secs) * time.Second
		}
	}

	return &ExchangeRateService{
		db:         db,
		redis:      rdb,
		httpClient: &http.Client{Timeout: 5 * time.Second},
		apiBaseURL: apiBaseURL,
		cacheTTL:   cacheTTL,
	}
}

// GetRate returns the best available BTC/KES rate without making a network
// call when a cached value exists.
func (s *ExchangeRateService) GetRate(ctx context.Context) (ExchangeRate, error) {
	if rate, ok := s.getCached(ctx); ok {
		return rate, nil
	}

	if rate, ok := s.getLatestFromDB(ctx); ok {
		s.setCached(ctx, rate)
		return rate, nil
	}

	// Cold start — nothing cached anywhere, try a live fetch.
	return s.Refresh(ctx)
}

// Refresh fetches the latest rate from Coingecko, persists it, and updates
// the cache. If Coingecko is unreachable, it falls back to the last known
// rate (DB, then a hardcoded default) so the wallet keeps working.
func (s *ExchangeRateService) Refresh(ctx context.Context) (ExchangeRate, error) {
	btcToKES, err := s.fetchFromCoingecko(ctx)
	if err != nil {
		if rate, ok := s.getLatestFromDB(ctx); ok {
			return rate, nil
		}
		fallback := ExchangeRate{
			BTCToKES:  defaultBTCToKES,
			SatsToKES: defaultBTCToKES / SatsPerBTC,
			UpdatedAt: time.Now(),
			Source:    "default",
		}
		s.setCached(ctx, fallback)
		return fallback, err
	}

	rate := ExchangeRate{
		BTCToKES:  btcToKES,
		SatsToKES: btcToKES / SatsPerBTC,
		UpdatedAt: time.Now(),
		Source:    "coingecko",
	}

	s.store(ctx, rate)
	s.setCached(ctx, rate)
	return rate, nil
}

func (s *ExchangeRateService) fetchFromCoingecko(ctx context.Context) (float64, error) {
	url := s.apiBaseURL + "/simple/price?ids=bitcoin&vs_currencies=kes"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("coingecko returned status %d", resp.StatusCode)
	}

	var body map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, err
	}

	kes, ok := body["bitcoin"]["kes"]
	if !ok || kes <= 0 {
		return 0, fmt.Errorf("coingecko response missing bitcoin/kes rate")
	}

	return kes, nil
}

func (s *ExchangeRateService) getLatestFromDB(ctx context.Context) (ExchangeRate, bool) {
	if s.db == nil {
		return ExchangeRate{}, false
	}

	var rate ExchangeRate
	err := s.db.QueryRow(ctx, `
		SELECT btc_to_kes, sats_to_kes, updated_at
		FROM exchange_rates
		ORDER BY updated_at DESC
		LIMIT 1
	`).Scan(&rate.BTCToKES, &rate.SatsToKES, &rate.UpdatedAt)
	if err != nil {
		return ExchangeRate{}, false
	}
	rate.Source = "database"
	return rate, true
}

func (s *ExchangeRateService) store(ctx context.Context, rate ExchangeRate) {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(ctx, `
		INSERT INTO exchange_rates (btc_to_kes, updated_at) VALUES ($1, $2)
	`, rate.BTCToKES, rate.UpdatedAt)
}

func (s *ExchangeRateService) getCached(ctx context.Context) (ExchangeRate, bool) {
	if s.redis == nil {
		return ExchangeRate{}, false
	}
	raw, err := s.redis.Get(ctx, exchangeRateCacheKey).Result()
	if err != nil {
		return ExchangeRate{}, false
	}
	var rate ExchangeRate
	if err := json.Unmarshal([]byte(raw), &rate); err != nil {
		return ExchangeRate{}, false
	}
	return rate, true
}

func (s *ExchangeRateService) setCached(ctx context.Context, rate ExchangeRate) {
	if s.redis == nil {
		return
	}
	raw, err := json.Marshal(rate)
	if err != nil {
		return
	}
	_ = s.redis.Set(ctx, exchangeRateCacheKey, raw, s.cacheTTL).Err()
}
