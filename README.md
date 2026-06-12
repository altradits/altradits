<div align="center">

# ⚡ ALTRADITS ⚡
### *A calm Bitcoin Lightning wallet.*

<a href="https://e2b.dev/startups">
  <img src="Black-2.png" alt="SPONSORED BY E2B FOR STARTUPS" width="100%">
</a>

<br>

[![Go Version](https://img.shields.io/badge/Go-1.25+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Lightning](https://img.shields.io/badge/Bitcoin-Lightning-f7931a?style=for-the-badge&logo=lightning&logoColor=white)](#)
[![Ecosystem](https://img.shields.io/badge/Built_at-Zone01_Kisumu-blue?style=for-the-badge)](https://www.zone01kisumu.ke/)

---
</div>

Altradits is a simple, calm Bitcoin Lightning wallet. Send and receive sats over Lightning, deposit and withdraw via M-Pesa, track the live BTC/KES rate, and review your transaction history — all from a clean, focused interface.

---

## Core Features

- **Lightning wallet** — send and receive Bitcoin over the Lightning Network
- **M-Pesa deposit & withdraw** — top up or cash out in KES via STK push
- **Request payments** — generate a Lightning invoice (with QR code) to receive sats
- **Live BTC/KES price** — exchange rate tracking with 24h change
- **Transaction history** — searchable history with CSV export
- **Accounts** — simple email/password registration and login
- **Admin dashboard** — bank-wide overview of users, balances, and transactions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, TailwindCSS |
| Backend | Go (Gin) |
| Database | PostgreSQL |
| Cache & Queue | Redis |
| Auth | JWT |
| Infrastructure | Docker, Docker Compose |

---

## Project Structure

```
altradits/
│
├── apps/
│   └── web/                      # Next.js (App Router) frontend
│       ├── app/
│       │   ├── admin/            # Admin dashboard (bank-wide stats, users, activity)
│       │   ├── login/
│       │   ├── register/
│       │   ├── wallet/
│       │   │   ├── price/        # BTC/KES price view
│       │   │   └── transactions/ # History + CSV export
│       │   ├── layout.tsx
│       │   └── page.tsx          # Single dashboard: balance, activity donut,
│       │                          # inline Send/Receive (Sats ⇄ M-Pesa), or
│       │                          # landing page if logged out
│       ├── components/           # NavBar, DonutChart, ReceivePanel, SendPanel, shared UI
│       ├── contexts/             # AuthContext
│       ├── lib/                  # apiFetch + shared helpers
│       └── public/
│
├── server/
│   ├── cmd/
│   │   ├── api/
│   │   │   └── main.go           # App entry point
│   │   └── migrate/
│   │       └── main.go           # Migration CLI (make migrate-up/down)
│   │
│   ├── internal/
│   │   ├── admin/                # Admin oversight (bank stats, users, activity)
│   │   ├── auth/                 # Authentication
│   │   └── wallet/                # Bitcoin Lightning + M-Pesa wallet
│   │
│   ├── database/
│   │   └── migrations/           # Sequential .up.sql / .down.sql pairs
│   │
│   ├── workers/
│   │   └── exchange_rate_worker.go
│   │
│   └── pkg/
│       └── envload/              # .env file loader
│
├── scripts/
│   ├── setup.sh                  # First-time setup after clone
│   ├── verify.sh                 # Health checks for all services
│   └── docker-api-entrypoint.sh
│
├── .env.example
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## Quick Start (after clone)

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) (for Postgres + Redis), [Go 1.22+](https://go.dev/dl/) (auto-downloads 1.25 via toolchain), [Node.js 20+](https://nodejs.org/)

```bash
git clone https://github.com/altradits/altradits.git
cd altradits
make setup          # creates .env, starts db/cache, migrates, npm install
```

Open **two terminals** from the project root:

```bash
# Terminal 1 — API (port 8080)
make dev-backend

# Terminal 2 — Web (port 3000)
make dev-frontend
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Web app — register, then explore your wallet |
| http://localhost:8080/health | API health check |
| http://localhost:8080 | REST API |

Verify everything is wired:

```bash
make verify
curl http://localhost:8080/health
```

---

## Local Development (step by step)

All commands run from the **repository root** (`go.mod` lives here — do not `cd server` for Go commands).

### 1. Clone and configure environment

```bash
git clone https://github.com/altradits/altradits.git
cd altradits
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edit `.env` if needed. Defaults work with the Docker database:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/altradits?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-to-a-long-random-string
```

### 2. Install dependencies

```bash
go mod download
cd apps/web && npm install && cd ../..
```

### 3. Run the backend

```bash
make dev-backend
# starts Postgres + Redis (Docker), applies migrations, then runs the API
```

### 4. Run the frontend

```bash
make dev-frontend
```

### 5. Create your account

Open http://localhost:3000 → **Register** → sign in. All data is scoped to your user.

---

## Docker (full stack)

Infrastructure only (recommended for daily dev):

```bash
make dev-backend    # starts db/cache, migrates, runs the local Go process
make dev-frontend   # local Next.js process
```

Everything in containers (API + web + db + cache):

```bash
docker compose --profile full up --build
```

The API container runs migrations automatically on startup.

---

## Make commands

```bash
make help           # list all targets
make setup          # first-time setup after clone
make verify         # check db, redis, API, frontend
make dev-db         # Postgres + Redis only
make migrate-up     # apply pending migrations
make migrate-down   # roll back last migration
make dev-backend    # Go API on :8080 (also starts db/cache + migrates)
make dev-frontend   # Next.js on :3000
make dev            # full Docker stack (profile: full)
make db-reset       # wipe DB volume and re-migrate
make build-backend  # compile binary to server/bin/altradits
make test           # backend tests
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret for signing auth tokens — change in production |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | If set, this account is created (or promoted to admin) on startup. Password is hashed before storage |
| `EXCHANGE_RATE_API_URL` | No | BTC/KES exchange rate source (default: CoinGecko) |
| `EXCHANGE_RATE_CACHE_TTL` | No | Exchange rate cache TTL in seconds (default: 300) |
| `LND_REST_HOST` | No | LND node REST host — falls back to a mock Lightning provider if unset |
| `LND_MACAROON_HEX` / `LND_MACAROON_PATH` | No | LND macaroon for authenticating to the node |
| `LND_TLS_CERT_PATH` / `LND_TLS_INSECURE_SKIP_VERIFY` | No | TLS settings for the LND node |
| `NEXT_PUBLIC_API_URL` | No | Frontend API base URL (default `http://localhost:8080`) |

Copy `apps/web/.env.example` → `apps/web/.env.local` for frontend overrides.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL is not set` | Run from repo root. Ensure `.env` exists: `cp .env.example .env` |
| `go: could not create module cache: permission denied` | `make` targets and `scripts/setup.sh` already pin `GOPATH`/`GOMODCACHE` to `$HOME/go`. If running `go` directly (outside `make`), export `GOPATH=$HOME/go GOMODCACHE=$HOME/go/pkg/mod` first |
| `go: go.mod requires go >= 1.25.0` | Install Go 1.22+ — the toolchain auto-downloads 1.25. Or: `go install golang.org/dl/go1.25.0@latest && go1.25.0 download` |
| `connection refused` on :5432 | Start database: `make dev-db` and wait ~5s |
| `could not reach the server` in browser | Start API: `make dev-backend`. Check `curl localhost:8080/health` |
| Migration errors / dirty state | Reset: `make db-reset` |
| Port 3000 or 8080 already in use | `lsof -i :3000` or `lsof -i :8080` to find the process |
| CORS errors | API allows `http://localhost:3000` by default. Match `NEXT_PUBLIC_API_URL` to your API origin |
| `npm ci` fails in Docker | Run `cd apps/web && npm install` locally first to refresh `package-lock.json` |
| API starts but Redis shows degraded | Non-fatal. Start cache: `docker compose up -d cache` |

Run the diagnostic script anytime:

```bash
make verify
```

---

## Hosting checklist

Before deploying to staging or production:

1. Set strong `JWT_SECRET` (32+ random characters)
2. Use managed PostgreSQL and Redis (or self-hosted with backups)
3. Set `DATABASE_URL` and `REDIS_URL` to production endpoints
4. Connect a real Lightning node (set `LND_REST_HOST` + macaroon + TLS cert) — without it, the wallet uses a mock Lightning provider
5. Build API: `go build -o altradits-api ./server/cmd/api`
6. Run migrations: `go run server/cmd/migrate/main.go up`
7. Build frontend: `cd apps/web && npm run build && npm run start`
8. Set `NEXT_PUBLIC_API_URL` to your public API URL at **build time**
9. Put HTTPS in front (nginx, Caddy, or a platform load balancer)
10. Never commit `.env` — use platform secrets

**Docker production:** use `docker compose --profile full up --build` as a starting point; swap dev Dockerfiles for multi-stage production images when ready.

---

## License

Private project. All rights reserved.

---

## 👨‍💻 Founder & Lead Architect
**Stanley Chege Thuita** *Software Engineering Apprentice @ [Zone01 Kisumu](https://www.linkedin.com/company/zone01kisumu/)*

**Connect with the journey:** [![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/stanmobitech)
[![GitHub](https://img.shields.io/badge/GitHub-altradits-lightgrey?style=flat&logo=github)](https://github.com/altradits/altradits)
