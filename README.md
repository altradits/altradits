<div align="center">

# Stanley Chege Thuita

<a href="https://github.com/altradits">
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=20&duration=3000&pause=1000&color=F7931A&center=true&vCenter=true&width=780&height=50&lines=Go+%2B+Bitcoin+%2F+Lightning+developer;Building+financial+tools+for+African+youth+in+Go;157+Go+lessons+deep+and+still+going;Zone01+Kisumu+%E2%86%92+lightningnetwork%2Flnd+contributor" alt="Typing SVG"/>
</a>

<br/>

![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![Bitcoin](https://img.shields.io/badge/Bitcoin-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)
![Lightning](https://img.shields.io/badge/Lightning_Network-792EE5?style=for-the-badge&logo=lightning&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)

</div>

---

## Who I am

Software engineering apprentice at **Zone01 Kisumu, Kenya**. I write Go.

I chose Go because it is the language of Bitcoin's Lightning Network — `lightningnetwork/lnd` is 99.5% Go. My goal is to understand that codebase well enough to merge production code into it. Everything I build is a step toward that.

I believe Bitcoin fixes the three walls Kenyan youth hit: no access to capital, bursaries nobody hears about, and a banking system built to exclude them. Go is the tool I am learning to knock those walls down.

---

## Go — Where I am right now

I am working through **[altradits/challenges](https://github.com/altradits/challenges)** — 157 numbered Go lessons I built specifically to take me from `package main` to Bitcoin open source contributor.

```
Phase 1  (01–05)   Hello World       package main, import, fmt.Println — by heart
Phase 2  (06–27)   Foundations       structs · pointers · interfaces · goroutines
                                     channels · context · testing · file I/O · regexp
Phase 3  (28–51)   Practice          one concept per exercise, build muscle memory
Phase 4  (52–80)   Strings mastery   every strings / fmt / strconv function
Phase 5  (81–144)  Challenges        hard piscine-style problems, multiple concepts
Phase 6  (145–151) Backend bridge    time · json · http · sql · config · logging · generics
Phase 6  (152–157) Capstones         REST APIs → Bitcoin open source contribution
```

Every lesson has a `skills.md` (read first), a `README.md` (the challenge), and a `prerequisites.md` (where to go when stuck). No shortcuts.

---

## Bitcoin + Lightning — What I am building toward

`lightningnetwork/lnd` is written in Go. It is the most widely deployed Lightning node implementation in the world. Contributing to it requires:

```
go (1.21+)             ← I am here, going deeper every day
gRPC + protobuf        ← LND's entire API — learning via go-lightning-grpc
btcsuite/btcd          ← Bitcoin tx, script, wire protocol, chainparams
btcec/v2 secp256k1     ← key generation, signing, ECDSA verification
macaroon auth          ← LND's permission token system
TLV encoding           ← BOLT wire message format
database/sql + bbolt   ← LND persists channel state in KV + SQL
goroutines + context   ← LND is massively concurrent — this is core Go
golangci-lint          ← every PR must pass CI
```

**My roadmap to a merged LND PR:**
- [x] Build and understand the full Go language (challenges 01–157)
- [ ] Build `go-lightning-grpc` — speak gRPC to a real LND node
- [ ] Run LND on regtest, write integration tests using the `itest` framework
- [ ] Pick a small open issue in `lightningnetwork/lnd`, open a PR, get it merged

---

## Projects

### Bitcoin & Lightning (Go)

| Repo | What it does |
|------|-------------|
| [go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc) | CLI tool: talk to Bitcoin Core via JSON-RPC — `getblockchaininfo`, `sendtoaddress`, `listtransactions` |
| [go-lightning-grpc](https://github.com/altradits/go-lightning-grpc) | LND gRPC client in Go — generates invoices, checks balances, lists channels. Teaches macaroon auth + TLS |
| [bitcoin-bootcamp](https://github.com/altradits/bitcoin-bootcamp) | Go exercises connecting to `bitcoind` RPC in regtest |
| [yebo](https://github.com/altradits/yebo) | YeboBank — open-source Bitcoin community bank for Africa, built in Go |

### Financial Freedom for Youth (Go)

| Repo | What it does |
|------|-------------|
| [go-sats-savings](https://github.com/altradits/go-sats-savings) | CLI savings tracker in KES + sats — set a goal, log deposits, see live BTC equivalent |
| [go-bursary-api](https://github.com/altradits/go-bursary-api) | REST API for bursary eligibility in Kenya — `net/http` + SQLite + `slog` |
| [bursaryhub](https://github.com/altradits/bursaryhub) | Fraud-proof scholarship disbursement platform connecting donors, schools, students |

### Learning & Practice

| Repo | What it is |
|------|-----------|
| [challenges](https://github.com/altradits/challenges) | The 157-lesson Go curriculum — everything I know lives here |
| [chouMi](https://github.com/altradits/chouMi) | Daily Go practice from ChouMi mentor challenges |
| [playGo](https://github.com/altradits/playGo) | Go team coding challenges |
| [checkpoint](https://github.com/altradits/checkpoint) | Automated Go checkpoint practice environment |

---

## Open Source

| Contribution | Project | Status |
|-------------|---------|--------|
| Added to contributors list | [btrust-builders/first-open-source-contributions](https://github.com/btrust-builders/first-open-source-contributions) | ✅ Merged — PR #139 |
| Production Go code | [lightningnetwork/lnd](https://github.com/lightningnetwork/lnd) | ⏳ Working toward it |

---

## Why Bitcoin for Africa?

M-Pesa moves money. Bitcoin moves value without a bank's permission.

For a Kenyan youth with no credit history, no collateral, and no bank account — a Lightning wallet is more powerful than any bank. I am learning the code that makes that work so I can improve it, extend it, and build on top of it.

Go is the language. Bitcoin is the mission.

---

<div align="center">

**[challenges](https://github.com/altradits/challenges)** · **[go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc)** · **[go-lightning-grpc](https://github.com/altradits/go-lightning-grpc)** · **[go-sats-savings](https://github.com/altradits/go-sats-savings)** · **[go-bursary-api](https://github.com/altradits/go-bursary-api)**

*Zone01 Kisumu · Kenya · Go + Bitcoin · Building in public*

</div>
