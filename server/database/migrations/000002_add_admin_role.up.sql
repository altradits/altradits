-- 000002_add_admin_role.up.sql
-- Adds an admin role flag to users so the platform can have admin accounts
-- alongside regular wallet users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

INSERT INTO _schema_versions (version) VALUES (2)
ON CONFLICT DO NOTHING;
