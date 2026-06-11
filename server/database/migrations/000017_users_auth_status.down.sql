-- 000017_users_auth_status.down.sql

ALTER TABLE users DROP COLUMN IF EXISTS last_login;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;

DELETE FROM _schema_versions WHERE version = 17;
