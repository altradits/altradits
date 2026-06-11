-- 000017_users_auth_status.up.sql
-- Fix login: auth.Service.Login/Me reference users.is_active and users.last_login,
-- but these columns were never added to the users table.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

INSERT INTO _schema_versions (version) VALUES (17)
ON CONFLICT DO NOTHING;
