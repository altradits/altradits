-- 000019_price_alerts.down.sql

DROP TABLE IF EXISTS price_alerts;

DELETE FROM _schema_versions WHERE version = 19;
