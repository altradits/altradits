-- 000007_add_investments.up.sql
-- Altradits: add investments table

CREATE TYPE investment_type AS ENUM (
    'mmf',        -- Money Market Fund
    'tbill',      -- Treasury Bill
    'bond',       -- Government / Corporate Bond
    'stock',      -- Equities
    'etf',        -- Exchange Traded Fund
    'sacco',      -- SACCO
    'fixed',      -- Fixed Deposit
    'crypto',     -- Cryptocurrency
    'other'       -- Anything else
);

CREATE TABLE IF NOT EXISTS investments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    institution     TEXT,
    type            investment_type NOT NULL DEFAULT 'other',
    principal       NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- original amount invested
    current_value   NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- latest known value
    currency        TEXT NOT NULL DEFAULT 'KES',
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    started_at      DATE,
    matures_at      DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);

-- Seed example positions (user_id IS NULL = system examples)
INSERT INTO investments (name, institution, type, principal, current_value, started_at) VALUES
    ('Oak Special Fund',  'Old Mutual',    'mmf',   50000,  52300,  CURRENT_DATE - INTERVAL '6 months'),
    ('91-Day T-Bill',     'CBK',           'tbill', 100000, 101500, CURRENT_DATE - INTERVAL '2 months'),
    ('Safaricom Shares',  'Nairobi SE',    'stock',  20000,  18400, CURRENT_DATE - INTERVAL '1 year')
ON CONFLICT DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (7)
ON CONFLICT DO NOTHING;