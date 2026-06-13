-- 000003_add_pool_and_lightning_address.up.sql
-- Adds: Lightning addresses (username@<domain>), a real ledger-backed pool
-- allocation model, NAV/AUM history, and per-user monthly interest accruals.

-- 1. New wallet transaction type for interest credits. Must not be
-- referenced by other statements in this same transaction (Postgres
-- restriction on newly-added enum values).
ALTER TYPE wallet_tx_type ADD VALUE 'interest';

-- 2. Lightning address: username column on users
ALTER TABLE users ADD COLUMN username TEXT;

UPDATE users SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9]', '', 'g'))
                              || '_' || SUBSTRING(id::text, 1, 6)
WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);

-- 3. Pool allocation (admin/trader-managed; drives the customer "pool" donut
-- and feeds the Trader/Founder dashboards later).
CREATE TABLE IF NOT EXISTS pool_assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    asset_class     TEXT NOT NULL UNIQUE,
    allocation_pct  NUMERIC(5, 2) NOT NULL,
    apy_pct         NUMERIC(5, 2) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pool_assets (name, asset_class, allocation_pct, apy_pct) VALUES
    ('Bond Funds', 'bond_funds', 40, 6.5),
    ('Money Market Funds', 'money_market', 30, 5.0),
    ('Dividend Equities', 'dividend_equities', 20, 8.0),
    ('Cash & On-chain BTC', 'cash_btc', 10, 0)
ON CONFLICT (asset_class) DO NOTHING;

-- 4. Pool NAV/AUM history (foundation for Trader/Founder dashboards).
CREATE TABLE IF NOT EXISTS pool_nav_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date   DATE NOT NULL UNIQUE,
    aum_sats        BIGINT NOT NULL,
    blended_apy_pct NUMERIC(5, 2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Per-user monthly interest ledger.
CREATE TABLE IF NOT EXISTS interest_accruals (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_transaction_id   UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
    amount_sats             BIGINT NOT NULL,
    apy_pct                 NUMERIC(5, 2) NOT NULL,
    period_start            DATE NOT NULL,
    period_end              DATE NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interest_accruals_user_id ON interest_accruals(user_id);

INSERT INTO _schema_versions (version) VALUES (3)
ON CONFLICT DO NOTHING;
