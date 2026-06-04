-- 000009_add_companion.up.sql

CREATE TYPE companion_type AS ENUM (
    'seed',
    'puppy',
    'kitten',
    'tree'
);

CREATE TYPE companion_level AS ENUM (
    'sprout',     -- Level 1: just starting
    'growing',    -- Level 2: building habits
    'thriving',   -- Level 3: consistent
    'flourishing' -- Level 4: mastery
);

CREATE TABLE IF NOT EXISTS companion_state (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    companion       companion_type NOT NULL DEFAULT 'seed',
    level           companion_level NOT NULL DEFAULT 'sprout',
    xp              INT NOT NULL DEFAULT 0,
    xp_to_next      INT NOT NULL DEFAULT 50,
    streak_days     INT NOT NULL DEFAULT 0,
    longest_streak  INT NOT NULL DEFAULT 0,
    total_checkins  INT NOT NULL DEFAULT 0,
    last_checkin    DATE,
    milestones      JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- System default companion (user_id IS NULL)
INSERT INTO companion_state (companion, level, xp, xp_to_next)
VALUES ('seed', 'sprout', 0, 50)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS companion_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,  -- 'bedtime', 'capture', 'goal', 'reflection', 'streak'
    xp_awarded  INT NOT NULL DEFAULT 0,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companion_events_user ON companion_events(user_id);
CREATE INDEX IF NOT EXISTS idx_companion_events_date ON companion_events(created_at DESC);

INSERT INTO _schema_versions (version) VALUES (9)
ON CONFLICT DO NOTHING;
