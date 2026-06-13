#!/usr/bin/env bash
set -euo pipefail

# Prints a ground-truth snapshot of a Polar regtest LND node (default: bob),
# straight from lncli inside its container — useful for cross-checking the
# /liquidity admin dashboard against the real node state.

NODE="${1:-bob}"
CONTAINER="polar-n1-${NODE}"
CERT=/home/lnd/.lnd/tls.cert
MACAROON=/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER is not running. Start it with: make dev-lightning"
  exit 1
fi

lncli() {
  docker exec "$CONTAINER" lncli --tlscertpath="$CERT" --macaroonpath="$MACAROON" "$@"
}

echo "==> $NODE ($CONTAINER)"
echo ""
echo "--- Node info ---"
lncli getinfo | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'alias:             {d[\"alias\"]}')
print(f'pubkey:            {d[\"identity_pubkey\"]}')
print(f'version:           {d[\"version\"]}')
print(f'block_height:      {d[\"block_height\"]}')
print(f'synced_to_chain:   {d[\"synced_to_chain\"]}')
print(f'active_channels:   {d[\"num_active_channels\"]}')
print(f'inactive_channels: {d[\"num_inactive_channels\"]}')
print(f'peers:             {d[\"num_peers\"]}')
"

echo ""
echo "--- Balances ---"
lncli walletbalance | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'on-chain (confirmed): {int(d[\"confirmed_balance\"]):>12,} sats')
"
lncli channelbalance | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'channel local:        {int(d[\"local_balance\"][\"sat\"]):>12,} sats')
print(f'channel remote:       {int(d[\"remote_balance\"][\"sat\"]):>12,} sats')
"

echo ""
echo "--- Channels ---"
lncli listchannels | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d['channels']:
    print('(none)')
for c in d['channels']:
    status = 'active' if c['active'] else 'inactive'
    print(f'  peer={c[\"remote_pubkey\"][:16]}...  local={int(c[\"local_balance\"]):>10,} sat  remote={int(c[\"remote_balance\"]):>10,} sat  [{status}]')
"

echo ""
echo "--- Peers ---"
lncli listpeers | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d['peers']:
    print('(none connected)')
for p in d['peers']:
    print(f'  pubkey={p[\"pub_key\"][:16]}...  address={p[\"address\"]}')
"
