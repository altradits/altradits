DROP INDEX IF EXISTS idx_notifications_status;

ALTER TABLE notifications
    ADD COLUMN read BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN sent_at TIMESTAMPTZ;

UPDATE notifications SET read = (status = 'read');

ALTER TABLE notifications DROP COLUMN IF EXISTS status;
ALTER TABLE notifications DROP COLUMN IF EXISTS read_at;
ALTER TABLE notifications DROP COLUMN IF EXISTS expires_at;

ALTER TABLE notifications RENAME COLUMN metadata TO data;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_key;
ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_pkey;
ALTER TABLE notification_preferences ADD PRIMARY KEY (user_id);
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS id;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS weekly_summary_day;

ALTER TABLE notification_preferences RENAME COLUMN bedtime_reminder TO bedtime_reminder_enabled;
ALTER TABLE notification_preferences RENAME COLUMN bill_approaching TO bill_approaching_enabled;
ALTER TABLE notification_preferences RENAME COLUMN goal_milestone TO goal_milestone_enabled;
ALTER TABLE notification_preferences RENAME COLUMN streak_at_risk TO streak_at_risk_enabled;
ALTER TABLE notification_preferences RENAME COLUMN weekly_summary TO weekly_summary_enabled;

DROP TYPE IF EXISTS notification_status;

DELETE FROM _schema_versions WHERE version = 13;
