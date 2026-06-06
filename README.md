<div align="center">

# ⚡ ALTRADITS ⚡
### *Calm financial companionship.*

<a href="https://e2b.dev/startups">
  <img src="Black-2.png" alt="SPONSORED BY E2B FOR STARTUPS" width="100%">
</a>

<br>

[![Go Version](https://img.shields.io/badge/Go-1.2x+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
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
├── docker/
├── scripts/
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

## Local Development

### Prerequisites
- Go 1.21+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional, for database)

### 1. Clone
```bash
git clone https://github.com/your-org/altradits.git
cd altradits
```

### 2. Environment variables

Create `.env` from `.env.example`:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/altradits
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 3. Start infrastructure (PostgreSQL + Redis)

**Option A: Docker Compose (recommended)**
```bash
docker compose up -d db cache
```

**Option B: Local services**
Ensure PostgreSQL is running on port 5432 and Redis on port 6379.

### 4. Run database migrations

```bash
cd server
go run ./cmd/migrate/main.go up
```

### 5. Run the backend

```bash
cd server
go run ./cmd/api/main.go
```

The API will be available at **http://localhost:8080**

### 6. Run the frontend

```bash
cd apps/web
npm install
npm run dev
```

The web app will be available at **http://localhost:3000**

### 7. Access the application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/health

### Quick start with Docker (all-in-one)

```bash
docker compose up --build
```

This starts the web frontend (port 3000), API backend (port 8080), PostgreSQL (port 5432), and Redis (port 6379) together.

### Useful Make targets

```bash
make dev-db       # Start only Postgres + Redis
make dev-backend  # Run Go backend with Air live reload
make dev-frontend # Run Next.js dev server
make migrate-up   # Apply all pending migrations
make db-reset     # Wipe and recreate database from scratch
make test         # Run backend tests
```

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
