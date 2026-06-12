-- 000022_net_worth_snapshots.up.sql
-- Altradits V2 Phase 6: net worth / portfolio tracking

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    wallet_kes      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    investments_kes NUMERIC(14, 2) NOT NULL DEFAULT 0,
    goals_kes       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_kes       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_date ON net_worth_snapshots(user_id, snapshot_date);

INSERT INTO _schema_versions (version) VALUES (22)
ON CONFLICT DO NOTHING;
