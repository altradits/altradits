# Stanley Chege Thuita
Founder & Software Engineer
Nairobi, Kenya | altradits@gmail.com | {{phone}} | altradits.com | linkedin.com/in/stanmobitech

## Professional Summary
Software engineer and founder of Altradits, a global virtual assistant business that sells fixed-price tasks online, delivered by AI agents and a freelancer team. Built and runs the whole system, from storefront and order automation to Bitcoin payments on his own Lightning node.

## Core Skills
AI and automation: Claude API, AI agents, multi-agent workflows, prompt playbooks, QA review loops, order automation
Bitcoin and Lightning: LND (gRPC, REST, macaroons, Neutrino, Tor), BOLT11, BIP21, LNURL-pay, Bitcoin Core, bitcoin-cli, regtest, PSBT, descriptors
Languages and backend: Go (standard library, concurrency), Node.js, JavaScript, SQL (PostgreSQL), Bash, REST APIs
Web and DevOps: GitHub Actions, CI/CD, Docker, Linux administration, automated testing, Astro, Tailwind CSS, Vercel, Render
Security and cryptography: SSRF protection, rate limiting, secret management, SHA-256, HMAC, TOTP, AES-256-GCM, Schnorr and Taproot (BIP340, BIP341)
Operations: service design and pricing, client onboarding, team leadership, freelancer recruitment, community building

## Work Experience
### Founder & Managing Director | Altradits | Remote
Sep 2026 – Present
- Launched altradits.com, a fixed-price storefront of {{quickJobs}} same-day quick jobs (${{quickFrom}}–${{quickTo}}), {{services}} larger services across {{departments}} departments and {{plans}} monthly plans, where clients order and pay without a sales call.
- Built order-to-delivery automation that turns each paid order into a tracked task for the right department, puts urgent orders at the front of the queue and confirms delivery through a client portal.
- Designed {{agents}} AI department agents on the Claude API (social media, administration, personal assistance, customer care, and web and Bitcoin), each with written playbooks, web research tools and a QA reviewer.
- Recruits and leads freelancers from the weVenture Hub (Addis Ababa) and Zone01 (Kisumu) developer communities, keeping a bench of {{standby}}+ on standby for urgent work.
- Runs Bitcoin payments on his own LND node (mainnet, Neutrino, Tor): exact-amount Lightning invoices, one QR that any wallet can pay over Lightning or on-chain, automatic confirmation and fees shown before payment.
- Ships with push-to-deploy on GitHub Actions and an automated test suite; hardened with an SSRF guard, rate limits and least-privilege payment credentials. Source: github.com/altradits/altradits

### Software Engineering Apprentice | Zone01 Kisumu | Kisumu, Kenya
Apr 2026 – Present
- Completed 158 structured Go challenges covering concurrency, pointers, channels and network protocols.
- Delivered CLI and service projects through a peer-reviewed Git workflow (branching, rebasing, code review) and containerised them with Docker for Linux servers.

### Co-Founder & Technical Facilitator | BitDevs Kisumu | Kisumu, Kenya
Apr 2026 – Present
- Co-founded a Bitcoin developer community in Western Kenya and organised its first Socratic Seminar at LakeHub Kisumu, covering Bitcoin Core pull requests, BIPs and Layer 2 design.
- Built the community documentation site with Astro and Tailwind CSS (bitdevs-kisumu.vercel.app), including a guide to syncing a node offline over Blockstream Satellite near Lake Victoria.

## Projects
### YeboBank / SatsPool | Go and Lightning prototype
Jun 2026 – Present
- Prototyped a multi-user Bitcoin savings pool and settlement layer in the Go standard library, with fiat-to-Lightning bridging designed for East African mobile money (yebobank.vercel.app).
- Wrote an LND gRPC client with per-RPC macaroon credentials, TLS certificate validation and fixed fee limits, plus a BOLT11 decoder and an LNURL-pay resolver.

### ProofChain | Applied cryptography
Aug 2026 – Present
- Automated Bitcoin Core regtest testbeds with shell scripts and bitcoin-cli, and anchored SHA-256 document hashes on-chain with OP_RETURN outputs.
- Implemented RFC 6238 TOTP from first principles in Go (HMAC, dynamic truncation) with AES-256-GCM encryption.

### Lightning payments apps | github.com/altradits
- Built a non-custodial Lightning point-of-sale that issues BOLT11 invoices through LND, a Lightning tipping app (Buy Me a Buna) and a peer-to-peer services marketplace priced in sats (AfriSats).

### TouchType and AltSocial | Zero-dependency Go
Apr 2026 – Present
- Built concurrent web services using only the Go standard library, cross-compiled to single binaries for macOS, Linux and Windows (amd64 and arm64).

### Bitcoin Core Lab | Self-study curriculum
- Wrote a 13-stage offline curriculum on consensus, SegWit, RBF and CPFP, package relay, PSBT, HTLCs and functional tests, with a bug dojo of 5 historic CVEs and studies of 8 merged maintainer pull requests.

## Open Source
- Flying-Tea-Squad/lms: 12+ merged pull requests, including role-based authentication, API security, upload pipelines and materials persistence.
- minmoto/payment-channels: merged pull requests adding East African, Southern African and Western Sahara cash-corridor schemas (UN M49, ISO 3166-1, ISO 4217) and the Ethiopian Telebirr channel specification.
- annanodiyo/chemichemi: merged sensor ingestion and telemetry engine for Lake Victoria aquaculture monitoring.
- btrust-builders: merged contributions to the African Bitcoin contributor registries.
- nokia/ntt: Windows CI test automation for TTCN-3 toolchains.

## Education
### B.Sc. Mathematics (Second Class Upper) | University of Nairobi | Nairobi, Kenya
Dec 2021
- Coursework in number theory, finite fields and graph algorithms.

### Lightning Developer Bootcamp | Addis Ababa, Ethiopia
- Sponsored by Btrust Builders, Africa Free Routing and the Human Rights Foundation; covered Lightning internals, routing gossip and channel management, and built the LD Bootcamp developer platform.

### Software Engineering Apprenticeship | Zone01 Kisumu | Kisumu, Kenya
Apr 2026 – Present
