-- 000010_add_auth.up.sql
-- Add password_hash to users table for authentication

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

INSERT INTO _schema_versions (version) VALUES (10)
ON CONFLICT DO NOTHING;
