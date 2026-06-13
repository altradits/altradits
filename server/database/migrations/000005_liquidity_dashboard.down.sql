-- 000005_liquidity_dashboard.down.sql

DELETE FROM _schema_versions WHERE version = 5;

DROP INDEX IF EXISTS idx_liquidity_action_log_created_at;
DROP TABLE IF EXISTS liquidity_action_log;
DROP TABLE IF EXISTS liquidity_config;
DROP TABLE IF EXISTS ln_routing_fee_history;
DROP TABLE IF EXISTS ln_onchain_txs;
DROP TABLE IF EXISTS ln_peers;
DROP TABLE IF EXISTS ln_channels;
DROP TABLE IF EXISTS ln_node_status;
