-- 000012_add_notifications.down.sql
-- Altradits: rollback notifications

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_preferences;
DROP TYPE IF EXISTS notification_type;

DELETE FROM _schema_versions WHERE version = 12;