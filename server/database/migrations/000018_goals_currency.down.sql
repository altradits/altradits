-- 000018_goals_currency.down.sql

ALTER TABLE goals DROP CONSTRAINT IF EXISTS chk_goals_currency;
ALTER TABLE goals DROP COLUMN IF EXISTS currency;

DELETE FROM _schema_versions WHERE version = 18;
