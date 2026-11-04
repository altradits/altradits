# Altradits

[![Tests and security checks](https://github.com/altradits/altradits/actions/workflows/test.yml/badge.svg)](https://github.com/altradits/altradits/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The code behind [altradits.com](https://altradits.com): free Bitcoin tools and learning for people new to Bitcoin, including **Ye₿ente**, a custodial Bitcoin Lightning wallet for everyday amounts, and the admin dashboard that runs the Lightning node behind it.

## What lives here

- `server.mjs`, `api/`: the website and its API (Node.js, no framework).
- `lib/`: shared code: wallets, Lightning, receipts, mail, security.
- `yebente/`: the Ye₿ente wallet app (React + Vite). The shipped build in `yebente/app` is committed with the source that produced it.
- `assets/admin.js`, `admin.html`: the node operator dashboard.
- `test/`: the test suite, including the build-stage security guard.
- `docs/`: manuals and guides (setup, Lightning, review process).
- `deploy/`, `.github/`: signed-merge tooling, deploy and CI.

## Quick start

Requirements: Node.js 20 or newer (CI runs 24).

```sh
npm ci --ignore-scripts
cp .env.example .env
npm run dev
```

Open http://localhost:3000 (admin: /admin, token `dev` on a local machine only).
On a server, a missing `ADMIN_TOKEN` locks the admin instead.

```sh
npm test   # full suite, including the security guard
```

The Ye₿ente app:

```sh
cd yebente && npm ci && npm run dev   # http://localhost:5173
npm run build                         # rebuilds yebente/app (commit it too)
```

## Docs

- `DEPLOY.md`: hosting the site and connecting the node.
- `docs/yebente.md`: how the wallets work.
- `docs/manual-lnd.md`: the Lightning node, keys and backups.
- `docs/security-handbook.md`: how this project stays safe.
- `docs/review-guide.md`: how changes are reviewed.
- `docs/hackathon.md`: the Meta hackathon entry (Muse-powered agents).

## Contributing, security, conduct

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). One topic per PR, tests with every fix, reviewed in the open like Bitcoin Core.
- Security problems: see [SECURITY.md](SECURITY.md). Never open them as issues.
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT. See [LICENSE](LICENSE).

Further reading: Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System. https://bitcoin.org/bitcoin.pdf

Built by Stanley Chege Thuita in Kisumu, Kenya: free tools, built in the open, for anyone online.
