-- 000001_init.down.sql

DROP TABLE IF EXISTS _schema_versions;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS wallet_tx_status;
DROP TYPE IF EXISTS wallet_tx_type;
