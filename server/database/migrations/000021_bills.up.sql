-- 000021_bills.up.sql
-- Altradits V2 Phase 5: recurring bills tracking & reminders

CREATE TABLE IF NOT EXISTS bills (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    emoji             VARCHAR(10) NOT NULL DEFAULT '🧾',
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    category          TEXT NOT NULL DEFAULT 'bills',
    frequency         VARCHAR(10) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    next_due_date     DATE NOT NULL,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    last_notified_for DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_user_active ON bills(user_id, active);

INSERT INTO _schema_versions (version) VALUES (21)
ON CONFLICT DO NOTHING;
