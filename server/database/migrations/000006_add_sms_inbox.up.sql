-- 000006_add_sms_inbox.up.sql
-- Stores raw SMS messages before and after parsing.
-- Nothing in this table is automatically saved as a transaction.
-- The user must confirm each entry.

CREATE TYPE sms_status AS ENUM (
    'pending',    -- parsed, awaiting user confirmation
    'confirmed',  -- user confirmed, transaction created
    'dismissed'   -- user dismissed, not saved
);

CREATE TABLE IF NOT EXISTS sms_inbox (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    raw_text        TEXT NOT NULL,
    sender          TEXT,                    -- e.g. "MPESA", "Equity Bank"
    parsed_amount   NUMERIC(12, 2),
    parsed_desc     TEXT,
    parsed_category TEXT,
    parsed_type     TEXT,                    -- "debit", "credit", "transfer"
    confidence      INT DEFAULT 0,           -- 0-100
    transaction_id  UUID REFERENCES transactions(id),
    status          sms_status NOT NULL DEFAULT 'pending',
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_inbox_status ON sms_inbox(status);
CREATE INDEX IF NOT EXISTS idx_sms_inbox_user ON sms_inbox(user_id);

INSERT INTO _schema_versions (version) VALUES (6)
ON CONFLICT DO NOTHING;
