-- 000003_add_pool_and_lightning_address.down.sql

DELETE FROM _schema_versions WHERE version = 3;

DROP INDEX IF EXISTS idx_interest_accruals_user_id;
DROP TABLE IF EXISTS interest_accruals;
DROP TABLE IF EXISTS pool_nav_snapshots;
DROP TABLE IF EXISTS pool_assets;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP COLUMN IF EXISTS username;

-- Note: the 'interest' value added to wallet_tx_type by the .up migration
-- cannot be removed without recreating the enum type (Postgres does not
-- support DROP VALUE on enums). Left in place intentionally.
