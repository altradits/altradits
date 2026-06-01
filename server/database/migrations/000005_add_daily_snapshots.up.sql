-- 000005_add_daily_snapshots.up.sql

CREATE TABLE IF NOT EXISTS daily_snapshots (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    total_spent      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_entries    INT NOT NULL DEFAULT 0,
    top_category     TEXT,
    reflection       TEXT,
    mood             TEXT CHECK (mood IN ('calm','okay','harder','stressed')),
    coaching_note    TEXT,
    tomorrow_preview TEXT,
    closed_at        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, snapshot_date)
);

-- Allow NULL user_id for now (single-user phase)
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_date_no_user
    ON daily_snapshots (snapshot_date)
    WHERE user_id IS NULL;

INSERT INTO _schema_versions (version) VALUES (5)
ON CONFLICT DO NOTHING;