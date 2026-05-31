-- 000002_add_transactions.up.sql

CREATE TYPE transaction_source AS ENUM (
    'manual',
    'sms',
    'ocr',
    'voice'
);

CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    raw_input   TEXT NOT NULL,
    description TEXT NOT NULL,
    amount      NUMERIC(12, 2) NOT NULL,
    category    TEXT NOT NULL DEFAULT 'uncategorized',
    source      transaction_source NOT NULL DEFAULT 'manual',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

INSERT INTO _schema_versions (version) VALUES (2)
ON CONFLICT DO NOTHING;