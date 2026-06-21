<div align="center">

# Stanley Chege Thuita

<a href="https://github.com/altradits">
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=500&size=20&duration=3200&pause=1000&color=F7931A&center=true&vCenter=true&width=750&height=50&lines=Go+developer+in+training+%E2%86%92+Bitcoin+%2F+Lightning+contributor;Building+financial+freedom+tools+for+African+youth;SE+Apprentice+%40+Zone01+Kisumu%2C+Kenya;Learning+Go+one+lesson+at+a+time+%E2%80%94+157+deep+and+counting" alt="Typing SVG"/>
</a>

</div>

---

## Who I am

I am a software engineering apprentice at **Zone01 Kisumu, Kenya**.

My mission: learn Go deeply enough to contribute production code to **Lightning Network (LND)** — and use that knowledge to build financial tools that give African youth a real path to financial freedom.

I do not guess. I follow a structured curriculum. I ship working code.

---

## The Learning Path

Everything I build sits on top of one curriculum: **[altradits/challenges](https://github.com/altradits/challenges)** — 157 numbered Go lessons from Hello World to Bitcoin open source contribution.

```
01 – 05   Hello World         The four-line Go skeleton, by heart
06 – 27   Foundations         Structs, interfaces, goroutines, channels, context
28 – 80   Practice            One skill per exercise, then strings/fmt/strconv mastery  
81 – 144  Challenges          Piscine-style problems — combine everything
145 – 151 Backend bridge      time · json · http · sql · config · logging · generics
152 – 157 Capstones           REST APIs + Bitcoin open source contribution
```

---

## Projects (built with skills from challenges)

### Bitcoin & Lightning

| Repo | What it is | Skills used |
|------|-----------|-------------|
| [go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc) | CLI explorer for Bitcoin Core JSON-RPC | `net/http`, `encoding/json`, `os.Getenv`, CLI args |
| [go-lightning-grpc](https://github.com/altradits/go-lightning-grpc) | LND gRPC client — the exact stack to contribute to lightningnetwork/lnd | gRPC, protobuf, macaroon auth, `context` |
| [bitcoin-bootcamp](https://github.com/altradits/bitcoin-bootcamp) | Bitcoin RPC learning exercises | `net/http`, JSON-RPC, regtest |
| [yebo](https://github.com/altradits/yebo) | YeboBank — open-source Bitcoin community bank for Africa | Go, Lightning, Bitcoin |

### Financial Freedom Tools for Youth

| Repo | What it is | Skills used |
|------|-----------|-------------|
| [go-sats-savings](https://github.com/altradits/go-sats-savings) | Savings goal tracker in KES + sats — set a goal, track deposits, see your BTC equivalent | `time`, `encoding/json`, `net/http` (live price) |
| [go-bursary-api](https://github.com/altradits/go-bursary-api) | REST API for bursary/scholarship eligibility in Kenya | `net/http`, `database/sql`, `slog`, SQLite |
| [bursaryhub](https://github.com/altradits/bursaryhub) | Fraud-proof scholarship disbursement platform | Go |

### Learning & Practice

| Repo | What it is |
|------|-----------|
| [challenges](https://github.com/altradits/challenges) | 157-lesson Go curriculum — my main learning repo |
| [chouMi](https://github.com/altradits/chouMi) | Daily practice from ChouMi mentor challenges |
| [playGo](https://github.com/altradits/playGo) | Go team challenge playground |
| [checkpoint](https://github.com/altradits/checkpoint) | Automated checkpoint practice environment |

---

## The Bitcoin / LND Contribution Stack

Researched from `lightningnetwork/lnd` — this is what I am working toward:

```
Go (1.21+)               ← the language (altradits/challenges teaches this)
gRPC + protobuf          ← LND's entire API surface (go-lightning-grpc teaches this)
btcsuite/btcd            ← Bitcoin tx, script, chainparams, wire protocol
btcec/v2 (secp256k1)     ← key generation, signing, verification  
Macaroon auth            ← LND's permission token system
TLV encoding             ← BOLT wire message format
database/sql + bbolt     ← LND persists channel state in KV + SQL
context + goroutines     ← LND is massively concurrent
golangci-lint + testify  ← every PR must pass CI
```

My path to a merged LND PR:
1. ✅ Learn Go (challenges 01–157)
2. 🔄 Build `go-lightning-grpc` — understand every gRPC call
3. ⏳ Run LND locally on regtest + write integration tests
4. ⏳ Pick a small open issue in lightningnetwork/lnd, submit a PR

---

## Open Source

| Contribution | Repo | Status |
|-------------|------|--------|
| Added name to contributors list | [btrust-builders/first-open-source-contributions](https://github.com/btrust-builders/first-open-source-contributions) | ✅ Merged (PR #139) |
| LND production code | lightningnetwork/lnd | ⏳ In progress |

---

## Why financial freedom for African youth?

Kenyan youth face three walls: no access to capital, bursaries they never hear about, and a banking system that excludes them. Bitcoin and Go are my tools to knock down those walls — one CLI tool, one REST API, one Lightning invoice at a time.

---

<div align="center">

**[challenges](https://github.com/altradits/challenges)** · **[go-bitcoin-rpc](https://github.com/altradits/go-bitcoin-rpc)** · **[go-lightning-grpc](https://github.com/altradits/go-lightning-grpc)** · **[go-sats-savings](https://github.com/altradits/go-sats-savings)**

*Zone01 Kisumu · Kenya · Building in public*

</div>
