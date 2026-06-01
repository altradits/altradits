-- 000004_add_goals.up.sql

CREATE TABLE IF NOT EXISTS goals (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    emoji        TEXT NOT NULL DEFAULT '🎯',
    target       NUMERIC(12, 2) NOT NULL,
    saved        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    deadline     DATE,
    completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

-- Seed example goals (user_id IS NULL = system examples)
INSERT INTO goals (name, emoji, target, saved, deadline) VALUES
    ('Emergency Fund',  '🛡️',  50000,  0,     NULL),
    ('Birthday Fund',   '🎂',  10000,  0,     NULL),
    ('Laptop',          '💻',  80000,  0,     NULL)
ON CONFLICT DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (4)
ON CONFLICT DO NOTHING;
