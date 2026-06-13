-- 000004_trader_dashboard.down.sql

DELETE FROM _schema_versions WHERE version = 4;

-- Best-effort: remove the seeded synthetic NAV history (assumes down runs
-- the same day as up — any real snapshots from prior days would also be
-- removed, but the worker only started writing them after this migration).
DELETE FROM pool_nav_snapshots WHERE snapshot_date < CURRENT_DATE;

DROP INDEX IF EXISTS idx_pool_rebalance_log_created_at;
DROP TABLE IF EXISTS pool_rebalance_log;
DROP TABLE IF EXISTS pool_config;

DELETE FROM pool_assets WHERE asset_class = 'tokenized_rwa';

UPDATE pool_assets SET allocation_pct = 40 WHERE asset_class = 'bond_funds';
UPDATE pool_assets SET allocation_pct = 30 WHERE asset_class = 'money_market';
UPDATE pool_assets SET allocation_pct = 20 WHERE asset_class = 'dividend_equities';
UPDATE pool_assets SET allocation_pct = 10 WHERE asset_class = 'cash_btc';

ALTER TABLE pool_assets DROP COLUMN IF EXISTS risk_score;
