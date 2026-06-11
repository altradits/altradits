-- 000014_wallet_fields.down.sql

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_preferred_currency;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_sats_balance_nonneg;

ALTER TABLE users DROP COLUMN IF EXISTS preferred_currency;
ALTER TABLE users DROP COLUMN IF EXISTS mpesa_phone_number;
ALTER TABLE users DROP COLUMN IF EXISTS total_sats_withdrawn;
ALTER TABLE users DROP COLUMN IF EXISTS total_sats_received;
ALTER TABLE users DROP COLUMN IF EXISTS current_sats_balance;
ALTER TABLE users DROP COLUMN IF EXISTS lightning_pubkey;
ALTER TABLE users DROP COLUMN IF EXISTS lightning_enabled;

DELETE FROM _schema_versions WHERE version = 14;
