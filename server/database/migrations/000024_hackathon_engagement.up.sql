-- 000024_hackathon_engagement.up.sql
-- Hackathon platform: daily notes, QR check-in, live chat, homework, social posts

CREATE TABLE IF NOT EXISTS hackathon_daily_notes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    day_number    INT NOT NULL CHECK (day_number >= 1),
    title         TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    resources     TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hackathon_id, day_number)
);

CREATE TABLE IF NOT EXISTS hackathon_checkin_codes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    day_number    INT NOT NULL CHECK (day_number >= 1),
    code          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hackathon_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_checkin_codes_code ON hackathon_checkin_codes(hackathon_id, code);

CREATE TABLE IF NOT EXISTS hackathon_checkins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_number    INT NOT NULL CHECK (day_number >= 1),
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hackathon_id, user_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_checkins_hackathon ON hackathon_checkins(hackathon_id, day_number);

CREATE TABLE IF NOT EXISTS hackathon_chat_messages (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    team_id       UUID REFERENCES hackathon_teams(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hackathon_chat_room ON hackathon_chat_messages(hackathon_id, team_id, created_at);

CREATE TYPE hackathon_submission_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TABLE IF NOT EXISTS hackathon_homework (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    day_number    INT NOT NULL CHECK (day_number >= 1),
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    reward_sats   BIGINT NOT NULL DEFAULT 0 CHECK (reward_sats >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hackathon_homework_hackathon ON hackathon_homework(hackathon_id, day_number);

CREATE TABLE IF NOT EXISTS hackathon_homework_submissions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    homework_id   UUID NOT NULL REFERENCES hackathon_homework(id) ON DELETE CASCADE,
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,
    status        hackathon_submission_status NOT NULL DEFAULT 'pending',
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ,
    UNIQUE (homework_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_homework_submissions_homework ON hackathon_homework_submissions(homework_id, status);

ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS social_post_reward_sats BIGINT NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS hackathon_social_posts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform      TEXT NOT NULL DEFAULT '',
    url           TEXT NOT NULL,
    status        hackathon_submission_status NOT NULL DEFAULT 'pending',
    reward_sats   BIGINT NOT NULL DEFAULT 0 CHECK (reward_sats >= 0),
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hackathon_social_posts_hackathon ON hackathon_social_posts(hackathon_id, status);

CREATE TABLE IF NOT EXISTS hackathon_rewards (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,
    source_id     UUID NOT NULL,
    amount_sats   BIGINT NOT NULL CHECK (amount_sats > 0),
    awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hackathon_rewards_user ON hackathon_rewards(user_id);

INSERT INTO _schema_versions (version) VALUES (24)
ON CONFLICT DO NOTHING;
