-- 000012_add_notifications.up.sql
-- Altradits: notifications and preferences

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'bedtime_reminder',
    'bill_approaching',
    'goal_milestone',
    'streak_at_risk',
    'weekly_summary'
);

-- Notification preferences for each user
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bedtime_reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    bedtime_reminder_time TIME NOT NULL DEFAULT '21:00:00',
    bill_approaching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    goal_milestone_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    streak_at_risk_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    weekly_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    quiet_hours_start TIME NOT NULL DEFAULT '22:00:00',
    quiet_hours_end TIME NOT NULL DEFAULT '07:00:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Schema version tracking
INSERT INTO _schema_versions (version) VALUES (12)
ON CONFLICT DO NOTHING;