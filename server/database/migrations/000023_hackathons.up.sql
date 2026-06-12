-- 000023_hackathons.up.sql
-- Hackathon platform: hackathons, hacker applications, teams, team membership

CREATE TYPE hackathon_status AS ENUM (
    'draft',
    'open',
    'in_progress',
    'judging',
    'completed'
);

CREATE TABLE IF NOT EXISTS hackathons (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    theme                 TEXT NOT NULL DEFAULT '',
    status                hackathon_status NOT NULL DEFAULT 'draft',
    application_deadline  TIMESTAMPTZ,
    start_date            TIMESTAMPTZ,
    end_date              TIMESTAMPTZ,
    min_team_size         INT NOT NULL DEFAULT 2,
    max_team_size         INT NOT NULL DEFAULT 5,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT hackathons_team_size_check CHECK (min_team_size >= 1 AND max_team_size >= min_team_size)
);

CREATE INDEX IF NOT EXISTS idx_hackathons_organizer ON hackathons(organizer_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(status);

CREATE TYPE hackathon_application_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'waitlisted'
);

CREATE TABLE IF NOT EXISTS hackathon_applications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        hackathon_application_status NOT NULL DEFAULT 'pending',
    motivation    TEXT NOT NULL DEFAULT '',
    skills        TEXT NOT NULL DEFAULT '',
    applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ,
    UNIQUE (hackathon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_applications_hackathon ON hackathon_applications(hackathon_id, status);
CREATE INDEX IF NOT EXISTS idx_hackathon_applications_user ON hackathon_applications(user_id);

CREATE TYPE hackathon_team_role AS ENUM (
    'leader',
    'member'
);

CREATE TABLE IF NOT EXISTS hackathon_teams (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hackathon_id, name)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_teams_hackathon ON hackathon_teams(hackathon_id);

CREATE TABLE IF NOT EXISTS hackathon_team_members (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id       UUID NOT NULL REFERENCES hackathon_teams(id) ON DELETE CASCADE,
    hackathon_id  UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          hackathon_team_role NOT NULL DEFAULT 'member',
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id),
    UNIQUE (hackathon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_team_members_team ON hackathon_team_members(team_id);

INSERT INTO _schema_versions (version) VALUES (23)
ON CONFLICT DO NOTHING;
