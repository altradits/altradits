# Your node today: findings and upgrades
Read-only inspection of Stanley's Mac on 30 October 2026 (deploy/node-check.sh repeats it any time). Nothing was changed on the node: every item below is for Stanley to decide and do, in this order.

## What is running
- LND 0.21.3-beta on mainnet (lnddir ~/.lnd-altradits): synced to chain and graph, 1 active channel with 1 peer, Tor on, REST and gRPC on 127.0.0.1 only, auto-unlock from an owner-only password file.
- ngrok tunnel to the REST port with a traffic policy that allows only the hosting server's IPv4 address.
- Bitcoin Core v29.0, built from source in ~/bitcoin (CMake, wallet on, ZMQ off), running in regtest for teaching. It does not back the Lightning node.
- Tor 0.4.9.14. macOS 26.7.1 on Apple silicon with FileVault on.

## Good already
- admin.macaroon is not on disk; daily checks use readonly.macaroon; the website's key is receive-only (it can make invoices and addresses and read the node, never send).
- The tunnel admits one IP, and every request carries the node's macaroon over TLS (the tunnel's certificate, checked against public authorities). LND_TLS_CERT is available to pin a certificate when the site talks to the node directly.
- The channel backup (channel.backup) is current (29 Oct).
- LND 0.21.3 is not affected by any published Lightning Labs advisory (the latest affecting 0.21.x, a DNS-seed panic, was fixed in 0.21.1).

## Found later the same day
- **The node could send 0 sats.** Our side of the channel held 20,143 sats, below the 29,434-sat channel reserve, so every send failed with "insufficient balance" (including M-Pesa sends through Tando). The site counted the reserve as spendable; it now doesn't, refuses such sends up front, alerts in Finance, and admin → Finance → Sending power tops the node up.

## Do now (high)
1. **Give LND a full node to trust.** It runs Neutrino, a light client: it checks block headers itself but relies on other nodes for the block filters that tell it what concerns its channels. One preferred peer is configured (btcd-mainnet.lightning.computer) and Neutrino also finds others itself (about 2,800 known addresses). Eclipse, time-dilation and flood-and-loot attacks all target light clients. Best: your own Bitcoin Core; with 36 GB free and 8 GB RAM that means a pruned node now or an external SSD later. See Manual: LND for a business.
2. **Delete router.macaroon after each LND start.** Like admin.macaroon, it can send payments, and LND recreates it at restart.
3. **Turn on the macOS firewall** (System Settings → Network → Firewall). LND listens only on 127.0.0.1, but the regtest Bitcoin Core listens for peers on all interfaces.

## Do soon (medium)
4. **Upgrade Bitcoin Core before using it for real money.** 29.x reached end of life on 27 October 2026; CVE-2025-54604 and CVE-2025-54605 affect versions up to 29.0 (fixed in 30.0). Latest at the time of writing: 32.1 (also maintained: 30.x, 31.x). Build from the signed tag after verifying it. v29.0 is fine for regtest teaching.
5. **Upgrade LND to 0.21.5-beta** (released 27 Oct 2026) after reading its release notes; check security.lightning.engineering before and after.
6. **Decide on zero-conf channels.** protocol.zero-conf=true lets you accept channels before their funding transaction confirms, trusting the opener not to double-spend it. If you don't use them, turn it off.
7. **Install GnuPG** (brew install gnupg) so you can verify release signatures yourself (Bitcoin Core tags, SHA256SUMS.asc, LND manifests).
8. **Store channel.backup offline** after every channel change (encrypted USB or similar). With the seed, it is what recovers channel funds if the Mac dies.

## Consider (low)
9. **Hybrid Tor** (tor.skip-proxy-for-clearnet-targets=true) shows this Mac's IP to clearnet peers. Fine for reachability; turn it off for privacy.
10. **A second channel from a different peer.** With one peer, the node can't receive while that peer is offline.
11. **rpcauth for Bitcoin Core** once it runs on mainnet (the regtest config uses a plain teaching password).
12. **Key continuity.** Write down, offline, how someone you trust reaches the seed, the wallet password and the backups if you can't.

## How to repeat this check
```
cd ~/altradits
sh deploy/node-check.sh
```
It prints versions against the latest releases, sync state, which macaroons are on disk, and the risky settings above. It never prints secrets.
