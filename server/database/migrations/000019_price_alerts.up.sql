-- 000019_price_alerts.up.sql
-- Altradits V2 Phase 3: BTC price tracking & alerts

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'price_alert';

CREATE TABLE IF NOT EXISTS price_alerts (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction    VARCHAR(10) NOT NULL CHECK (direction IN ('above', 'below')),
    target_kes   NUMERIC(15, 2) NOT NULL CHECK (target_kes > 0),
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    triggered_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_active ON price_alerts(user_id, active);

INSERT INTO _schema_versions (version) VALUES (19)
ON CONFLICT DO NOTHING;
