-- 000016_exchange_rates.up.sql
-- Altradits V2: BTC/KES exchange rate cache (refreshed from Coingecko)

CREATE TABLE IF NOT EXISTS exchange_rates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    btc_to_kes  NUMERIC(15, 2) NOT NULL,
    sats_to_kes NUMERIC(14, 8) GENERATED ALWAYS AS (btc_to_kes / 100000000) STORED,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated ON exchange_rates(updated_at DESC);

-- Seed a starting rate so the wallet has something to show before the first
-- background fetch completes. Replaced automatically once the exchange rate
-- worker reaches Coingecko.
INSERT INTO exchange_rates (btc_to_kes) VALUES (13000000)
ON CONFLICT DO NOTHING;

INSERT INTO _schema_versions (version) VALUES (16)
ON CONFLICT DO NOTHING;
