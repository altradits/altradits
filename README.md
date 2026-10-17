<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,30:1a0800,70:2d1600,100:F7931A&height=220&text=Stanley%20Chege%20Thuita&fontSize=48&fontColor=ffffff&fontAlignY=42&desc=Bitcoin%20Core%20%26%20Lightning%20Protocol%20Engineer%20%C2%B7%20Kisumu%2C%20Kenya&descFontSize=18&descAlignY=62&descAlign=50&animation=fadeIn" />

<div align="center">

<img src="https://readme-typing-svg.demolab.com/?font=JetBrains+Mono&center=true&vCenter=true&color=F7931A&weight=800&size=40&duration=2000&pause=1000&width=650&height=70&lines=Review.+Test.+Verify.+Build.+Ship." alt="Action Verbs"/>

<br/>

[![Bitcoin Core](https://img.shields.io/badge/Bitcoin_Core-PR_Reviews-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://github.com/altradits/bitcoin-core-lab)
[![Lightning LND](https://img.shields.io/badge/Lightning_LND-Daemon-792EE5?style=for-the-badge&logo=lightning&logoColor=white)](https://github.com/lightningnetwork/lnd)
[![BitDevs Kisumu](https://img.shields.io/badge/BitDevs-Kisumu_Seminars-F7931A?style=for-the-badge&logo=x&logoColor=white)](https://x.com/BitDevsKsm)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/altradits)
[![Zap Sats](https://img.shields.io/badge/⚡_Zap_Sats-V4V-F7931A?style=for-the-badge&logo=lightning&logoColor=white)](#-connect--value-for-value-v4v)

<br/>

![Profile Views](https://komarev.com/ghpvc/?username=altradits&color=F7931A&style=for-the-badge&label=PROFILE+VIEWS)
[![GitHub followers](https://img.shields.io/github/followers/altradits?style=for-the-badge&color=F7931A&labelColor=0d1117&logo=github)](https://github.com/altradits?tab=followers)

</div>

---

### ⚡ Mission: Pure Peer-to-Peer Bitcoin Protocol Engineering

I am a software engineering apprentice at **Zone01 Kisumu, Kenya**, co-founder of **BitDevs Kisumu**, and an open-source Bitcoin & Lightning protocol engineer.

My technical mission:
1. **Upstream Protocol Contribution**: Reviewing and testing pull requests on **`bitcoin/bitcoin`** (consensus, mempool policy, BIP431 TRUC package relay, Python functional tests) and building on **`lightningnetwork/lnd`** from first principles.
2. **Sovereign Peer-to-Peer Circular Economy**: Engineering pure Satoshi-native, zero-fiat Bitcoin & Lightning infrastructure—airgapped BIP174 PSBT signing, BIP380 descriptor wallets, HTLC state machines, and non-custodial satoshi settlement for **Kisumu, Kenya**.

*Actively preparing for full-time open-source protocol contribution via the **Btrust Builders Fellowship**, **Brink**, and **OpenSats**.*

---

### 🔬 Bitcoin Core & Lightning Protocol Lab ([`altradits/bitcoin-core-lab`](https://github.com/altradits/bitcoin-core-lab))

| Stage | Protocol Domain | Upstream C++ / BIP Focus | Verification Artifact |
| :---: | :--- | :--- | :---: |
| **01** | **Consensus & Coinbase Maturity** | `COINBASE_MATURITY = 100` (`src/consensus/consensus.h`) & Halving Epochs | [`01-node-foundations`](https://github.com/altradits/bitcoin-core-lab/tree/main/01-node-foundations) |
| **02** | **Raw Transactions & SegWit Weight** | `Consensus::CheckTxInputs`, `WITNESS_SCALE_FACTOR`, BIP141 Witness Commitment | [`02-raw-tx-and-mempool`](https://github.com/altradits/bitcoin-core-lab/tree/main/02-raw-tx-and-mempool) |
| **03** | **Mempool Fee Bumping (RBF & CPFP)** | `PaysForRBF` DoS Rules (`src/policy/rbf.cpp`) & Ancestor Package Feerates | [`03-rbf-and-cpfp`](https://github.com/altradits/bitcoin-core-lab/tree/main/03-rbf-and-cpfp) |
| **04** | **Python Functional Test Framework** | Multi-node P2P simulation using `BitcoinTestFramework` & `MiniWallet` | [`04-functional-test-framework`](https://github.com/altradits/bitcoin-core-lab/tree/main/04-functional-test-framework) |
| **05** | **BIP431 TRUC (`v3`) & 1P1C Relay** | `PackageTRUCChecks` (`src/policy/truc_policy.cpp`) & 0-fee parent `submitpackage` | [`05-truc-package-relay-review`](https://github.com/altradits/bitcoin-core-lab/tree/main/05-truc-package-relay-review) |
| **06** | **Lightning P2WSH HTLC State Machine** | `OP_SHA256` Preimage Settlement vs BIP68 `OP_CHECKSEQUENCEVERIFY` Timeout | [`06-lightning-htlc-state-machine`](https://github.com/altradits/bitcoin-core-lab/tree/main/06-lightning-htlc-state-machine) |
| **07** | **Sovereign Descriptors & Airgapped PSBT** | BIP380 Watch-Only Descriptors (`src/script/descriptor.cpp`) & BIP174 PSBT Signing | [`07-psbt-descriptors-and-miniscript`](https://github.com/altradits/bitcoin-core-lab/tree/main/07-psbt-descriptors-and-miniscript) |

---

### 🚀 Open-Source Bitcoin & Systems Projects

<div align="center">

| Project | Architecture & Bitcoin / LND Contribution | Live Deployment | Source Code |
| :--- | :--- | :---: | :---: |
| ⚡ **Bitcoin Core Lab** | First-principles C++ consensus verification, custom Python P2P functional tests, TRUC (`v3`) package relay & P2WSH HTLC scripts | — | [GitHub](https://github.com/altradits/bitcoin-core-lab) |
| 🛡️ **ProofChain** | Decentralized credential registry anchoring SHA-256 document fingerprints directly to Bitcoin blocks via `OP_RETURN` | — | [GitHub](https://github.com/altradits/ProofChain) |
| 🌍 **AfriSats** | Pan-African peer-to-peer freelance and digital services marketplace priced strictly in Satoshis | — | [GitHub](https://github.com/altradits/AfriSats-) |
| ☕ **Buy Me a ₿una** | Open-source creator tipping platform streaming instant, sub-cent micro-payments in Satoshis over the Lightning Network | — | [GitHub](https://github.com/altradits/buy-me-abunna) |
| ⚡ **Lightning POS Checkout** | Non-custodial Point-of-Sale (POS) terminal generating BOLT11 Lightning invoices via LND gRPC/REST | — | [GitHub](https://github.com/altradits/lightning-merchant-checkout) |
| ⚡ **LD Bootcamp** | Bitcoin Lightning developer platform built during the Addis Ababa Lightning Bootcamp (Btrust/AFR/HRF) | [**Launch Bootcamp**](https://ld-bootcamp.vercel.app) | [GitHub](https://github.com/altradits/LD_Bootcamp) |
| 🏦 **SatsPool (YeboBank)** | Multi-user Bitcoin savings pool prototype built in pure Go stdlib with zero external dependencies | [**Launch App**](https://yebobank.vercel.app) | [GitHub](https://github.com/altradits/YeboBank) |
| 🎓 **BursaryHub** | Fraud-proof bursary and scholarship allocation platform built in Go | [**Launch BursaryHub**](https://bursaryhub-lake.vercel.app) | [GitHub](https://github.com/altradits/bursaryhub) |
| 🐟 **Chemichemi IoT** | Telemetry ingestion engine monitoring dissolved oxygen and water metrics for Lake Victoria aquaculture | [**Launch Chemichemi**](https://chemichemi-ci23.onrender.com) | [GitHub](https://github.com/annanodiyo/chemichemi) |

</div>

---

### 🎯 Verified Upstream Open-Source Contributions

| Repository | Scope & Architecture | Merged Pull Requests | Status |
| :--- | :--- | :--- | :---: |
| **[btrust-builders](https://github.com/btrust-builders)** | Btrust African Bitcoin Open Source Contributor Registry | • [PR #139](https://github.com/btrust-builders/first-open-source-contributions/pull/139), [PR #186](https://github.com/btrust-builders/first-open-source-contributions/pull/186), [PR #133](https://github.com/btrust-builders/open-source-code-contributions/pull/133) | `Merged ✅` |
| **[altradits/bitcoin-core-lab](https://github.com/altradits/bitcoin-core-lab)** | First-principles Bitcoin Core C++ consensus, mempool, HTLC & PSBT lab | • 7 completed verification labs + First-Principles Satoshi Workbook | `Active Lab 📝` |
| **[Flying-Tea-Squad/lms](https://github.com/Flying-Tea-Squad/lms)** | Backend education platform & automated testing engine | • [PR #321](https://github.com/Flying-Tea-Squad/lms/pull/321) · Materials persistence<br/>• [PR #320](https://github.com/Flying-Tea-Squad/lms/pull/320) · Upload pipelines<br/>• [PR #297](https://github.com/Flying-Tea-Squad/lms/pull/297) · API security<br/>• [PR #290](https://github.com/Flying-Tea-Squad/lms/pull/290) · RBAC authentication | `12+ PRs Merged ✅` |
| **[annanodiyo/chemichemi](https://github.com/annanodiyo/chemichemi)** | IoT aquaculture telemetry engine for Lake Victoria | • [PR #1](https://github.com/annanodiyo/chemichemi/pull/1) & [PR #5](https://github.com/annanodiyo/chemichemi/pull/5) · Core telemetry engine | `Merged ✅` |

---

### 🗺️ Bitcoin Protocol Roadmap

- [x] **Go Concurrency & Systems Foundations**: Mastered Go memory model, goroutines, and network protocols (**158 lessons deep**)
- [x] **Addis Ababa Lightning Bootcamp**: Completed intensive Lightning protocol cohort sponsored by **Btrust Builders**, **Africa Free Routing**, and **HRF**
- [x] **Community Leadership**: Co-founded **BitDevs Kisumu** ([@BitDevsKsm](https://x.com/BitDevsKsm)), hosting regular Socratic Seminars
- [x] **Bitcoin Core v29.0 Compilation & Consensus Labs**: Verified Coinbase Maturity, SegWit weight, BIP125 RBF, CPFP, BIP431 TRUC (`v3`) 1P1C packages, P2WSH HTLCs, and BIP174 PSBTs in **[bitcoin-core-lab](https://github.com/altradits/bitcoin-core-lab)**
- [x] **Custom P2P Functional Tests**: Authored multi-node tests using `BitcoinTestFramework` and `MiniWallet`
- [ ] **Upstream `bitcoin/bitcoin` PR Reviews**: Publish weekly `Tested ACK` reviews on active mempool, wallet, and P2P pull requests
- [ ] **Sovereign Kisumu Circular Economy**: Deploy pure Satoshi-native Bolt Card & non-custodial Lightning POS rails on Lake Victoria
- [ ] **Full-Time Fellowship Onboarding**: Secure protocol development grant (**Btrust Builders** / **Brink** / **OpenSats**)

---

### 🤝 Connect & Value-for-Value (V4V)

<div align="center">

[![Email](https://img.shields.io/badge/Email-altradits%40gmail.com-F7931A?style=for-the-badge&logo=gmail&logoColor=white)](mailto:altradits@gmail.com)
[![X](https://img.shields.io/badge/X-@altradits-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/altradits)
[![BitDevs Kisumu](https://img.shields.io/badge/BitDevs-@BitDevsKsm-F7931A?style=for-the-badge&logo=x&logoColor=white)](https://x.com/BitDevsKsm)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Stanley_Chege_Thuita-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/stanmobitech/)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub_Payments-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/altradits)
[![⚡ Zap Sats](https://img.shields.io/badge/⚡_Zap-Lightning-F7931A?style=for-the-badge&logo=lightning&logoColor=white)](lightning:lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhqmm5v93xcetnd9nkuctvxgcsm55zyn)

</div>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:F7931A,50:2d1600,100:0d1117&height=120&animation=fadeIn&section=footer" />
