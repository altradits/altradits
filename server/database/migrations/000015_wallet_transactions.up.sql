-- 000015_wallet_transactions.up.sql
-- Altradits V2: Bitcoin Lightning + M-Pesa wallet ledger

CREATE TYPE wallet_tx_type AS ENUM (
    'deposit_mpesa',
    'deposit_lightning',
    'withdraw_mpesa',
    'withdraw_lightning'
);

CREATE TYPE wallet_tx_status AS ENUM (
    'pending',
    'completed',
    'failed'
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_sats             BIGINT NOT NULL,
    amount_kes              NUMERIC(14, 2),
    type                    wallet_tx_type NOT NULL,
    status                  wallet_tx_status NOT NULL DEFAULT 'pending',
    mpesa_transaction_id    TEXT,
    lightning_invoice       TEXT,
    lightning_payment_hash  TEXT,
    description             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment_hash ON wallet_transactions(lightning_payment_hash);

INSERT INTO _schema_versions (version) VALUES (15)
ON CONFLICT DO NOTHING;
