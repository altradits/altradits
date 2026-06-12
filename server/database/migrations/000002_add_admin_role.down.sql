-- 000002_add_admin_role.down.sql

DELETE FROM _schema_versions WHERE version = 2;

ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
