# Manual: LND for a business
How the Altradits Lightning node is set up, and how to set one up from nothing. LND is Lightning Labs' Lightning Network daemon.

## 1. Install and verify
- Download the release for your machine (macOS on Apple silicon: lnd-darwin-arm64-<version>.tar.gz) from github.com/lightningnetwork/lnd/releases, with its manifest and signature files.
- Verify: the manifest's signature with gpg, then the archive's SHA-256 against the manifest.
- Check security.lightning.engineering for advisories on the version you install.
- Altradits runs 0.21.3-beta (no known advisory); 0.21.5-beta was released on 27 October 2026.

## 2. Configuration (the Altradits node, secrets removed)
lnddir: ~/.lnd-altradits, file lnd.conf:
```
[Application Options]
wallet-unlock-password-file=<path to an owner-only file>
alias=Altradits
color=#F7931A
listen=127.0.0.1:9735
rpclisten=127.0.0.1:10009
restlisten=127.0.0.1:8080
accept-keysend=false

[Bitcoin]
bitcoin.mainnet=true
bitcoin.node=neutrino

[neutrino]
neutrino.addpeer=btcd-mainnet.lightning.computer

[fee]
fee.url=https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json

[protocol]
protocol.option-scid-alias=true
protocol.zero-conf=true

[tor]
tor.active=true
tor.v3=true
tor.skip-proxy-for-clearnet-targets=true
tor.control=localhost:9051
```
**Recommended changes** (see Your node today):
- Use your own Bitcoin Core instead of Neutrino:
```
[Bitcoin]
bitcoin.node=bitcoind
[Bitcoind]
bitcoind.rpchost=127.0.0.1:8332
bitcoind.rpcuser=lnd
bitcoind.rpcpass=<the password rpcauth.py printed>
bitcoind.zmqpubrawblock=tcp://127.0.0.1:28332
bitcoind.zmqpubrawtx=tcp://127.0.0.1:28333
```
- Or, until then, several independent Neutrino peers (one neutrino.addpeer line each).
- protocol.zero-conf=false unless you use zero-confirmation channels with trusted peers.

## 3. Start, create the wallet, unlock
```
lnd --lnddir=$HOME/.lnd-altradits
lncli --lnddir=$HOME/.lnd-altradits --network=mainnet create
```
- create prints a 24-word seed (aezeed). Write it on paper, never photograph or type it into a computer. The seed plus channel.backup recover the funds.
- The wallet unlocks itself at start from wallet-unlock-password-file (owner-only permissions).

## 4. Keys (macaroons): least privilege
LND creates admin.macaroon (everything), readonly.macaroon and invoice.macaroon (and router.macaroon). Use the least each job needs, and bake each with its own root key so it can be revoked alone:
```
# The website: receive only (invoices, addresses, reads). It must never be able to send.
lncli bakemacaroon --root_key_id=1 --save_to=website.macaroon \
  invoices:read invoices:write address:read address:write onchain:read offchain:read info:read
# Ye₿ente sending: Lightning payments and their status.
lncli bakemacaroon --root_key_id=2 --save_to=yebente-pay.macaroon offchain:read offchain:write
# Hex for the server's settings:
xxd -p -c 100000 website.macaroon
# Revoke every key baked with root key 1:
lncli listmacaroonids
lncli deletemacaroonid 1
```
Rules:
- Day to day, use readonly.macaroon (an alias such as lncli-ro).
- Delete admin.macaroon and router.macaroon after any use; LND recreates them at restart.
- The admin Finance tab checks the website key really is receive-only (it asks the node to send nothing and expects "permission denied").

## 5. Channels and liquidity
```
lncli-ro getinfo
lncli-ro channelbalance            # local = can send, remote = can receive
lncli-ro listchannels
lncli openchannel --node_key=<peer pubkey> --local_amt=<sats>
```
- A shop mostly receives: it needs inbound liquidity (remote balance). Buy a channel (Magma by Amboss) or ask a well-connected peer to open one.
- Ye₿ente also sends, so it needs outbound liquidity (local balance). The hourly solvency check compares wallet balances with it.
- Two or more peers, so one going offline doesn't stop payments.

## 6. Backups
- channel.backup (static channel backup) updates on every channel change; copy it offline after each change. Export manually:
```
lncli exportchanbackup --all --output_file=$HOME/channel-backup-$(date +%F).backup
```
- Seed (paper) + channel.backup = funds recoverable (channels are force-closed in recovery).

## 7. Keep it healthy
- sh deploy/node-check.sh (in the Altradits repository): versions, sync, keys on disk, risky settings.
- synced_to_chain must be true; if it turns false, payments fail (the 2022 btcd parsing bug stalled nodes exactly this way).
- Upgrade promptly; read release notes for database migrations first.
