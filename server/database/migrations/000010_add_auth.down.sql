-- 000010_add_auth.down.sql
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
