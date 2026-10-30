# Manual: Bitcoin Core
How to install, verify, configure and run Bitcoin Core safely, on the practice chain (regtest) and the real network (mainnet). For a guided, step-by-step session with real outputs, use the talk guide in this library.

## 1. Choose a version
- Use a maintained release. As of 30 October 2026: 30.x, 31.x and 32.x are maintained; 29.x reached end of life on 27 October 2026.
- Bitcoin Core publishes fixed vulnerabilities once versions leave support, so an old version's weaknesses become public. Upgrade within weeks, not months.

## 2. Get it and verify it
**From source (what the Altradits Mac uses):**
```
git clone https://github.com/bitcoin/bitcoin.git
cd bitcoin
git checkout v32.1                 # the release you chose
brew install gnupg
git clone https://github.com/bitcoin-core/guix.sigs
gpg --import guix.sigs/builder-keys/*
git verify-tag v32.1               # must say "Good signature"
```
**Or a release download:** fetch the archive, SHA256SUMS and SHA256SUMS.asc from bitcoincore.org, then:
```
shasum -a 256 --ignore-missing --check SHA256SUMS
gpg --verify SHA256SUMS.asc SHA256SUMS
```
> Verifying is the lesson of the 2018 event-stream attack and the Electrum fake-update phishing: what you didn't verify, you can't trust.

## 3. Build (macOS)
```
xcode-select --install
brew install cmake boost pkgconf libevent sqlite zeromq
cmake -B build -DWITH_ZMQ=ON       # ZMQ is needed if LND will use this node
cmake --build build -j $(sysctl -n hw.ncpu)
ctest --test-dir build -j $(sysctl -n hw.ncpu)   # optional
sudo cmake --install build                       # optional
```
Linux: sudo apt-get install -y build-essential cmake pkgconf python3 libevent-dev libboost-dev libsqlite3-dev libzmq3-dev, then the same cmake lines with -j $(nproc).

## 4. Configure
Config file: macOS ~/Library/Application Support/Bitcoin/bitcoin.conf; Linux ~/.bitcoin/bitcoin.conf.

**Mainnet node that backs LND:**
```
server=1
txindex=0
prune=0                    # or 550+ to save disk (check LND's docs for pruned support)
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcauth=lnd:<salt>$<hash>  # from share/rpcauth/rpcauth.py lnd
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
proxy=127.0.0.1:9050       # Tor, for privacy
listen=1
```
**Practice chain:**
```
regtest=1
server=1
fallbackfee=0.00001
[regtest]
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```
Rules that matter:
- RPC only on 127.0.0.1. Never expose port 8332 (mainnet) or 18443 (regtest) to a network.
- rpcauth (a salted hash) or the cookie file, never rpcpassword in plain text for real money.
- Don't restrict peers to one address (connect=): eclipse attacks need exactly that.

## 5. Run and check
```
bitcoind -daemon
bitcoin-cli getblockchaininfo        # chain, blocks, headers, verificationprogress
bitcoin-cli getnetworkinfo           # version, subversion, connections
bitcoin-cli getpeerinfo | grep -c '"addr"'   # how many peers
bitcoin-cli stop
```
Initial sync on mainnet takes hours to days; verificationprogress reaching 1 and initialblockdownload false means done.

## 6. Wallets
```
bitcoin-cli createwallet "main"
bitcoin-cli -rpcwallet=main getnewaddress
bitcoin-cli -rpcwallet=main getbalances
bitcoin-cli -rpcwallet=main backupwallet /path/on/encrypted/drive/main.dat
```
- Wallets are descriptor wallets (SQLite). listdescriptors true shows private keys: never paste it anywhere.
- Encrypt a wallet that holds funds: bitcoin-cli -rpcwallet=main encryptwallet "<passphrase>" (type it, don't script it).

## 7. Receiving payments as a business
- One new address per payment (privacy, whitepaper section 10).
- Wait for confirmations by amount: Altradits uses 1 below 0.01 BTC, 3 below 0.1 BTC, 6 above (whitepaper section 11).
- Never treat an unconfirmed payment as paid: replace-by-fee (full RBF is the default) lets the payer replace it.

## 8. Keeping it safe
- Upgrade on every point release of your major version; move major versions before end of life.
- Watch: getblockchaininfo warnings, debug.log for "ERROR", disk space.
- Backups: wallet backups and the descriptors' private keys offline; nothing else needs backing up (the chain can be re-downloaded).
- Run sh deploy/node-check.sh from the Altradits repository for a quick health check.
