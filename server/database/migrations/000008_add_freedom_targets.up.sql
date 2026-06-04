-- 000008_add_freedom_targets.up.sql
-- Stores the user's financial freedom targets and commitments.

CREATE TABLE IF NOT EXISTS freedom_targets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    monthly_savings     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    target_passive      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    assumed_return_pct  NUMERIC(5, 2)  NOT NULL DEFAULT 12.00,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- Ensure only one row exists when user_id is NULL (system default)
CREATE UNIQUE INDEX IF NOT EXISTS idx_freedom_targets_no_user
    ON freedom_targets (user_id)
    WHERE user_id IS NULL;

-- System default target (user_id IS NULL)
INSERT INTO freedom_targets
    (monthly_savings, target_passive, assumed_return_pct, notes)
VALUES
    (10000, 100000, 12.00, 'Default freedom target')
ON CONFLICT DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (8)
ON CONFLICT DO NOTHING;
