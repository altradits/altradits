package networth

import (
	"context"

	"github.com/altradits/altradits/server/internal/wallet"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Breakdown values everything the user owns, in KES.
type Breakdown struct {
	Wallet      float64 `json:"wallet"`
	Investments float64 `json:"investments"`
	GoalsSaved  float64 `json:"goals_saved"`
	Total       float64 `json:"total"`
}

// Snapshot is one day's recorded net worth total.
type Snapshot struct {
	Date  string  `json:"date"`
	Total float64 `json:"total"`
}

// Summary is the full /net-worth payload.
type Summary struct {
	Breakdown
	WalletPercent      float64    `json:"wallet_percent"`
	InvestmentsPercent float64    `json:"investments_percent"`
	GoalsPercent       float64    `json:"goals_percent"`
	History            []Snapshot `json:"history"`
}

// Service computes and tracks net worth over time.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new net worth service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// computeBreakdown values everything the user owns in KES: the Lightning
// wallet balance, active investment positions at current value, and money
// set aside in goals. Sats-goal contributions are deducted from
// current_sats_balance on Contribute, so they're converted and added here
// without double-counting against the wallet balance; KES-goal totals are
// already-tracked amounts held elsewhere and are added as-is.
func (s *Service) computeBreakdown(ctx context.Context, userID string) (Breakdown, error) {
	var satsBalance int64
	_ = s.db.QueryRow(ctx, `SELECT current_sats_balance FROM users WHERE id = $1`, userID).Scan(&satsBalance)

	var btcToKES float64
	_ = s.db.QueryRow(ctx, `SELECT btc_to_kes FROM exchange_rates ORDER BY updated_at DESC LIMIT 1`).Scan(&btcToKES)
	rate := wallet.ExchangeRate{BTCToKES: btcToKES}

	walletKES := wallet.SatsToKES(satsBalance, rate)

	var investmentsKES float64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(current_value), 0) FROM investments WHERE user_id = $1 AND is_active = TRUE
	`, userID).Scan(&investmentsKES)

	rows, err := s.db.Query(ctx, `SELECT currency, saved FROM goals WHERE user_id = $1`, userID)
	if err != nil {
		return Breakdown{}, err
	}
	defer rows.Close()

	var goalsKES float64
	for rows.Next() {
		var currency string
		var saved float64
		if err := rows.Scan(&currency, &saved); err != nil {
			return Breakdown{}, err
		}
		if currency == "sats" {
			goalsKES += saved * rate.BTCToKES / wallet.SatsPerBTC
		} else {
			goalsKES += saved
		}
	}
	if err := rows.Err(); err != nil {
		return Breakdown{}, err
	}

	return Breakdown{
		Wallet:      walletKES,
		Investments: investmentsKES,
		GoalsSaved:  goalsKES,
		Total:       walletKES + investmentsKES + goalsKES,
	}, nil
}

// Total returns just the net worth total, for lightweight dashboard use.
func (s *Service) Total(ctx context.Context, userID string) (float64, error) {
	b, err := s.computeBreakdown(ctx, userID)
	if err != nil {
		return 0, err
	}
	return b.Total, nil
}

// Get computes the current breakdown, records today's snapshot, and returns
// it alongside up to 30 days of history.
func (s *Service) Get(ctx context.Context, userID string) (*Summary, error) {
	b, err := s.computeBreakdown(ctx, userID)
	if err != nil {
		return nil, err
	}

	_, _ = s.db.Exec(ctx, `
		INSERT INTO net_worth_snapshots (user_id, snapshot_date, wallet_kes, investments_kes, goals_kes, total_kes)
		VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
		ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
			wallet_kes      = EXCLUDED.wallet_kes,
			investments_kes = EXCLUDED.investments_kes,
			goals_kes       = EXCLUDED.goals_kes,
			total_kes       = EXCLUDED.total_kes
	`, userID, b.Wallet, b.Investments, b.GoalsSaved, b.Total)

	rows, err := s.db.Query(ctx, `
		SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD'), total_kes
		FROM net_worth_snapshots
		WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
		ORDER BY snapshot_date ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []Snapshot
	for rows.Next() {
		var snap Snapshot
		if err := rows.Scan(&snap.Date, &snap.Total); err != nil {
			return nil, err
		}
		history = append(history, snap)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	summary := &Summary{Breakdown: b, History: history}
	if b.Total > 0 {
		summary.WalletPercent = b.Wallet / b.Total * 100
		summary.InvestmentsPercent = b.Investments / b.Total * 100
		summary.GoalsPercent = b.GoalsSaved / b.Total * 100
	}
	return summary, nil
}
