# Ye₿ente

**Hard Money for the African Household.**

[![Live App](https://img.shields.io/badge/Live%20App-yebente.onrender.com-763698?style=flat&logo=render)](https://yebente.onrender.com)
[![Status](https://img.shields.io/badge/Status-Live-emerald)](https://yebente.onrender.com/api/health)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

* **Live Web Application:** [https://yebente.onrender.com](https://yebente.onrender.com)
* **Health & API Gateway:** [https://yebente.onrender.com/api/health](https://yebente.onrender.com/api/health)

Ye₿ente is an open, sovereign financial settlement interface connecting Bitcoin (Satoshis) directly to East African mobile money networks: Safaricom M-Pesa in Kenya and Ethio Telecom Telebirr in Ethiopia.

We are not here to build another extractive financial intermediary. We are here for monetary liberation. Starting in East Africa, Ye₿ente dismantles predatory cross-border remittance monopolies and currency debasement, giving everyday households direct, sovereign access to borderless digital bearer money.

---

## What Ye₿ente Stands For

1. **The Name: Ye - ₿ - ente**
   - **"Ye" (የ)**: In Amharic and regional Horn of Africa languages, the prefix **"Ye-"** signifies **"belonging to"**, **"of"**, or **"for"** (e.g. *Ye-Bete* = of my house / for my home; *Ye-Sew* = of the people).
   - **"₿"**: The Bitcoin symbol at the heart of our name represents sound, unconfiscatable, inflation-resistant monetary freedom.
   - **"ente" / "bete"**: Anchors the concept of the African **Home, Household, and Family**.
   - **Together**: Ye₿ente means **"Money for the Home"**: capital that flows directly into the hands of the household without extraction by foreign financial gatekeepers.

2. **Monetary Liberation & Decolonization**
   - Sub-Saharan Africa suffers under the world's most punitive remittance rates, averaging 8.5% to 20% to send money across borders. Traditional wire transfers take 2 to 5 business days, routing through London or New York correspondent banks.
   - Ye₿ente eliminates the correspondent banking tax entirely. By using Bitcoin Satoshis over the Lightning Network as a neutral settlement rail, payments settle in under 15 seconds for a fraction of a percent.

3. **Stan Style: Radical Interface Clarity**
   - A mother in Moyale or a livestock trader in Marsabit should never struggle with confusing interfaces or deceptive buttons.
   - Ye₿ente enforces **Stan Style**: a strict minimalist design system where buttons display only direct user actions, back navigation has zero clutter, and non-interactive data is never disguised as buttons.

---

## Architectural Principles

1. **Non-Custodial Priority & Financial Sovereignty**
   - User self-custody is the default standard. Private keys are never held or processed on centralized servers.
   - Native support for standard Bitcoin address schemes: BIP-84 (Native SegWit) and BIP-86 (Taproot), alongside Lightning Network BOLT-11 invoices.

2. **Operational Authenticity (Zero Simulation)**
   - No mock data, no simulated transactions, and no artificial numbers exist anywhere in our production path. Every digit displayed originates from verifiable on-chain UTXO indexers, active WebLN extensions, or verified Safaricom/Telebirr gateway callbacks.

3. **Stan Style Design System**
   - Follows the official [Stan Style Specification](.agents/skills/stan-style/SKILL.md) and [Brand Development Kit](docs/BRAND_DEVELOPMENT_KIT.md).
   - Zero emojis, zero typographic dashes (standard hyphens and colons only), clean monospace figures for all financial amounts, and strict anti-confusion separation between interactive controls and informational readouts.

4. **Dynamic Brand Palette Engine**
   - Centralized theme architecture in [src/theme/brandKit.ts](src/theme/brandKit.ts) enabling developers to toggle and register production palettes (Obsidian Plum, Solar Amber, Kigali Emerald, Nile Slate) with full CSS variable propagation.

---

## Supported Settlement Rails

* **Bitcoin On-Chain:** Verifiable UTXO settlement using BIP-21 payment URIs, BIP-84 Native SegWit, and BIP-86 Taproot.
* **Bitcoin Lightning Network:** Real-time micro-settlement via BOLT-11 invoices, LNURL, and WebLN.
* **Safaricom M-Pesa (Kenya):** Real-time STK Push, P2P B2C disbursements, Buy Goods (Till), and Paybill verification via C2B Hakikisha.
* **Ethio Telecom Telebirr (Ethiopia):** Mobile account transfers and cross-border disbursements.

---

## Documentation & Handbooks

* [Brand Development Kit (BDK)](docs/BRAND_DEVELOPMENT_KIT.md): Visual identity, wordmark rules, token engine, and recipes for future features.
* [Enterprise Strategy & Africa Roadmap](docs/ENTERPRISE_STRATEGY_AFRICA.md): Market history, economic gaps, 5-year financial model, and scaling beyond the founder.
* [Engineering Handbook](docs/onboarding/ENGINEERING_HANDBOOK.md): Core infrastructure, Lightning protocol, telecom integrations, and developer guidelines.
* [Treasury & Operations Handbook](docs/onboarding/TREASURY_AND_OPERATIONS_HANDBOOK.md): Float liquidity management, multi-sig custody, and corridor operations.
* [Compliance & Sovereign Legal Handbook](docs/onboarding/COMPLIANCE_AND_LEGAL_HANDBOOK.md): Regulatory strategy, CBK/NBE frameworks, and non-custodial privacy compliance.

---

## Security & Sovereign Privacy Model

* **Client-Side Cryptographic Isolation**: Critical operations and keys remain sandboxed on the client handset.
* **Automated Audit Pipeline**: Continuous integration auditing via GitHub Actions enforcing strict TypeScript typechecking, zero-lint tolerance, and zero-vulnerability package dependencies.
* **Regulatory Alignment**: Engineered to respect local privacy frameworks (Kenya Data Protection Act 2019, Ethiopia Fayda ID) through strict data minimization.

---

## Local Development & Verification

### Prerequisites
* Node.js v20 or higher (v24 LTS recommended)
* npm v10 or higher

### Installation
```bash
git clone https://github.com/altradits/yebente.git
cd yebente
npm install
```

### Development Server
```bash
npm run dev
```
Starts the local development server at `http://localhost:3000` and binds to `0.0.0.0:3000` for physical mobile device testing over local WiFi.

### Quality & Verification Pipeline
Before submitting any pull request, all automated checks must succeed:

```bash
# TypeScript typecheck
npm run lint

# Production build compilation
npm run build
```

### Production Deployment
Ye₿ente is deployed continuously on Render via [render.yaml](render.yaml):
* **Live Production Interface:** [https://yebente.onrender.com](https://yebente.onrender.com)
* **API Health & Telecom Webhooks:** [https://yebente.onrender.com/api/health](https://yebente.onrender.com/api/health)

---

## Governance & Contributing

Contributions must adhere to the 4-Pillar Evidentiary Standard documented in [CONTRIBUTING.md](CONTRIBUTING.md). Every pull request must reference an approved GitHub issue (`Fixes #<issue-number>`).

---

## License

This project is licensed under the terms of the MIT License. See [LICENSE](LICENSE) for details.
