-- 000018_goals_currency.up.sql
-- Altradits V2 Phase 2: Bitcoin savings goals
-- A goal can now be denominated in KES (existing manual-tracking behavior)
-- or sats (target/saved are earmarked from the user's Lightning wallet).

ALTER TABLE goals ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'kes';
ALTER TABLE goals ADD CONSTRAINT chk_goals_currency CHECK (currency IN ('kes', 'sats'));

INSERT INTO _schema_versions (version) VALUES (18)
ON CONFLICT DO NOTHING;
