# Setting up Bitcoin Core: a step-by-step talk
Speaker: Stanley Chege Thuita (Altradits). Length: about 75 minutes with questions. Audience: anyone with a laptop and a terminal.

> Every output in this guide was captured from Bitcoin Core v29.0 built from source (CMake, RelWithDebInfo) on macOS 26 (Apple silicon), on 30 October 2026, in regtest. Addresses, transaction ids and block hashes are random per machine: yours will differ, and that is the point. Everything else (structure, amounts, fees, confirmations) should match.

## How to run this talk
- You type, they type. Each step has the command, the output to expect, and one line to say about why it matters.
- Keep two terminals open: one for bitcoind's log (tail -f), one for commands.
- Regtest is a private chain on each laptop. No internet sync, no real money, blocks on demand. Say this early: nobody can lose anything today.
- If a listener falls behind, they can skip to the next "Checkpoint" line: each one says what state they should be in.

## Part 0: What we are building (5 minutes)
Bitcoin Core is the reference implementation of Bitcoin: it downloads every block, checks every rule itself and keeps its own copy of the chain. Satoshi's whitepaper ends with the idea that makes this matter: nodes "vote with their CPU power, expressing their acceptance of valid blocks". Running your own node means you never have to trust anyone else's view of who paid whom.

Today we will:
1. Get the source code and check it is genuine.
2. Build it.
3. Configure it safely.
4. Run our own private chain (regtest), make wallets, mine, and send a payment.
5. See why a payment is not final until it has confirmations, with two live demos.
6. Talk to the node from code (curl and Python).
7. Know what changes on the real network (mainnet), and how to keep a node safe.

## Part 1: Get the code and verify it (10 minutes)
**Say:** in 2018 a popular code library was quietly changed to steal from a Bitcoin wallet (the event-stream attack). Verifying what you run is not paranoia; it is the first habit of a node runner.

macOS needs Apple's command-line tools and Homebrew first (skip if you have them). For Homebrew, copy the one-line installer from https://brew.sh.
```
$ xcode-select --install
```
Clone and pick a release tag (never build from an untested branch for real money):
```
$ git clone https://github.com/bitcoin/bitcoin.git
$ cd bitcoin
$ git tag --list 'v3*' | tail -3
$ git checkout v29.0
```
Look at the release tag: it is signed by the release manager.
```
$ git cat-file tag v29.0 | head -6
object f490f5562d4b20857ef8d042c050763795fd43da
type commit
tag v29.0
tagger glozow <gloriajzhao@gmail.com> 1744395332 -0400

Bitcoin Core 29.0 final
```
To check that signature you need GnuPG and the maintainers' public keys (published in the bitcoin-core/guix.sigs repository, folder builder-keys):
```
$ brew install gnupg
$ git clone https://github.com/bitcoin-core/guix.sigs
$ gpg --import guix.sigs/builder-keys/*
$ git verify-tag v29.0
```
> Illustration, not captured on the speaker's machine (GnuPG wasn't installed): a good result contains a line starting "gpg: Good signature from" followed by the release manager's name. Anything else means stop and ask.

If you download a ready-made release instead of building, verify the file against SHA256SUMS and its signatures as the download page explains:
```
$ shasum -a 256 --ignore-missing --check SHA256SUMS
$ gpg --verify SHA256SUMS.asc SHA256SUMS
```
> Version check for the room: Bitcoin Core 29.x reached end of life on 27 October 2026. For a node that holds real money, use a maintained release (30.x, 31.x or 32.x at the time of this talk). v29.0 is fine for today's private-chain practice.

Checkpoint: you are inside the bitcoin folder on a release tag.

## Part 2: Build (15 minutes, mostly waiting)
Install the build dependencies. These are exactly what the speaker's machine uses (versions from Homebrew on 30 Oct 2026: cmake 4.4.0, boost 1.90.0, libevent 2.1.13, pkgconf 3.0.4, sqlite 3.53.4):
```
$ brew install cmake boost pkgconf libevent sqlite
```
Linux (Ubuntu/Debian) instead:
```
$ sudo apt-get install -y build-essential cmake pkgconf python3 \
    libevent-dev libboost-dev libsqlite3-dev
```
Configure and build. -j uses every CPU core:
```
$ cmake -B build
$ cmake --build build -j $(sysctl -n hw.ncpu)      # Linux: -j $(nproc)
```
The speaker's build settings (from build/CMakeCache.txt) show what the defaults give you: wallet on (SQLite, descriptor wallets), GUI off, hardening on, tests on.
```
ENABLE_WALLET:BOOL=ON
WITH_SQLITE:BOOL=ON
WITH_BDB:BOOL=OFF
BUILD_GUI:BOOL=OFF
ENABLE_HARDENING:BOOL=ON
BUILD_TESTS:BOOL=ON
```
Check the result:
```
$ ./build/bin/bitcoind --version | head -1
Bitcoin Core daemon version v29.0
$ ls build/bin
bitcoin-cli  bitcoin-tx  bitcoin-util  bitcoin-wallet  bitcoind  test_bitcoin
```
Optional, for confidence (takes a few minutes): run the unit tests.
```
$ ctest --test-dir build -j $(sysctl -n hw.ncpu)
```
Optional: install system-wide so you can type bitcoind instead of ./build/bin/bitcoind.
```
$ sudo cmake --install build
```
Checkpoint: bitcoind --version prints a version.

## Part 3: Configure it safely (5 minutes)
The data folder and config file:
- macOS: ~/Library/Application Support/Bitcoin/bitcoin.conf
- Linux: ~/.bitcoin/bitcoin.conf

**Say:** never put a plain password in bitcoin.conf. Bitcoin Core can store a salted hash instead (rpcauth), or use a cookie file it rewrites on every start.

Generate an rpcauth line (the script ships with the source):
```
$ python3 share/rpcauth/rpcauth.py talkuser
String to be appended to bitcoin.conf:
rpcauth=talkuser:<salt>$<hash>
Your password:
<generated-password>
```
Write the config (regtest, RPC only on this machine):
```
regtest=1
server=1
fallbackfee=0.00001
[regtest]
rpcauth=talkuser:<salt>$<hash>
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
txindex=1
```
- regtest=1: the private practice chain.
- fallbackfee: regtest has no fee history, so the wallet needs a default (0.00001 BTC per 1,000 vbytes = 1 sat/vB).
- rpcbind and rpcallowip: the control port answers only this machine. Exposing RPC to the internet is how nodes get emptied.
- txindex=1: lets you look up any transaction by id (handy for teaching; not needed for a wallet).
> Without an rpcauth line, bitcoin-cli still works: it reads the cookie file (regtest/.cookie in the data folder) automatically. That is the simplest safe choice on a single machine.

## Part 4: Start the node and look around (5 minutes)
```
$ bitcoind -regtest -daemon
Bitcoin Core starting
$ bitcoin-cli -regtest getblockchaininfo
{
  "chain": "regtest",
  "blocks": 0,
  "headers": 0,
  "bestblockhash": "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206",
  "bits": "207fffff",
  "difficulty": 4.656542373906925e-10,
  "time": 1296688602,
  "verificationprogress": 1,
  "initialblockdownload": true,
  "size_on_disk": 293,
  "pruned": false,
  "warnings": [
  ]
}
```
**Say:** block 0 is the regtest genesis block, and its hash is the same on every laptop in the room, because it is hard-coded. Everything after it will be ours alone.

```
$ bitcoin-cli -regtest getnetworkinfo
{
  "version": 290000,
  "subversion": "/Satoshi:29.0.0/",
  "protocolversion": 70016,
  "localservicesnames": [
    "NETWORK",
    "WITNESS",
    "NETWORK_LIMITED",
    "P2P_V2"
  ],
  "connections": 0,
  "relayfee": 0.00001000,
  ...
}
```
- subversion /Satoshi:29.0.0/ is how your node introduces itself to peers.
- P2P_V2 is encrypted peer-to-peer transport (BIP 324).
- connections 0: regtest talks to nobody. On mainnet you would see 10 or more.

## Part 5: Wallets and addresses (5 minutes)
Make two wallets: Alice will mine, Bob will receive.
```
$ bitcoin-cli -regtest createwallet alice
{
  "name": "alice"
}
$ bitcoin-cli -regtest createwallet bob
{
  "name": "bob"
}
$ bitcoin-cli -regtest -rpcwallet=alice getnewaddress
bcrt1qkpfzqtan7fwyc8t7w6muem0rv6zvjm3v77pscn
```
- bcrt1q... is a regtest native SegWit address (mainnet ones start bc1q).
- -rpcwallet chooses which wallet a command talks to once there is more than one.

Look inside an address:
```
$ bitcoin-cli -regtest -rpcwallet=alice getaddressinfo <alice-address>
{
  "address": "bcrt1q...",
  "ismine": true,
  "desc": "wpkh([d055c6ce/84h/1h/0h/0/0]02c9...6b62fef)#5f2ff8e7",
  "iswitness": true,
  "witness_version": 0,
  "hdkeypath": "m/84h/1h/0h/0/0",
  "labels": [
    "mining"
  ]
}
```
**Say:** the descriptor (desc) is the wallet's recipe: wpkh means pay-to-witness-public-key-hash, d055c6ce is the wallet's fingerprint and 84h/1h/0h/0/0 is the path to this exact key. Back up descriptors (listdescriptors true shows private ones: never paste that output anywhere).

## Part 6: Mine and watch rewards mature (5 minutes)
```
$ bitcoin-cli -regtest generatetoaddress 101 <alice-address>
[
  "2f055b164c26df1fc2c94704231b5e4f09e9be484fc6e27c2bb824d8a4cfbf56",
  "1dc234fb87dd5a3ce6287124b2c218698347c500132db0dcbe5dbd25a8b755fa",
  ... (101 block hashes)
]
$ bitcoin-cli -regtest getblockcount
101
$ bitcoin-cli -regtest -rpcwallet=alice getbalances
{
  "mine": {
    "trusted": 50.00000000,
    "untrusted_pending": 0.00000000,
    "immature": 5000.00000000
  },
  ...
}
```
**Say:** why 101 blocks? Each block pays its miner 50 BTC on regtest, but a block reward can only be spent after 100 more blocks (coinbase maturity). Of our 101 rewards, only the first has 100 blocks on top: 50 spendable, 5,000 immature. This rule exists because a block can be replaced in a reorganisation; rewards from replaced blocks vanish, so they must not be spent too early.

Checkpoint: Alice has 50 trusted BTC.

## Part 7: Send a payment and follow it (10 minutes)
```
$ bitcoin-cli -regtest -rpcwallet=bob getnewaddress
bcrt1q22wrs956f60459n6tp6pkljgdw9yvl2ddaj9xv
$ bitcoin-cli -regtest -rpcwallet=alice sendtoaddress <bob-address> 1.5
4b1452377e731d3cc778db04c9919e8fa172d30c3c5dc5abf978c949d5d7679f
```
That is the transaction id. It is waiting in the mempool, not yet in a block:
```
$ bitcoin-cli -regtest getmempoolinfo
{
  "loaded": true,
  "size": 1,
  "bytes": 140,
  "total_fee": 0.00000141,
  "mempoolminfee": 0.00001000,
  "minrelaytxfee": 0.00001000,
  "fullrbf": true
  ...
}
$ bitcoin-cli -regtest -rpcwallet=bob getbalances
{
  "mine": {
    "trusted": 0.00000000,
    "untrusted_pending": 1.50000000,
    "immature": 0.00000000
  },
  ...
}
```
- The fee is 141 sats for 140 virtual bytes: about 1 sat/vB, from fallbackfee.
- Bob sees 1.5 as untrusted_pending: he can see it, but it is not his yet.
- fullrbf true: any unconfirmed transaction can be replaced by one paying a higher fee (Part 8 shows it).

Mine one block and look again:
```
$ bitcoin-cli -regtest generatetoaddress 1 <alice-address>
$ bitcoin-cli -regtest -rpcwallet=bob getbalances
{
  "mine": {
    "trusted": 1.50000000,
    "untrusted_pending": 0.00000000,
    ...
  }
}
$ bitcoin-cli -regtest -rpcwallet=bob gettransaction <txid> false true
{
  "amount": 1.50000000,
  "confirmations": 1,
  "blockheight": 102,
  ...
  "decoded": {
    "size": 221,
    "vsize": 140,
    "weight": 560,
    "vin": [
      {
        "txid": "a8444fdb...161fd574",
        "vout": 0,
        "txinwitness": [ "3043...f701", "02df...5e1a" ]
      }
    ],
    "vout": [
      { "value": 48.49999859, "n": 0,
        "scriptPubKey": { "address": "bcrt1qq2ex...dxq", "type": "witness_v0_keyhash" } },
      { "value": 1.50000000, "n": 1,
        "scriptPubKey": { "address": "bcrt1q22wr...9xv", "type": "witness_v0_keyhash" } }
    ]
  }
}
```
**Say:** read the transaction like a cheque with change. One input: Alice's 50 BTC reward. Two outputs: 1.5 to Bob, and 48.49999859 back to Alice as change. 50 minus 1.5 minus 48.49999859 is 0.00000141: the fee, which went to the miner. The witness holds the signature and public key that prove Alice could spend it. This is section 2 of the whitepaper ("a chain of digital signatures") made visible.

Checkpoint: Bob has 1.5 trusted BTC.

## Part 8: Why confirmations matter (10 minutes)
### Demo A: an unconfirmed payment can be replaced
```
$ bitcoin-cli -regtest -rpcwallet=alice sendtoaddress <bob-address> 2.0
344bed294af79666172c72f27905a9c1585bbdebe528fa3459dade529847c09e
$ bitcoin-cli -regtest -rpcwallet=alice bumpfee <that-txid>
{
  "txid": "2e746cd2f4483ff9b9599e5e871749ae04638a80094a01df4190229de114ef06",
  "origfee": 0.00000141,
  "fee": 0.00000847,
  "errors": [
  ]
}
```
**Say:** Alice just replaced her own payment with a new transaction paying a higher fee. Here she still pays Bob, but a dishonest payer could replace it with one paying themselves instead. A shop that hands over goods on an unconfirmed payment can be robbed this way. Bob's wallet even lists the replacement under walletconflicts.

### Demo B: a reorganisation undoes a confirmation
```
$ bitcoin-cli -regtest -rpcwallet=alice sendtoaddress <bob-address> 0.25
$ bitcoin-cli -regtest generatetoaddress 1 <alice-address>       # note the block hash
# Bob's payment now has 1 confirmation
$ bitcoin-cli -regtest invalidateblock <that-block-hash>
$ bitcoin-cli -regtest getrawmempool
[
  "bbb62e345034e040634bb2af063df13e2c11c0366b66514c749a5112783fe487"
]
# Bob's payment is back to 0 confirmations
$ bitcoin-cli -regtest reconsiderblock <that-block-hash>
# and back to 1
```
**Say:** invalidateblock pretends the network replaced our latest block (a reorganisation). The payment did not disappear; it went back to waiting. Each extra block on top makes this far less likely. Section 11 of the whitepaper calculates it: with an attacker holding 10% of the mining power, the chance of rewriting a payment buried 5 blocks deep is below 0.1%, and it keeps falling exponentially with each block.

**The rule to take home:** small amounts, 1 confirmation; larger amounts, 3; large sums, 6 or more. (Altradits' own checkout uses exactly 1, 3 and 6 by amount.)

## Part 9: Talk to your node from code (5 minutes)
Everything bitcoin-cli does is JSON-RPC over HTTP. With the cookie file (path below is macOS regtest):
```
$ curl -s --user "$(cat ~/Library/Application\ Support/Bitcoin/regtest/.cookie)" \
    -H 'content-type: application/json' \
    --data-binary '{"jsonrpc":"2.0","id":"talk","method":"getblockcount","params":[]}' \
    http://127.0.0.1:18443/
{"jsonrpc":"2.0","result":109,"id":"talk"}
```
The same from Python, standard library only (works in the bootcamp virtual environment too):
```
import base64, json, urllib.request
user, pw = open(".cookie-path-here").read().split(":", 1)
def rpc(method, *params):
    body = json.dumps({"jsonrpc": "2.0", "id": "py",
                       "method": method, "params": list(params)}).encode()
    auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
    headers = {"Content-Type": "application/json", "Authorization": "Basic " + auth}
    req = urllib.request.Request("http://127.0.0.1:18443/", body, headers)
    return json.load(urllib.request.urlopen(req))["result"]
info = rpc("getblockchaininfo")
print(info["chain"], info["blocks"], info["bestblockhash"][:16] + "...")
```
Output on the speaker's machine:
```
regtest 109 530afe750c961830...
```
> The cookie is a password. Read it from the file each time; never print it, paste it into chat or commit it.

## Part 10: The real network (mainnet) (5 minutes)
What changes when you remove regtest=1:
- The node downloads and checks the whole chain (initial block download): many hours to days, and several hundred gigabytes. prune=550 keeps only the last ~550 MB of blocks while still verifying everything.
- Port 8333 talks to peers; leave the RPC port (8332) on 127.0.0.1 only.
- Real money: a maintained release, verified signatures, rpcauth or the cookie, backups of your wallet descriptors kept offline.
- Privacy: run over Tor with proxy=127.0.0.1:9050 (or onlynet=onion) so peers don't learn your IP.
- Eclipse attacks: an attacker who controls all your connections can show you a false chain. Bitcoin Core keeps anchor connections across restarts (anchors.dat) and picks peers from many networks; don't restrict it to a single peer.
- Keep it current. Bitcoin Core publishes fixed vulnerabilities once versions leave support; versions up to 29.0 are affected by CVE-2025-54604 and CVE-2025-54605 (fixed in 30.0).

## Part 11: Clean up
```
$ bitcoin-cli -regtest stop
Bitcoin Core stopping
```
To start the practice chain over from scratch, stop the node and delete only the regtest folder (never the mainnet data or a wallet with real funds):
```
$ rm -rf ~/Library/Application\ Support/Bitcoin/regtest      # Linux: ~/.bitcoin/regtest
```

## Troubleshooting
- "Could not connect to the server 127.0.0.1:18443": bitcoind isn't running, or is still starting. Run bitcoind -regtest -daemon, wait a few seconds.
- "Wallet file not specified (must request wallet RPC through /wallet/<filename> uri-path)": more than one wallet is loaded; add -rpcwallet=alice.
- "Insufficient funds": you mined fewer than 101 blocks, so nothing has matured.
- "Fee estimation failed. Fallbackfee is disabled": add fallbackfee=0.00001 under the config or start with -fallbackfee=0.00001.
- estimatesmartfee answers "Insufficient data or no feerate found" on regtest: normal, there is no fee history.
- Build fails at cmake -B build: a dependency is missing; re-run the brew or apt install line. cmake -B build -LH lists every option.

## One-page cheat sheet
```
bitcoind -regtest -daemon                         start
bitcoin-cli -regtest getblockchaininfo            where is my chain?
bitcoin-cli -regtest createwallet NAME            new wallet
bitcoin-cli -regtest -rpcwallet=NAME getnewaddress
bitcoin-cli -regtest generatetoaddress N ADDRESS  mine N blocks
bitcoin-cli -regtest -rpcwallet=NAME getbalances
bitcoin-cli -regtest -rpcwallet=NAME sendtoaddress ADDRESS AMOUNT
bitcoin-cli -regtest getmempoolinfo / getrawmempool
bitcoin-cli -regtest -rpcwallet=NAME gettransaction TXID false true
bitcoin-cli -regtest -rpcwallet=NAME bumpfee TXID
bitcoin-cli -regtest invalidateblock HASH / reconsiderblock HASH
bitcoin-cli -regtest stop
```

## Before the talk: speaker checklist
- Run Parts 4 to 9 once on the presenting laptop, start to finish, the day before.
- Have a fresh regtest folder ready (stop the node, move the old regtest folder aside).
- Increase the terminal font size; use a light theme for projectors.
- Print or share the listener handout: this PDF, plus the Bitcoin whitepaper from the library.
- Have the bootcamp setup guide ready for anyone whose build fails: Polar (Plan B) gets them a regtest node in minutes.
