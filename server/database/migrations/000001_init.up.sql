-- 000001_init.up.sql
-- Altradits: initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (foundation for all other modules)
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS _schema_versions (
    version     INT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _schema_versions (version) VALUES (1)
ON CONFLICT DO NOTHING;