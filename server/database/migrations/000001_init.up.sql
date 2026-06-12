-- 000001_init.up.sql
-- Altradits: wallet schema (users, Bitcoin Lightning + M-Pesa wallet ledger,
-- BTC/KES exchange rate cache)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE wallet_tx_type AS ENUM (
    'deposit_mpesa',
    'deposit_lightning',
    'withdraw_mpesa',
    'withdraw_lightning'
);

CREATE TYPE wallet_tx_status AS ENUM (
    'pending',
    'completed',
    'failed'
);

CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    password_hash           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login              TIMESTAMPTZ,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    lightning_enabled       BOOLEAN NOT NULL DEFAULT true,
    lightning_pubkey        TEXT,
    mpesa_phone_number      VARCHAR(15),
    preferred_currency      VARCHAR(10) NOT NULL DEFAULT 'sats',
    current_sats_balance    BIGINT NOT NULL DEFAULT 0,
    total_sats_received     BIGINT NOT NULL DEFAULT 0,
    total_sats_withdrawn    BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_users_preferred_currency CHECK (preferred_currency IN ('btc', 'sats', 'kes')),
    CONSTRAINT chk_users_sats_balance_nonneg CHECK (current_sats_balance >= 0)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_sats             BIGINT NOT NULL,
    amount_kes              NUMERIC(14, 2),
    type                    wallet_tx_type NOT NULL,
    status                  wallet_tx_status NOT NULL DEFAULT 'pending',
    mpesa_transaction_id    TEXT,
    lightning_invoice       TEXT,
    lightning_payment_hash  TEXT,
    description             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment_hash ON wallet_transactions(lightning_payment_hash);

CREATE TABLE IF NOT EXISTS exchange_rates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    btc_to_kes  NUMERIC(15, 2) NOT NULL,
    sats_to_kes NUMERIC(14, 8) GENERATED ALWAYS AS (btc_to_kes / 100000000) STORED,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated ON exchange_rates(updated_at DESC);

-- Seed a starting rate so the wallet has something to show before the first
-- background fetch completes. Replaced automatically once the exchange rate
-- worker reaches Coingecko.
INSERT INTO exchange_rates (btc_to_kes) VALUES (13000000)
ON CONFLICT DO NOTHING;

-- Schema version tracking
CREATE TABLE IF NOT EXISTS _schema_versions (
    version     INT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _schema_versions (version) VALUES (1)
ON CONFLICT DO NOTHING;
