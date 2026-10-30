#!/bin/sh
# Node health check, run on the Mac that hosts the Lightning node (read-only:
# it changes nothing and never prints a secret). Compares the installed Bitcoin
# Core and LND with the latest releases, and flags settings that history says
# matter (single light-client peer, zero-conf, plain-text RPC passwords, an
# admin macaroon left on disk, the firewall).
#   sh deploy/node-check.sh
LNDDIR="${LNDDIR:-$HOME/.lnd-altradits}"
BTCDIR="${BTCDIR:-$HOME/Library/Application Support/Bitcoin}"
MAC="$LNDDIR/data/chain/bitcoin/mainnet"
say() { printf '%s\n' "$*"; }
flag() { printf '  ! %s\n' "$*"; }
ok() { printf '  ok %s\n' "$*"; }

say "== Versions"
CORE=$(bitcoind --version 2>/dev/null | head -1 | sed 's/.*version //')
LND=$(lnd --version 2>/dev/null | sed 's/lnd version //; s/ commit=.*//')
say "  Bitcoin Core: ${CORE:-not found}   LND: ${LND:-not found}"
if command -v curl >/dev/null; then
  LATEST_CORE=$(curl -fsS https://api.github.com/repos/bitcoin/bitcoin/tags 2>/dev/null | grep -o '"name": "v[0-9]*\.[0-9]*"' | head -1 | sed 's/.*"v//; s/"//')
  LATEST_LND=$(curl -fsS https://api.github.com/repos/lightningnetwork/lnd/releases/latest 2>/dev/null | grep -o '"tag_name": "[^"]*"' | sed 's/.*: "//; s/"//')
  say "  Latest: Bitcoin Core v${LATEST_CORE:-?}   LND ${LATEST_LND:-?}"
fi
case "$CORE" in v2[0-9].*|v1*|v0*) flag "Bitcoin Core $CORE is end of life (29.x ended 27 Oct 2026): upgrade to a maintained release after verifying its signatures.";; *) [ -n "$CORE" ] && ok "Bitcoin Core on a current major version";; esac
say "  Check LND against https://security.lightning.engineering before and after upgrading."

say "== LND"
if [ -f "$MAC/readonly.macaroon" ]; then
  INFO=$(lncli --lnddir="$LNDDIR" --network=mainnet --macaroonpath="$MAC/readonly.macaroon" getinfo 2>/dev/null)
  if [ -n "$INFO" ]; then
    printf '%s' "$INFO" | grep -E '"(num_active_channels|num_peers|synced_to_chain|synced_to_graph|block_height)"' | sed 's/^ */  /'
    printf '%s' "$INFO" | grep -q '"synced_to_chain": false' && flag "Not synced to chain: payments may fail (the 2022 btcd bug looked like this)."
  else flag "LND did not answer (not running, or locked)."; fi
else flag "No readonly.macaroon found in $MAC"; fi
for m in admin.macaroon router.macaroon; do [ -e "$MAC/$m" ] && flag "$m is on disk: it can move funds. Delete it after use (LND recreates it at restart)."; done
[ -e "$MAC/admin.macaroon" ] || ok "admin.macaroon not on disk"
CONF="$LNDDIR/lnd.conf"
if [ -f "$CONF" ]; then
  grep -qE '^\s*bitcoin\.node\s*=\s*neutrino' "$CONF" && {
    N=$(grep -cE '^\s*neutrino\.(addpeer|connect)\s*=' "$CONF")
    MODE=$(grep -qE '^\s*neutrino\.connect\s*=' "$CONF" && echo "ONLY its $N configured peer(s) (neutrino.connect)" || echo "$N preferred peer(s) plus peers it finds itself")
    flag "LND uses Neutrino (light client) with $MODE. Light clients rely on others for block filters; eclipse and time-dilation attacks target them: move LND to your own Bitcoin Core (bitcoin.node=bitcoind, built with -DWITH_ZMQ=ON)."; }
  grep -qE '^\s*protocol\.zero-conf\s*=\s*(true|1)' "$CONF" && flag "protocol.zero-conf is on: zero-confirmation channels trust the opener not to double-spend. Turn it off unless you use them with trusted peers."
  grep -qE '^\s*tor\.skip-proxy-for-clearnet-targets\s*=\s*(true|1)' "$CONF" && say "  note: hybrid Tor mode: clearnet peers see this machine's IP."
fi
[ -f "$MAC/channel.backup" ] && say "  channel.backup last changed $(stat -f '%Sm' -t '%Y-%m-%d' "$MAC/channel.backup" 2>/dev/null): copy it to encrypted offline storage after every channel change."

say "== Bitcoin Core config"
BC="$BTCDIR/bitcoin.conf"
if [ -f "$BC" ]; then
  grep -qE '^\s*rpcpassword\s*=' "$BC" && flag "rpcpassword is in plain text: use rpcauth (share/rpcauth/rpcauth.py) or the cookie file on anything that holds real money."
  grep -qE '^\s*rpcauth\s*=' "$BC" && ok "rpcauth in use"
  grep -qE '^\s*regtest\s*=\s*1' "$BC" && say "  note: regtest=1 (practice chain): this Bitcoin Core does not back the mainnet LND."
  grep -qE '^\s*rpcallowip\s*=\s*0\.0\.0\.0' "$BC" && flag "RPC allowed from anywhere: restrict rpcallowip to 127.0.0.1."
fi

say "== This Mac"
fdesetup status 2>/dev/null | sed 's/^/  /'
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -q "disabled" && flag "macOS firewall is off: System Settings → Network → Firewall."
command -v gpg >/dev/null || flag "GnuPG not installed: you can't verify Bitcoin Core release signatures (brew install gnupg)."
exit 0
