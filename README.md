<div align="center">

# ⚡ ALTRADITS ⚡
### *Calm financial companionship.*

<a href="https://e2b.dev/startups">
  <img src="Black-2.png" alt="SPONSORED BY E2B FOR STARTUPS" width="100%">
</a>

<br>

[![Go Version](https://img.shields.io/badge/Go-1.25+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Method](https://img.shields.io/badge/Method-Socratic-green?style=for-the-badge)](#-the-socratic-mentor)
[![Learning Environment](https://img.shields.io/badge/Sandbox-E2B-ff8800?style=for-the-badge)](https://e2b.dev)
[![Ecosystem](https://img.shields.io/badge/Built_at-Zone01_Kisumu-blue?style=for-the-badge)](https://www.zone01kisumu.ke/)

**We help people feel calmer, wiser, and more capable with money.**

---
</div>

Altradits is a personal wealth management operating system designed to make money feel calmer, clearer, and easier to manage. Instead of spreadsheets, stress, and confusion, Altradits helps users build better money behavior through reflection, gentle coaching, and intelligent organization.

Altradits is designed to feel like **a calm financial companion** — not a cold financial dashboard.

---

## Philosophy

> **"Did this make money feel easier today?"**

Money should feel calmer, clearer, less lonely, less scary, more hopeful, and easier to understand. Altradits exists to help people feel **calmer, wiser, and more capable with money**.

Every feature follows one core principle:

```
notice → reassure → assist → confirm
```

### Founder Principles

- Never shame. Never surprise. Never assume.
- Always ask consent.
- Reduce anxiety. Increase clarity.
- Protect future self. Help quietly.
- Human first. Trust over automation.

---

## Core Features

### Daily Money Capture
Fast, frictionless money entry. Supports chat input, todo lists, manual capture, and (future) SMS ingestion, voice, and sticky note OCR.

```
Fuel 2k
Lunch 350
Oak 5k
Send mum 2k
```

### Budgeting
Simple, customizable categories. Users create their own spending structure, track saving, and review daily behavior.

```
Food · Transport · Bills · Family · Grow Money · Fun · Emergency
```

### Bedtime Logoff Ritual
The heart of Altradits. At the end of every day:

```
review → reflect → learn → prepare tomorrow → close calmly
```

Goal: reduce financial anxiety before sleep.

### Affordability Guidance
Instead of YES / NO, Altradits explains comfort:

> This looks comfortable. Buying this may slow your laptop goal slightly.

### Financial Freedom Planning
Tracks when investment income can comfortably support life expenses. Shows spending, savings, investment growth, and freedom timeline in plain language.

### Companion System
A behavioral growth companion — Seed, Puppy, Kitten, or Tree — that grows based on consistency, reflection, saving, and planning. **Not based on wealth or income.**

### Investment Tracking
Tracks money market funds, treasury bills, bonds, stocks, ETFs, and personal investments in simple language.

### AI Financial Companion
Acts as guide, planner, teacher, coach, and protector. Never judgmental, pushy, manipulative, or shame-based.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, TailwindCSS |
| Backend | Go (Gin) |
| Database | PostgreSQL |
| Cache & Queue | Redis |
| Auth | JWT / Session-based |
| AI | LLM APIs, behavioral intelligence, forecasting logic |
| Infrastructure | Docker, Docker Compose |

### Architecture Philosophy

Altradits follows **modular monolith architecture** — one clean backend that supports founder speed, simplicity, clean organization, and future scalability. No premature microservices.

---

## Project Structure

```
altradits/
│
├── apps/
│   └── web/                    # Next.js frontend
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── store/
│       ├── lib/
│       ├── styles/
│       └── types/
│
├── server/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go         # App entry point
│   │
│   ├── internal/
│   │   ├── auth/               # Authentication
│   │   ├── users/              # Profiles & preferences
│   │   ├── capture/            # Money capture
│   │   ├── transactions/       # Transaction logic
│   │   ├── budget/             # Budget engine
│   │   ├── bedtime/            # Night reflection
│   │   ├── coaching/           # AI coaching
│   │   ├── forecast/           # Predictions
│   │   ├── affordability/      # Can I afford this?
│   │   ├── goals/              # Savings goals
│   │   ├── investments/        # Investment tracking
│   │   ├── freedom/            # Financial freedom engine
│   │   ├── notifications/      # Alerts & reminders
│   │   ├── sms/                # SMS ingestion
│   │   ├── ocr/                # Sticky note OCR
│   │   ├── companion/          # Companion growth
│   │   ├── analytics/          # Reporting
│   │   └── shared/             # Shared utilities
│   │
│   ├── database/
│   │   ├── migrations/
│   │   ├── queries/
│   │   └── seeds/
│   │
│   ├── workers/
│   │   ├── bedtime_worker.go
│   │   ├── sms_worker.go
│   │   ├── forecast_worker.go
│   │   └── coaching_worker.go
│   │
│   ├── configs/
│   ├── pkg/
│   └── tests/
│
├── docs/
│   ├── PRODUCT_BIBLE.md
│   └── DOCUMENTATION.md
│
├── scripts/
│   ├── setup.sh                # First-time setup after clone
│   ├── verify.sh               # Health checks for all services
│   └── docker-api-entrypoint.sh
├── .env.example
├── docker-compose.yml
├── Makefile
├── Setup.md
└── README.md
```

---

## Event-Driven System

Altradits behaves through events:

```
sms_received → classify_transaction → update_budget → bedtime_queue → coaching_update

day_closed → daily_summary → forecast_update → companion_growth → tomorrow_preview
```

---

## Development Roadmap

### Phase 0 — Foundations (2–4 weeks)
Project setup, authentication, database schema, dashboard shell, navigation, user profile, basic state management.

### Phase 1 — Daily Money OS MVP (4–8 weeks)
Quick capture, budget categories, daily dashboard, bedtime logoff, daily snapshots, goals.

**V1 definition of done:** User can track spending, track Oak, budget calmly, close the day, plan goals, see tomorrow, and feel organized.

### Phase 2 — Money Intelligence (4–8 weeks)
Auto classification, behavior detection, forecasting lite, affordability engine, weekly review.

### Phase 3 — Smart Inputs (4–10 weeks)
SMS parsing (M-Pesa, bank alerts), todo integration, sticky note OCR, voice capture.

### Phase 4 — AI Companion (4–8 weeks)
Companion system, AI coaching, personalized guidance, tone adaptation.

### Phase 5 — Investment OS (4–12 weeks)
Investment tracking, allocation view, financial freedom screen, goal-linked investing.

### Phase 6 — Admin Wealth Brain (6–12 weeks)
Research dashboard, market summaries, opportunity tracking, risk dashboard.

### Phase 7+ — Future
Assisted money automation (with explicit consent), family mode, platform ecosystem integrations.

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
| http://localhost:3000 | Web app — register, then explore |
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

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are **optional** — AI coaching falls back to calm template messages without them.

### 2. Start PostgreSQL and Redis

```bash
make dev-db
# or: docker compose up -d db cache
```

### 3. Install dependencies and migrate

```bash
go mod download
make migrate-up
cd apps/web && npm install && cd ../..
```

### 4. Run the backend

```bash
make dev-backend
# uses Air for live reload if installed, otherwise: go run server/cmd/api/main.go
```

### 5. Run the frontend

```bash
make dev-frontend
```

### 6. Create your account

Open http://localhost:3000 → **Register** → sign in. All data is scoped to your user.

---

## Docker (full stack)

Infrastructure only (recommended for daily dev):

```bash
docker compose up -d db cache
make migrate-up
make dev-backend    # local Go process
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
make dev-backend    # Go API on :8080
make dev-frontend   # Next.js on :3000
make dev-all        # db + migrate, then print next steps
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
| `OPENAI_API_KEY` | No | OpenAI for coaching features |
| `ANTHROPIC_API_KEY` | No | Claude for coaching features |
| `NEXT_PUBLIC_API_URL` | No | Frontend API base URL (default `http://localhost:8080`) |

Copy `apps/web/.env.example` → `apps/web/.env.local` for frontend overrides.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL is not set` | Run from repo root. Ensure `.env` exists: `cp .env.example .env` |
| `go: could not create module cache: permission denied` | Set `export GOPATH=$HOME/go` and `export GOMODCACHE=$GOPATH/pkg/mod` in your shell profile |
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
4. Build API: `go build -o altradits-api ./server/cmd/api`
5. Run migrations: `go run server/cmd/migrate/main.go up`
6. Build frontend: `cd apps/web && npm run build && npm run start`
7. Set `NEXT_PUBLIC_API_URL` to your public API URL at **build time**
8. Put HTTPS in front (nginx, Caddy, or a platform load balancer)
9. Never commit `.env` — use platform secrets

**Docker production:** use `docker compose --profile full up --build` as a starting point; swap dev Dockerfiles for multi-stage production images when ready.

## Revenue Model

Altradits earns because it helped — never through fear, confusion, or dark patterns.

| Tier | What's included |
|---|---|
| Free | Budgeting, capture, bedtime logoff, goals, companion, basic forecasting |
| Growth (subscription) | Advanced forecasting, AI coaching, investment tracking, behavior insights, OCR history |
| Family | Child budgeting, allowance tracking, saving games, shared planning |
| Investment OS | Portfolio tracking, allocation clarity, goal-linked investing |

**Never:** hidden fees, notification spam, attention addiction, fear marketing, selling user data.

---

## Contributing

Altradits values simplicity, clarity, kindness, maintainability, and thoughtful engineering.

Before adding complexity ask: **Does this genuinely help?**

---

## License

Private project. All rights reserved.

---

> I am not building another finance app.
> I am building calm financial companionship. 🌱

---

## 👨‍💻 Founder & Lead Architect
**Stanley Chege Thuita** *Software Engineering Apprentice @ [Zone01 Kisumu](https://www.linkedin.com/company/zone01kisumu/)*



**Connect with the journey:** [![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/stanmobitech) 
[![GitHub](https://img.shields.io/badge/GitHub-altradits-lightgrey?style=flat&logo=github)](https://github.com/altradits/altradits)
