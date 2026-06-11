-- 000015_wallet_transactions.down.sql

DROP TABLE IF EXISTS wallet_transactions;
DROP TYPE IF EXISTS wallet_tx_status;
DROP TYPE IF EXISTS wallet_tx_type;

DELETE FROM _schema_versions WHERE version = 15;
