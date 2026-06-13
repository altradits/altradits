-- 000005_liquidity_dashboard.up.sql
-- Adds the Lightning & Liquidity Dashboard: node identity/on-chain reserve,
-- channel topology, peers, on-chain tx history, synthetic routing-fee
-- revenue history, liquidity/M-Pesa float config, and an action audit log.

-- 1. Node identity + on-chain reserve (single row)
CREATE TABLE IF NOT EXISTS ln_node_status (
    id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    alias                    TEXT NOT NULL,
    pubkey                   TEXT NOT NULL,
    block_height             BIGINT NOT NULL,
    synced_to_chain          BOOLEAN NOT NULL DEFAULT TRUE,
    version                  TEXT NOT NULL,
    started_at               TIMESTAMPTZ NOT NULL,
    onchain_confirmed_sats   BIGINT NOT NULL DEFAULT 0,
    onchain_unconfirmed_sats BIGINT NOT NULL DEFAULT 0
);

INSERT INTO ln_node_status (id, alias, pubkey, block_height, synced_to_chain, version, started_at, onchain_confirmed_sats, onchain_unconfirmed_sats)
VALUES (1, 'altradits-node', '03b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', 894213, TRUE, '0.20.0-beta', NOW() - INTERVAL '14 days', 1500000, 0)
ON CONFLICT (id) DO NOTHING;

-- 2. Channels (seed: one balanced, two imbalanced, one zombie)
CREATE TABLE IF NOT EXISTS ln_channels (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id          TEXT UNIQUE NOT NULL,
    peer_alias          TEXT NOT NULL,
    peer_pubkey         TEXT NOT NULL,
    capacity_sats       BIGINT NOT NULL,
    local_balance_sats  BIGINT NOT NULL,
    remote_balance_sats BIGINT NOT NULL,
    fee_rate_ppm        INTEGER NOT NULL DEFAULT 1000,
    base_fee_msat       INTEGER NOT NULL DEFAULT 1000,
    status              TEXT NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ln_channels (channel_id, peer_alias, peer_pubkey, capacity_sats, local_balance_sats, remote_balance_sats, fee_rate_ppm, base_fee_msat, status) VALUES
    ('893421x1x0', 'Hub Alpha',    '02a1...alpha',  500000, 250000, 250000, 800,  1000, 'active'),
    ('893455x2x0', 'Hub Beta',     '02b2...beta',   300000, 270000,  30000, 600,  1000, 'active'),
    ('893488x1x0', 'Regional LSP', '02c3...lsp',    200000,  10000, 190000, 1200, 1000, 'active'),
    ('892900x3x0', 'Legacy Peer',  '02d4...legacy', 100000,  50000,  50000, 500,  1000, 'inactive')
ON CONFLICT (channel_id) DO NOTHING;

-- 3. Peers (network graph + disconnection alerts; includes one peer with no channel yet)
CREATE TABLE IF NOT EXISTS ln_peers (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pubkey    TEXT UNIQUE NOT NULL,
    alias     TEXT NOT NULL,
    address   TEXT NOT NULL,
    connected BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO ln_peers (pubkey, alias, address, connected) VALUES
    ('02a1...alpha',  'Hub Alpha',        '203.0.113.10:9735', TRUE),
    ('02b2...beta',   'Hub Beta',         '203.0.113.20:9735', TRUE),
    ('02c3...lsp',    'Regional LSP',     '203.0.113.30:9735', TRUE),
    ('02d4...legacy', 'Legacy Peer',      '203.0.113.40:9735', FALSE),
    ('02e5...new',    'New Partner Node', '203.0.113.50:9735', FALSE)
ON CONFLICT (pubkey) DO NOTHING;

-- 4. On-chain tx history
CREATE TABLE IF NOT EXISTS ln_onchain_txs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    direction     TEXT NOT NULL,
    amount_sats   BIGINT NOT NULL,
    txid          TEXT NOT NULL,
    confirmations INTEGER NOT NULL DEFAULT 6,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ln_onchain_txs (direction, amount_sats, txid, confirmations, created_at) VALUES
    ('in',  1000000, 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f91', 144, NOW() - INTERVAL '12 days'),
    ('in',   500000, 'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f912a', 60,  NOW() - INTERVAL '5 days'),
    ('out',  150000, 'c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9123ab', 20,  NOW() - INTERVAL '2 days'),
    ('in',   200000, 'd4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9123abcd', 6,   NOW() - INTERVAL '6 hours'),
    ('out',   50000, 'e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9123abcde1', 1,   NOW() - INTERVAL '20 minutes');

-- 5. Synthetic 30-day routing fee revenue history (small upward-trending values + noise)
CREATE TABLE IF NOT EXISTS ln_routing_fee_history (
    snapshot_date DATE PRIMARY KEY,
    fee_sats      BIGINT NOT NULL
);

INSERT INTO ln_routing_fee_history (snapshot_date, fee_sats)
SELECT (CURRENT_DATE - n)::date,
       GREATEST(0, ROUND(20 + (29 - n) * 0.4 + (n % 4 - 1.5) * 3))::bigint
FROM generate_series(0, 29) AS n
ON CONFLICT (snapshot_date) DO NOTHING;

-- 6. Liquidity + M-Pesa float config (single row). Float seeded below the
-- low threshold so the worker's auto-replenish runs once at startup and is
-- visible in the action log; the two imbalanced channels + the zombie
-- channel keep the alert feed populated regardless.
CREATE TABLE IF NOT EXISTS liquidity_config (
    id                                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hot_wallet_min_sats               BIGINT NOT NULL,
    auto_open_channel_threshold_sats  BIGINT NOT NULL,
    mpesa_float_balance_kes           NUMERIC(14, 2) NOT NULL,
    mpesa_float_low_threshold_kes     NUMERIC(14, 2) NOT NULL,
    mpesa_float_high_threshold_kes    NUMERIC(14, 2) NOT NULL,
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO liquidity_config (id, hot_wallet_min_sats, auto_open_channel_threshold_sats, mpesa_float_balance_kes, mpesa_float_low_threshold_kes, mpesa_float_high_threshold_kes)
VALUES (1, 200000, 150000, 15000, 20000, 100000)
ON CONFLICT (id) DO NOTHING;

-- 7. Audit log for all channel/swap/float actions (manual + automated)
CREATE TABLE IF NOT EXISTS liquidity_action_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type  TEXT NOT NULL,
    channel_id   TEXT,
    detail       TEXT NOT NULL,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liquidity_action_log_created_at ON liquidity_action_log(created_at DESC);

INSERT INTO _schema_versions (version) VALUES (5) ON CONFLICT DO NOTHING;
