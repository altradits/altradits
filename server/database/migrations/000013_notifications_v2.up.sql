-- 000013_notifications_v2.up.sql
-- Align notifications schema with Phase 13 spec

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'general';

CREATE TYPE notification_status AS ENUM (
    'pending',
    'delivered',
    'read',
    'dismissed'
);

ALTER TABLE notifications RENAME COLUMN data TO metadata;

ALTER TABLE notifications
    ADD COLUMN status notification_status NOT NULL DEFAULT 'pending',
    ADD COLUMN read_at TIMESTAMPTZ,
    ADD COLUMN expires_at TIMESTAMPTZ;

UPDATE notifications SET status = 'read' WHERE read = TRUE;
UPDATE notifications SET expires_at = created_at + INTERVAL '7 days' WHERE expires_at IS NULL;

ALTER TABLE notifications DROP COLUMN IF EXISTS read;
ALTER TABLE notifications DROP COLUMN IF EXISTS sent_at;

DROP INDEX IF EXISTS idx_notifications_user_read;
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(user_id, status);

ALTER TABLE notification_preferences RENAME COLUMN bedtime_reminder_enabled TO bedtime_reminder;
ALTER TABLE notification_preferences RENAME COLUMN bill_approaching_enabled TO bill_approaching;
ALTER TABLE notification_preferences RENAME COLUMN goal_milestone_enabled TO goal_milestone;
ALTER TABLE notification_preferences RENAME COLUMN streak_at_risk_enabled TO streak_at_risk;
ALTER TABLE notification_preferences RENAME COLUMN weekly_summary_enabled TO weekly_summary;

ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4(),
    ADD COLUMN IF NOT EXISTS weekly_summary_day INT NOT NULL DEFAULT 1;

UPDATE notification_preferences SET id = uuid_generate_v4() WHERE id IS NULL;

ALTER TABLE notification_preferences ALTER COLUMN id SET NOT NULL;
ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_pkey;
ALTER TABLE notification_preferences ADD PRIMARY KEY (id);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);

ALTER TABLE notification_preferences ALTER COLUMN bedtime_reminder SET DEFAULT TRUE;
ALTER TABLE notification_preferences ALTER COLUMN bill_approaching SET DEFAULT TRUE;
ALTER TABLE notification_preferences ALTER COLUMN goal_milestone SET DEFAULT TRUE;
ALTER TABLE notification_preferences ALTER COLUMN streak_at_risk SET DEFAULT TRUE;
ALTER TABLE notification_preferences ALTER COLUMN weekly_summary SET DEFAULT TRUE;

INSERT INTO _schema_versions (version) VALUES (13)
ON CONFLICT DO NOTHING;
