-- 000003_add_budgets.up.sql

CREATE TABLE IF NOT EXISTS budgets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    category    TEXT NOT NULL,
    amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    period      TEXT NOT NULL DEFAULT 'monthly',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, category)
);

-- Seed default budget categories (no user_id = system defaults)
INSERT INTO budgets (id, category, amount, period) VALUES
    (uuid_generate_v4(), 'food',          5000,  'monthly'),
    (uuid_generate_v4(), 'transport',     3000,  'monthly'),
    (uuid_generate_v4(), 'bills',         10000, 'monthly'),
    (uuid_generate_v4(), 'family',        5000,  'monthly'),
    (uuid_generate_v4(), 'investments',   10000, 'monthly'),
    (uuid_generate_v4(), 'fun',           2000,  'monthly'),
    (uuid_generate_v4(), 'savings',       5000,  'monthly'),
    (uuid_generate_v4(), 'health',        2000,  'monthly'),
    (uuid_generate_v4(), 'uncategorized', 0,     'monthly')
ON CONFLICT DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (3)
ON CONFLICT DO NOTHING;