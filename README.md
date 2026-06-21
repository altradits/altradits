<div align="center">

<img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=700&size=22&duration=3000&pause=1000&color=F7931A&center=true&vCenter=true&width=800&height=60&lines=Stanley+Chege+Thuita;Go+%2B+Bitcoin+%2F+Lightning+Developer;Building+financial+freedom+for+African+youth;Zone01+Kisumu+%E2%86%92+lightningnetwork%2Flnd+contributor" alt="Typing SVG"/>

<br/>

[![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://github.com/altradits/challenges)
[![Bitcoin](https://img.shields.io/badge/Bitcoin-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://github.com/altradits/yebo)
[![Lightning](https://img.shields.io/badge/Lightning_Network-792EE5?style=for-the-badge&logo=lightning&logoColor=white)](https://github.com/altradits/go-lightning-grpc)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](#)

<br/>

<a href="https://github.com/altradits">
  <img height="160" src="https://github-readme-stats.vercel.app/api?username=altradits&show_icons=true&theme=github_dark&hide_border=true&title_color=F7931A&icon_color=F7931A&text_color=c9d1d9&bg_color=0d1117&count_private=true" />
</a>
<a href="https://github.com/altradits">
  <img height="160" src="https://streak-stats.demolab.com?user=altradits&theme=github-dark-blue&hide_border=true&fire=F7931A&ring=F7931A&currStreakLabel=F7931A&background=0d1117" />
</a>

</div>

---

## Who I Am

Software engineering apprentice at **Zone01 Kisumu, Kenya**. I write Go.

I chose Go because it is the primary language of `lightningnetwork/lnd` — 99.5% Go, the most widely deployed Lightning node implementation in the world. My goal is to understand that codebase well enough to merge production code into it.

> **Bitcoin is not just money. For Kenyan youth with no credit history, no collateral, and no bank account — a Lightning wallet is more powerful than any bank. I am learning the code that makes this possible.**

---

## My Go Journey — 158 Lessons Deep

Working through **[altradits/challenges](https://github.com/altradits/challenges)** — 158 numbered lessons I designed to take me from `package main` to Bitcoin open source contributor.

```
Phase 1  (01–05)    Hello World       package main · fmt · entry points
Phase 2  (06–27)    Foundations       structs · pointers · interfaces · goroutines
                                      channels · context · testing · file I/O · regexp
Phase 3  (28–51)    Practice          one concept per exercise — building muscle memory
Phase 4  (52–80)    Strings Mastery   every strings / fmt / strconv function
Phase 5  (81–144)   Challenges        hard piscine-style problems, multiple concepts
Phase 6  (145–152)  Backend Bridge    time · JSON · HTTP · SQL · config · logging · generics · graceful shutdown
Phase 7  (153–158)  Capstones         REST APIs → Bitcoin open source contribution
```

Each lesson has `skills.md` (concept), `README.md` (challenge), and `prerequisites.md` (where to go when stuck). No shortcuts.

---

## What It Takes to Contribute to LND

`lightningnetwork/lnd` requires fluency in a very specific Go stack:

| Skill | Status | Where I Practice |
|-------|--------|-----------------|
| Go 1.21+ | 🟠 Active | [challenges](https://github.com/altradits/challenges) — 158 lessons |
| gRPC + protobuf | 🔵 Learning | [go-lightning-grpc](https://github.com/altradits/go-lightning-grpc) |
| btcsuite/btcd | ⬜ Next | [bitcoin-bootcamp](https://github.com/altradits/bitcoin-bootcamp) |
| macaroon auth | ⬜ Next | [go-lightning-grpc](https://github.com/altradits/go-lightning-grpc) |
| goroutines + context | 🟠 Active | challenges 28–152 |
| database/sql + bbolt | 🟠 Active | [go-bursary-api](https://github.com/altradits/go-bursary-api) · [yebo](https://github.com/altradits/yebo) |
| golangci-lint + CI | ⬜ Next | LND itest framework |

**Roadmap to a merged LND PR:**
- [x] Build and deeply understand the full Go language (lessons 01–158)
- [ ] Build `go-lightning-grpc` — speak gRPC to a real LND node
- [ ] Run LND on regtest, write integration tests with the `itest` framework
- [ ] Find a small open issue in `lightningnetwork/lnd`, submit a PR, get it merged

---

## Projects

### ⚡ Bitcoin & Lightning

| Repo | What It Does |
|------|-------------|
| [yebo](https://github.com/altradits/yebo) | **YeboBank** — open-source Bitcoin community bank for Africa. M-Pesa + Lightning. Zero external Go deps. |
| [go-lightning-grpc](https://github.com/altradits/go-lightning-grpc) | LND gRPC client — generates invoices, checks balances, lists channels. Teaches macaroon auth + TLS |
| [go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc) | CLI tool: talk to Bitcoin Core via JSON-RPC — `getblockchaininfo`, `sendtoaddress`, `listtransactions` |
| [bitcoin-bootcamp](https://github.com/altradits/bitcoin-bootcamp) | Go exercises connecting to `bitcoind` RPC in regtest |

### 💰 Financial Freedom for Youth

| Repo | What It Does |
|------|-------------|
| [go-sats-savings](https://github.com/altradits/go-sats-savings) | CLI savings tracker in KES + sats — set a goal, log deposits, see live BTC equivalent |
| [go-bursary-api](https://github.com/altradits/go-bursary-api) | REST API for bursary eligibility in Kenya — `net/http` + SQLite + `slog` |
| [bursaryhub](https://github.com/altradits/bursaryhub) | Fraud-proof scholarship disbursement connecting donors, schools, and students |

### 📚 Learning & Practice

| Repo | What It Is |
|------|-----------|
| [challenges](https://github.com/altradits/challenges) | The 158-lesson Go curriculum — everything I know lives here |
| [chouMi](https://github.com/altradits/chouMi) | Daily Go practice from ChouMi mentor challenges |
| [playGo](https://github.com/altradits/playGo) | Team Go coding challenges |

---

## Open Source

| Contribution | Project | Status |
|-------------|---------|--------|
| Added to contributors list | [btrust-builders/first-open-source-contributions](https://github.com/btrust-builders/first-open-source-contributions) | ✅ Merged — PR #139 |
| Production Go code | [lightningnetwork/lnd](https://github.com/lightningnetwork/lnd) | ⏳ Working toward it |

---

## Why Bitcoin for Africa?

M-Pesa moves money. Bitcoin moves value without a bank's permission.

Three walls Kenyan youth hit:
- **No access to capital** — Lightning changes what collateral means
- **No bank account** — a phone number becomes a bank
- **Bursaries nobody hears about** — [bursaryhub](https://github.com/altradits/bursaryhub) is fixing this

Go is the language. Bitcoin is the mission.

---

<div align="center">

[![Activity Graph](https://github-readme-activity-graph.vercel.app/graph?username=altradits&bg_color=0d1117&color=F7931A&line=F7931A&point=ffffff&area=true&hide_border=true)](https://github.com/altradits)

<br/>

*Zone01 Kisumu · Kenya · Go + Bitcoin · Building in public*

**[challenges](https://github.com/altradits/challenges)** · **[yebo](https://github.com/altradits/yebo)** · **[go-lightning-grpc](https://github.com/altradits/go-lightning-grpc)** · **[go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc)** · **[go-sats-savings](https://github.com/altradits/go-sats-savings)**

</div>
