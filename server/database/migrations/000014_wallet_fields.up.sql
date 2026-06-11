-- 000014_wallet_fields.up.sql
-- Altradits V2: add Bitcoin Lightning wallet fields to users

ALTER TABLE users ADD COLUMN IF NOT EXISTS lightning_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lightning_pubkey TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_sats_balance BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_sats_received BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_sats_withdrawn BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mpesa_phone_number VARCHAR(15);
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(10) NOT NULL DEFAULT 'sats';

ALTER TABLE users ADD CONSTRAINT chk_users_sats_balance_nonneg CHECK (current_sats_balance >= 0);
ALTER TABLE users ADD CONSTRAINT chk_users_preferred_currency CHECK (preferred_currency IN ('btc', 'sats', 'kes'));

INSERT INTO _schema_versions (version) VALUES (14)
ON CONFLICT DO NOTHING;
