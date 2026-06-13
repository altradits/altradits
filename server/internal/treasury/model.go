package treasury

// PoolAsset is a single allocation bucket in the savings pool (e.g. "Bond
// Funds", "Money Market Funds"), with its share of the pool, the yield it
// contributes, and its risk classification.
type PoolAsset struct {
	Name          string  `json:"name"`
	AssetClass    string  `json:"asset_class"`
	AllocationPct float64 `json:"allocation_pct"`
	APYPct        float64 `json:"apy_pct"`
	RiskScore     string  `json:"risk_score"`
}

// InterestSummary is a user's interest-earning summary: how much they've
// earned this month, how much they've earned in total, and the APY they
// currently earn (net of the bank's fee).
type InterestSummary struct {
	MonthlyEarnedSats  int64   `json:"monthly_earned_sats"`
	LifetimeEarnedSats int64   `json:"lifetime_earned_sats"`
	CurrentAPYPct      float64 `json:"current_apy_pct"`
}

// AccrualResult summarizes a single interest-distribution run.
type AccrualResult struct {
	UsersCredited        int     `json:"users_credited"`
	TotalSatsDistributed int64   `json:"total_sats_distributed"`
	BlendedAPYPct        float64 `json:"blended_apy_pct"`
	CustomerAPYPct       float64 `json:"customer_apy_pct"`
	AUMSats              int64   `json:"aum_sats"`
	PeriodStart          string  `json:"period_start"`
	PeriodEnd            string  `json:"period_end"`
}

// PoolOverview is the trader's top-level snapshot of the pool: how much is
// under management, how much interest is owed/projected, and how much sat
// liquidity is free to deploy.
type PoolOverview struct {
	AUMSats                    int64   `json:"aum_sats"`
	InterestPaidThisMonthSats  int64   `json:"interest_paid_this_month_sats"`
	ProjectedMonthlyInterest   int64   `json:"projected_monthly_interest_sats"`
	AvailableForDeploymentSats int64   `json:"available_for_deployment_sats"`
	PendingWithdrawalsSats     int64   `json:"pending_withdrawals_sats"`
	BlendedAPYPct              float64 `json:"blended_apy_pct"`
	CustomerAPYPct             float64 `json:"customer_apy_pct"`
}

// NAVPoint is a single day's pool AUM and blended yield.
type NAVPoint struct {
	Date          string  `json:"date"`
	AUMSats       int64   `json:"aum_sats"`
	BlendedAPYPct float64 `json:"blended_apy_pct"`
}

// RiskReport summarizes the pool's drawdown, volatility, and risk-adjusted
// return based on its NAV history.
type RiskReport struct {
	CurrentAUMSats     int64   `json:"current_aum_sats"`
	AllTimeHighSats    int64   `json:"all_time_high_sats"`
	CurrentDrawdownPct float64 `json:"current_drawdown_pct"`
	MaxDrawdownPct     float64 `json:"max_drawdown_pct"`
	VolatilityPct      float64 `json:"volatility_pct"`
	SharpeRatio        float64 `json:"sharpe_ratio"`
}

// Alert is a single risk/operations alert surfaced on the trader dashboard.
type Alert struct {
	Severity string `json:"severity"` // "info" | "warning" | "critical"
	Title    string `json:"title"`
	Detail   string `json:"detail"`
}

// PoolConfig holds the bank's margin on pool yield and its target customer
// APY.
type PoolConfig struct {
	BankFeePct   float64 `json:"bank_fee_pct"`
	TargetAPYPct float64 `json:"target_apy_pct"`
}

// RebalanceEntry is one asset class's desired allocation/APY in a rebalance
// request.
type RebalanceEntry struct {
	AssetClass    string  `json:"asset_class"`
	AllocationPct float64 `json:"allocation_pct"`
	APYPct        float64 `json:"apy_pct"`
}

// RebalanceLogEntry is a single recorded change to an asset's allocation or
// APY.
type RebalanceLogEntry struct {
	AssetClass       string  `json:"asset_class"`
	OldAllocationPct float64 `json:"old_allocation_pct"`
	NewAllocationPct float64 `json:"new_allocation_pct"`
	OldAPYPct        float64 `json:"old_apy_pct"`
	NewAPYPct        float64 `json:"new_apy_pct"`
	ChangedByName    *string `json:"changed_by_name"`
	CreatedAt        string  `json:"created_at"`
}
