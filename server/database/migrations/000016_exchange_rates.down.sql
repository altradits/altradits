-- 000016_exchange_rates.down.sql

DROP TABLE IF EXISTS exchange_rates;

DELETE FROM _schema_versions WHERE version = 16;
