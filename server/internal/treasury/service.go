package treasury

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/altradits/altradits/server/internal/wallet"
)

// Service manages the savings pool: its asset allocation, NAV history, and
// the per-user interest ledger derived from it.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates the treasury service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, letting shared
// helpers run either standalone or inside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// GetAllocation returns the pool's current asset allocation breakdown.
func (s *Service) GetAllocation(ctx context.Context) ([]PoolAsset, error) {
	rows, err := s.db.Query(ctx, `
		SELECT name, asset_class, allocation_pct, apy_pct, risk_score
		FROM pool_assets
		ORDER BY allocation_pct DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assets := []PoolAsset{}
	for rows.Next() {
		var a PoolAsset
		if err := rows.Scan(&a.Name, &a.AssetClass, &a.AllocationPct, &a.APYPct, &a.RiskScore); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// GetBlendedAPY returns the pool-wide APY, weighted by each asset's
// allocation percentage.
func (s *Service) GetBlendedAPY(ctx context.Context) (float64, error) {
	var apy float64
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(allocation_pct / 100 * apy_pct), 0) FROM pool_assets
	`).Scan(&apy)
	return apy, err
}

// GetConfig returns the pool's current bank fee and target customer APY.
func (s *Service) GetConfig(ctx context.Context) (*PoolConfig, error) {
	var config PoolConfig
	err := s.db.QueryRow(ctx, `
		SELECT bank_fee_pct, target_apy_pct FROM pool_config WHERE id = 1
	`).Scan(&config.BankFeePct, &config.TargetAPYPct)
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// UpdateConfig sets the pool's bank fee and target customer APY.
func (s *Service) UpdateConfig(ctx context.Context, config PoolConfig) (*PoolConfig, error) {
	if config.BankFeePct < 0 || config.BankFeePct > 100 {
		return nil, errors.New("bank_fee_pct must be between 0 and 100")
	}
	if config.TargetAPYPct < 0 {
		return nil, errors.New("target_apy_pct must be non-negative")
	}

	if _, err := s.db.Exec(ctx, `
		UPDATE pool_config SET bank_fee_pct = $1, target_apy_pct = $2, updated_at = NOW() WHERE id = 1
	`, config.BankFeePct, config.TargetAPYPct); err != nil {
		return nil, err
	}
	return &config, nil
}

// getCustomerAPY returns the pool's gross blended APY and the APY customers
// actually earn after the bank's fee.
func (s *Service) getCustomerAPY(ctx context.Context, q querier) (blended float64, customer float64, err error) {
	if err = q.QueryRow(ctx, `
		SELECT COALESCE(SUM(allocation_pct / 100 * apy_pct), 0) FROM pool_assets
	`).Scan(&blended); err != nil {
		return 0, 0, err
	}

	var bankFeePct float64
	if err = q.QueryRow(ctx, `SELECT bank_fee_pct FROM pool_config WHERE id = 1`).Scan(&bankFeePct); err != nil {
		return 0, 0, err
	}

	customer = blended * (1 - bankFeePct/100)
	return blended, customer, nil
}

// snapshotNAV records today's AUM and blended APY in pool_nav_snapshots,
// returning the AUM that was recorded.
func (s *Service) snapshotNAV(ctx context.Context, q querier) (int64, error) {
	blended, _, err := s.getCustomerAPY(ctx, q)
	if err != nil {
		return 0, err
	}

	var aum int64
	if err := q.QueryRow(ctx, `SELECT COALESCE(SUM(current_sats_balance), 0) FROM users`).Scan(&aum); err != nil {
		return 0, err
	}

	if _, err := q.Exec(ctx, `
		INSERT INTO pool_nav_snapshots (snapshot_date, aum_sats, blended_apy_pct)
		VALUES (CURRENT_DATE, $1, $2)
		ON CONFLICT (snapshot_date) DO UPDATE SET aum_sats = excluded.aum_sats, blended_apy_pct = excluded.blended_apy_pct
	`, aum, blended); err != nil {
		return 0, err
	}

	return aum, nil
}

// SnapshotNAV records today's AUM and blended APY. Intended to be called
// once daily by PoolNAVWorker.
func (s *Service) SnapshotNAV(ctx context.Context) error {
	_, err := s.snapshotNAV(ctx, s.db)
	return err
}

// GetUserInterestSummary returns how much a user has earned this month and
// in total, alongside the APY they currently earn (net of the bank's fee).
func (s *Service) GetUserInterestSummary(ctx context.Context, userID string) (*InterestSummary, error) {
	var summary InterestSummary

	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_sats), 0) FROM interest_accruals
		WHERE user_id = $1 AND period_start = date_trunc('month', CURRENT_DATE)::date
	`, userID).Scan(&summary.MonthlyEarnedSats)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_sats), 0) FROM interest_accruals WHERE user_id = $1
	`, userID).Scan(&summary.LifetimeEarnedSats)
	if err != nil {
		return nil, err
	}

	_, summary.CurrentAPYPct, err = s.getCustomerAPY(ctx, s.db)
	if err != nil {
		return nil, err
	}

	return &summary, nil
}

// AccrueInterest distributes one month's interest to every user with a
// positive balance, based on the pool's blended APY net of the bank's fee.
// It records a wallet_transactions entry (type='interest') and an
// interest_accruals row per user, and a pool_nav_snapshots row for today's
// AUM. It is idempotent per calendar month — calling it again for the same
// month returns an error.
func (s *Service) AccrueInterest(ctx context.Context) (*AccrualResult, error) {
	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, -1)

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var alreadyAccrued bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM interest_accruals WHERE period_start = $1)
	`, periodStart).Scan(&alreadyAccrued); err != nil {
		return nil, err
	}
	if alreadyAccrued {
		return nil, errors.New("interest has already been accrued for this period")
	}

	blendedAPY, customerAPY, err := s.getCustomerAPY(ctx, tx)
	if err != nil {
		return nil, err
	}

	rows, err := tx.Query(ctx, `
		SELECT id, current_sats_balance FROM users WHERE current_sats_balance > 0 FOR UPDATE
	`)
	if err != nil {
		return nil, err
	}

	type userBalance struct {
		id      string
		balance int64
	}
	var users []userBalance
	for rows.Next() {
		var u userBalance
		if err := rows.Scan(&u.id, &u.balance); err != nil {
			rows.Close()
			return nil, err
		}
		users = append(users, u)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	monthlyRate := customerAPY / 100 / 12
	usersCredited := 0
	var totalDistributed int64

	for _, u := range users {
		interest := int64(math.Round(float64(u.balance) * monthlyRate))
		if interest <= 0 {
			continue
		}

		var walletTxID string
		err := tx.QueryRow(ctx, `
			INSERT INTO wallet_transactions (user_id, amount_sats, type, status, description, completed_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			RETURNING id
		`, u.id, interest, wallet.TypeInterest, wallet.StatusCompleted, "Monthly pool interest").Scan(&walletTxID)
		if err != nil {
			return nil, err
		}

		if _, err := tx.Exec(ctx, `
			UPDATE users SET current_sats_balance = current_sats_balance + $1, total_sats_received = total_sats_received + $1
			WHERE id = $2
		`, interest, u.id); err != nil {
			return nil, err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO interest_accruals (user_id, wallet_transaction_id, amount_sats, apy_pct, period_start, period_end)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, u.id, walletTxID, interest, customerAPY, periodStart, periodEnd); err != nil {
			return nil, err
		}

		usersCredited++
		totalDistributed += interest
	}

	aum, err := s.snapshotNAV(ctx, tx)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &AccrualResult{
		UsersCredited:        usersCredited,
		TotalSatsDistributed: totalDistributed,
		BlendedAPYPct:        blendedAPY,
		CustomerAPYPct:       customerAPY,
		AUMSats:              aum,
		PeriodStart:          periodStart.Format("2006-01-02"),
		PeriodEnd:            periodEnd.Format("2006-01-02"),
	}, nil
}

// GetPoolOverview returns the trader's top-level view of the pool: AUM,
// interest owed/projected, and sat liquidity available for deployment.
func (s *Service) GetPoolOverview(ctx context.Context) (*PoolOverview, error) {
	var overview PoolOverview

	blended, customer, err := s.getCustomerAPY(ctx, s.db)
	if err != nil {
		return nil, err
	}
	overview.BlendedAPYPct = blended
	overview.CustomerAPYPct = customer

	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(current_sats_balance), 0) FROM users
	`).Scan(&overview.AUMSats); err != nil {
		return nil, err
	}

	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_sats), 0) FROM interest_accruals
		WHERE period_start = date_trunc('month', CURRENT_DATE)::date
	`).Scan(&overview.InterestPaidThisMonthSats); err != nil {
		return nil, err
	}

	overview.ProjectedMonthlyInterest = int64(math.Round(float64(overview.AUMSats) * customer / 100 / 12))

	var cashAllocationPct float64
	if err := s.db.QueryRow(ctx, `
		SELECT allocation_pct FROM pool_assets WHERE asset_class = 'cash_btc'
	`).Scan(&cashAllocationPct); err != nil {
		return nil, err
	}
	overview.AvailableForDeploymentSats = int64(math.Round(float64(overview.AUMSats) * (100 - cashAllocationPct) / 100))

	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_sats), 0) FROM wallet_transactions
		WHERE status = 'pending' AND type::text LIKE 'withdraw%'
	`).Scan(&overview.PendingWithdrawalsSats); err != nil {
		return nil, err
	}

	return &overview, nil
}

// GetNAVHistory returns up to `days` days of pool NAV history, oldest
// first.
func (s *Service) GetNAVHistory(ctx context.Context, days int) ([]NAVPoint, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	rows, err := s.db.Query(ctx, `
		SELECT snapshot_date::text, aum_sats, blended_apy_pct
		FROM pool_nav_snapshots
		ORDER BY snapshot_date DESC
		LIMIT $1
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := []NAVPoint{}
	for rows.Next() {
		var p NAVPoint
		if err := rows.Scan(&p.Date, &p.AUMSats, &p.BlendedAPYPct); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i, j := 0, len(points)-1; i < j; i, j = i+1, j-1 {
		points[i], points[j] = points[j], points[i]
	}
	return points, nil
}

// GetRiskReport computes drawdown, volatility, and Sharpe ratio from the
// pool's NAV history and its current (live) AUM.
func (s *Service) GetRiskReport(ctx context.Context) (*RiskReport, error) {
	history, err := s.GetNAVHistory(ctx, 90)
	if err != nil {
		return nil, err
	}

	var report RiskReport
	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(current_sats_balance), 0) FROM users
	`).Scan(&report.CurrentAUMSats); err != nil {
		return nil, err
	}

	if len(history) == 0 {
		report.AllTimeHighSats = report.CurrentAUMSats
		return &report, nil
	}

	allTimeHigh := float64(history[0].AUMSats)
	maxDrawdown := 0.0
	returns := make([]float64, 0, len(history))
	for i, p := range history {
		v := float64(p.AUMSats)
		if v > allTimeHigh {
			allTimeHigh = v
		}
		if allTimeHigh > 0 {
			if dd := (allTimeHigh - v) / allTimeHigh * 100; dd > maxDrawdown {
				maxDrawdown = dd
			}
		}
		if i > 0 {
			prev := float64(history[i-1].AUMSats)
			if prev != 0 {
				returns = append(returns, (v-prev)/prev)
			}
		}
	}

	current := float64(report.CurrentAUMSats)
	if current > allTimeHigh {
		allTimeHigh = current
	}
	if allTimeHigh > 0 {
		dd := (allTimeHigh - current) / allTimeHigh * 100
		if dd > maxDrawdown {
			maxDrawdown = dd
		}
		report.CurrentDrawdownPct = dd
	}
	if last := float64(history[len(history)-1].AUMSats); last != 0 {
		returns = append(returns, (current-last)/last)
	}

	report.AllTimeHighSats = int64(math.Round(allTimeHigh))
	report.MaxDrawdownPct = maxDrawdown

	if len(returns) > 0 {
		var mean float64
		for _, r := range returns {
			mean += r
		}
		mean /= float64(len(returns))

		var variance float64
		for _, r := range returns {
			variance += (r - mean) * (r - mean)
		}
		variance /= float64(len(returns))
		stdev := math.Sqrt(variance)

		report.VolatilityPct = stdev * 100
		if stdev > 0 {
			report.SharpeRatio = mean / stdev * math.Sqrt(365)
		}
	}

	return &report, nil
}

// GetAlerts evaluates the pool's allocation, overview, and risk against a
// few simple rules and returns any that fire.
func (s *Service) GetAlerts(ctx context.Context) ([]Alert, error) {
	allocation, err := s.GetAllocation(ctx)
	if err != nil {
		return nil, err
	}
	overview, err := s.GetPoolOverview(ctx)
	if err != nil {
		return nil, err
	}
	risk, err := s.GetRiskReport(ctx)
	if err != nil {
		return nil, err
	}
	config, err := s.GetConfig(ctx)
	if err != nil {
		return nil, err
	}

	alerts := []Alert{}

	var cashAllocationPct float64
	for _, a := range allocation {
		if a.AllocationPct > 40 {
			alerts = append(alerts, Alert{
				Severity: "warning",
				Title:    "Concentration risk",
				Detail:   fmt.Sprintf("%s is %.0f%% of the pool", a.Name, a.AllocationPct),
			})
		}
		if a.AssetClass == "cash_btc" {
			cashAllocationPct = a.AllocationPct
		}
	}

	if risk.CurrentDrawdownPct > 2 {
		alerts = append(alerts, Alert{
			Severity: "critical",
			Title:    "Drawdown limit breached",
			Detail:   fmt.Sprintf("-%.2f%% from all-time high (limit -2%%/month)", risk.CurrentDrawdownPct),
		})
	}

	if overview.CustomerAPYPct < config.TargetAPYPct {
		alerts = append(alerts, Alert{
			Severity: "warning",
			Title:    "Yield below target",
			Detail:   fmt.Sprintf("Customer APY %.2f%% vs %.2f%% target", overview.CustomerAPYPct, config.TargetAPYPct),
		})
	}

	cashReserveSats := int64(math.Round(float64(overview.AUMSats) * cashAllocationPct / 100))
	if overview.PendingWithdrawalsSats > cashReserveSats {
		alerts = append(alerts, Alert{
			Severity: "critical",
			Title:    "Liquidity shortfall",
			Detail:   fmt.Sprintf("Pending withdrawals (%d sats) exceed the cash reserve (%d sats)", overview.PendingWithdrawalsSats, cashReserveSats),
		})
	}

	return alerts, nil
}

// UpdateAllocation rebalances the pool: every asset class must be present in
// entries, allocation percentages must sum to 100, and each change is
// recorded in pool_rebalance_log.
func (s *Service) UpdateAllocation(ctx context.Context, userID string, entries []RebalanceEntry) ([]PoolAsset, error) {
	if len(entries) == 0 {
		return nil, errors.New("at least one allocation entry is required")
	}

	sumPct := 0.0
	seen := make(map[string]bool, len(entries))
	for _, e := range entries {
		if e.AllocationPct < 0 || e.APYPct < 0 {
			return nil, errors.New("allocation_pct and apy_pct must be non-negative")
		}
		if seen[e.AssetClass] {
			return nil, fmt.Errorf("duplicate asset class: %s", e.AssetClass)
		}
		seen[e.AssetClass] = true
		sumPct += e.AllocationPct
	}
	if math.Abs(sumPct-100) > 0.01 {
		return nil, fmt.Errorf("allocation percentages must sum to 100, got %.2f", sumPct)
	}

	current, err := s.GetAllocation(ctx)
	if err != nil {
		return nil, err
	}
	if len(current) != len(entries) {
		return nil, errors.New("rebalance must include every existing asset class")
	}
	currentByClass := make(map[string]PoolAsset, len(current))
	for _, a := range current {
		currentByClass[a.AssetClass] = a
	}
	for class := range seen {
		if _, ok := currentByClass[class]; !ok {
			return nil, fmt.Errorf("unknown asset class: %s", class)
		}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	for _, e := range entries {
		old := currentByClass[e.AssetClass]
		if old.AllocationPct == e.AllocationPct && old.APYPct == e.APYPct {
			continue
		}

		if _, err := tx.Exec(ctx, `
			UPDATE pool_assets SET allocation_pct = $1, apy_pct = $2, updated_at = NOW() WHERE asset_class = $3
		`, e.AllocationPct, e.APYPct, e.AssetClass); err != nil {
			return nil, err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO pool_rebalance_log (changed_by, asset_class, old_allocation_pct, new_allocation_pct, old_apy_pct, new_apy_pct)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, userID, e.AssetClass, old.AllocationPct, e.AllocationPct, old.APYPct, e.APYPct); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetAllocation(ctx)
}

// GetRebalanceLog returns the most recent allocation/APY changes, newest
// first.
func (s *Service) GetRebalanceLog(ctx context.Context, limit int) ([]RebalanceLogEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	rows, err := s.db.Query(ctx, `
		SELECT l.asset_class, l.old_allocation_pct, l.new_allocation_pct, l.old_apy_pct, l.new_apy_pct, u.name, l.created_at
		FROM pool_rebalance_log l
		LEFT JOIN users u ON u.id = l.changed_by
		ORDER BY l.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []RebalanceLogEntry{}
	for rows.Next() {
		var e RebalanceLogEntry
		var createdAt time.Time
		if err := rows.Scan(&e.AssetClass, &e.OldAllocationPct, &e.NewAllocationPct, &e.OldAPYPct, &e.NewAPYPct, &e.ChangedByName, &createdAt); err != nil {
			return nil, err
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
