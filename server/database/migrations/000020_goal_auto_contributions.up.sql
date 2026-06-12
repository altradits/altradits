-- 000020_goal_auto_contributions.up.sql
-- Altradits V2 Phase 4: recurring "auto-save" contributions to goals

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'auto_contribution';

CREATE TABLE IF NOT EXISTS goal_auto_contributions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id     UUID NOT NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    frequency   VARCHAR(10) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMPTZ NOT NULL,
    last_run_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_auto_contrib_due ON goal_auto_contributions(active, next_run_at);

INSERT INTO _schema_versions (version) VALUES (20)
ON CONFLICT DO NOTHING;
