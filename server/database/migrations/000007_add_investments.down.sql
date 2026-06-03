-- 000007_add_investments.down.sql
-- Altradits: drop investments table

DROP INDEX IF EXISTS idx_investments_type;
DROP INDEX IF EXISTS idx_investments_user;
DROP TABLE IF EXISTS investments;
DROP TYPE IF EXISTS investment_type;

DELETE FROM _schema_versions WHERE version = 7;