-- 000004_trader_dashboard.up.sql
-- Adds the Trader Dashboard: risk scores + a 5th pool asset class, the
-- bank's fee/target-yield config, a rebalance audit log ("order history"),
-- and ~30 days of synthetic NAV history so charts are populated immediately.

-- 1. Risk score per asset, and a 5th asset class (Tokenized RWA). Allocations
-- are rebalanced so the five classes sum to 100%.
ALTER TABLE pool_assets ADD COLUMN risk_score TEXT NOT NULL DEFAULT 'Medium';

UPDATE pool_assets SET allocation_pct = 35, risk_score = 'Low'    WHERE asset_class = 'bond_funds';
UPDATE pool_assets SET allocation_pct = 25, risk_score = 'Low'    WHERE asset_class = 'money_market';
UPDATE pool_assets SET allocation_pct = 20, risk_score = 'Medium' WHERE asset_class = 'dividend_equities';
UPDATE pool_assets SET allocation_pct = 10, risk_score = 'Low'    WHERE asset_class = 'cash_btc';

INSERT INTO pool_assets (name, asset_class, allocation_pct, apy_pct, risk_score) VALUES
    ('Tokenized RWA Funds', 'tokenized_rwa', 10, 7.0, 'Medium')
ON CONFLICT (asset_class) DO NOTHING;
-- New blended APY = .35*6.5 + .25*5.0 + .20*8.0 + .10*7.0 + .10*0 = 5.825%

-- 2. Pool config: the bank's fee on pool yield, and the target customer APY.
CREATE TABLE IF NOT EXISTS pool_config (
    id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bank_fee_pct   NUMERIC(5, 2) NOT NULL,
    target_apy_pct NUMERIC(5, 2) NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pool_config (id, bank_fee_pct, target_apy_pct) VALUES (1, 20, 5.0)
ON CONFLICT (id) DO NOTHING;
-- Customer APY = 5.825 * (1 - 0.20) = 4.66%, vs a 5.0% target.

-- 3. Rebalance audit log — doubles as the trader's "order history".
CREATE TABLE IF NOT EXISTS pool_rebalance_log (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    changed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    asset_class        TEXT NOT NULL,
    old_allocation_pct NUMERIC(5, 2) NOT NULL,
    new_allocation_pct NUMERIC(5, 2) NOT NULL,
    old_apy_pct        NUMERIC(5, 2) NOT NULL,
    new_apy_pct        NUMERIC(5, 2) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_rebalance_log_created_at ON pool_rebalance_log(created_at DESC);

-- 4. Seed ~30 days of synthetic NAV history ending near today's real AUM, so
-- the NAV chart, P&L waterfall, drawdown gauge, and Sharpe ratio are
-- populated immediately. Today's row (written by AccrueInterest, if it has
-- run) is left untouched by ON CONFLICT; the daily PoolNAVWorker takes over
-- real snapshots from today onward.
INSERT INTO pool_nav_snapshots (snapshot_date, aum_sats, blended_apy_pct)
SELECT
    (CURRENT_DATE - n)::date,
    GREATEST(1000, ROUND(b.base_aum * (1 - 0.0025 * n + 0.015 * SIN(2 * PI() * n / 9.0))))::bigint,
    5.825
FROM generate_series(1, 30) AS n,
     (SELECT COALESCE(SUM(current_sats_balance), 0)::numeric AS base_aum FROM users) AS b
ON CONFLICT (snapshot_date) DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (4)
ON CONFLICT DO NOTHING;
