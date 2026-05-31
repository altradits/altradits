# DOCUMENTATION.md
# Altradits — System Documentation

**Version:** 1.0
**Status:** Living Document
**Type:** Product Bible + Technical Documentation + Founder Manual

---

## 1. Introduction

### What is Altradits?

Altradits is a **calm financial companionship platform** — a personal wealth management operating system that helps users budget, save, plan, invest, reflect, organize money behavior, and reduce financial anxiety.

Unlike traditional finance apps, Altradits focuses on **behavior before wealth**.

The system helps users develop a healthier relationship with money through:

```
notice → reassure → assist → confirm
```

### Core Mission
Help people feel **calmer, wiser, and more capable** with money.

### Core Belief
Money should feel: calmer, clearer, less lonely, easier, less overwhelming, teachable, hopeful.

### Product North Star
> "Did this make money feel easier today?"

---

## 2. Product Philosophy

### Why Altradits Exists

Modern money systems create confusion, overwhelm, shame, anxiety, and loneliness. Most financial tools are cold, technical, stressful, and spreadsheet-heavy. Altradits exists to create **calm financial companionship**.

### Emotional Design Principles

The system should feel: calm, kind, clear, supportive, gentle, trustworthy, predictable.

It must never feel: judgmental, pushy, fearful, manipulative, or overwhelming.

### The Core Interaction Pattern

```
notice → reassure → assist → confirm
```

**Bad:** "Overspending detected."
**Good:** "Fridays usually feel fuller 🌙"

---

## 3. System Architecture

### Architecture Philosophy

Altradits uses **Modular Monolith Architecture**.

**Why:**
- Fast founder iteration
- Clean structure
- Maintainability
- Future scale readiness

**Avoid:** premature microservices, Kubernetes complexity, engineering theatre.

### High-Level Architecture

```
Next.js Frontend
       ↓
Go Backend API
       ↓
Core Domain Modules
       ↓
PostgreSQL + Redis
       ↓
Background Workers
       ↓
AI Services
```

### Recommended Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, TailwindCSS |
| Backend | Go (Gin) |
| Database | PostgreSQL |
| Cache & Queue | Redis |
| Auth | JWT or Session-based |
| Deployment | Docker, Docker Compose |

---

## 4. File Structure

```
altradits/
├── apps/
│   └── web/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── store/
│       ├── styles/
│       └── types/
│
├── server/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go
│   │
│   ├── internal/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── capture/
│   │   ├── transactions/
│   │   ├── budget/
│   │   ├── bedtime/
│   │   ├── coaching/
│   │   ├── forecast/
│   │   ├── affordability/
│   │   ├── goals/
│   │   ├── investments/
│   │   ├── freedom/
│   │   ├── notifications/
│   │   ├── sms/
│   │   ├── ocr/
│   │   ├── analytics/
│   │   ├── companion/
│   │   └── shared/
│   │
│   ├── workers/
│   ├── database/
│   ├── configs/
│   ├── pkg/
│   └── tests/
│
├── docs/
├── docker/
├── scripts/
└── README.md
```

---

## 5. Domain Modules

Each module owns a single responsibility.

### `auth`
Authentication, sessions, authorization.

### `capture`
Quick capture, chat capture, todo capture, SMS capture, OCR capture.

```
Fuel 2k
Oak 5k
Send mum 2k
```

### `transactions`
Storage, classification, updates, categorization.

### `bedtime`
Core nightly reflection engine.

```
review → reflect → coach → tomorrow preview → close day
```

### `coaching`
AI guidance layer. Purpose: help, not judge.

Example: "Fridays usually feel fuller. Tiny progress still counts 🌱"

### `affordability`
Answers: "Can I afford this?" Uses cashflow, goals, saving behavior, upcoming obligations, and risk tolerance.

### `freedom`
Financial freedom engine. Tracks annual expenses, passive income, investment growth, freedom timeline.

### `investments`
Tracks MMF, bonds, ETFs, treasury bills, stocks, funds.

### `companion`
Behavioral growth companion. Growth based on consistency, reflection, saving, planning, and habit formation — not wealth, status, or income.

### `sms`
M-Pesa and bank notification parsing.

### `ocr`
Sticky note photo → organized expense list.

### `analytics`
Behavioral reporting, daily snapshots, pattern detection.

---

## 6. Product Flows

### First-Time Onboarding
```
welcome → companion selection → money goals → first money moment
```
Purpose: reduce overwhelm.

### Daily Capture Flow
User input: `Lunch 300`
System: "food? KES 300? Confirm. Save."

### SMS Flow
Input: "Ksh 2,000 sent to Jane."
System: expense detected → family support candidate → confidence 92% → user confirms.

### Sticky Note OCR Flow
User scans: milk / oak 5k / rent
System: organizes → preview → confirm.

### Bedtime Logoff Flow
The most important flow:
```
notice → reflect → review → coach → tomorrow preview → close
```
Goal: reduce anxiety before sleep.

---

## 7. Event System

Everything runs on events.

| Event | Triggered by |
|---|---|
| `transaction_created` | Manual capture, SMS parse |
| `sms_received` | Incoming M-Pesa / bank alert |
| `todo_created` | Todo capture |
| `goal_updated` | Goal progress |
| `day_closed` | Bedtime logoff |
| `birthday_near` | Calendar detection |
| `salary_received` | Pattern detection |
| `subscription_detected` | Recurring charge pattern |

**Example lifecycle:**
```
sms_received → classify → update_budget → queue_bedtime → coaching_refresh
```

---

## 8. Bedtime Engine

**Purpose:** nightly calm.

**Sequence:**
1. Review spending
2. Missing entries check
3. Emotional reflection
4. Coaching moment
5. Tomorrow planning
6. Close day

**Example output:**
> 🌙 Today felt fuller than expected. Tomorrow looks manageable.

---

## 9. AI Personality

### Character
Kind, gentle, protective, calm, smart, non-judgmental.

### Never
Aggressive, guilt-inducing, fear-based, pushy.

### Communication Style

| Bad | Good |
|---|---|
| "Poor financial discipline." | "Saving felt harder this week." |
| "Overspending detected." | "Today felt fuller than expected." |
| "You are falling behind." | "Tiny progress still counts 🌱" |
| "Financial crisis warning." | "Things may feel slightly tighter next week." |

### AI Modes
- **Friend mode** — casual, supportive conversation
- **Loving mother mode** — protective, reassuring, patient
- **Coach mode** — goal-oriented, motivating, clear
- **Protective mode** — safety-first, flagging risks gently
- **Celebration mode** — warm acknowledgment of small wins

---

## 10. Companion System

**Purpose:** motivation through care.

**Companions:** Seed 🌱, Puppy 🐶, Kitten 🐱, Tree 🌳

**Growth based on:**
- Consistency
- Reflection
- Saving
- Planning
- Habit formation

**Not based on:** wealth, status, or income level.

---

## 11. Database Philosophy

**Principles:** simple, normalized, event-friendly, analytics-ready, auditable.

**Key entities:**

| Entity | Purpose |
|---|---|
| `users` | Identity, preferences, tone settings |
| `transactions` | All money events |
| `budgets` | Category allocations |
| `goals` | Savings targets |
| `daily_snapshots` | End-of-day behavioral record |
| `investments` | Portfolio items |
| `reminders` | Scheduled notifications |
| `companion_state` | Growth tracking |
| `events` | System event log |

---

## 12. Security & Privacy

**Core rule:** Trust first.

**Never:**
- Sell user data
- Hide fees
- Silently move money

**Sensitive access (SMS, bank notifications, financial behavior) requires:**
- Encrypted secrets
- Role-based access
- Audit logs
- Consent tracking
- Secure sessions

**Permission principle:**
```
explain → request permission → confirm
```

---

## 13. Revenue Model

**Philosophy:** earn because we helped.

### Revenue Layers

| Layer | Model | Included |
|---|---|---|
| 1 | Free core | Budgeting, capture, bedtime, goals, companion, basic forecasting |
| 2 | Premium membership | Advanced forecasting, AI coaching, investment tracking, behavior insights |
| 3 | Investment tracking | Portfolio view, allocation clarity, growth reporting |
| 4 | Optional assistance | Bill reminders, cashflow timing, payday planning (with consent) |
| 5 | Family mode | Child budgeting, allowance, saving games |
| 6 | Admin intelligence | Research dashboard, opportunity tracking, risk summaries |

### Never Monetize Through
Fear, confusion, dark patterns, hidden commissions, notification spam, selling user data, attention addiction.

---

## 14. Development Roadmap

### Build Order (recommended)
```
1  Authentication
2  Capture
3  Transactions
4  Dashboard
5  Budget
6  Bedtime logoff
7  Goals
8  Daily snapshots
9  Auto classification
10 Forecasting
11 Companion
12 Investments
13 SMS parsing
14 OCR
15 Affordability
16 Research dashboard
```

### Phase Summary

| Phase | Focus | Duration |
|---|---|---|
| 0 | Foundations — auth, schema, shell | 2–4 weeks |
| 1 | Daily Money OS MVP | 4–8 weeks |
| 2 | Money Intelligence | 4–8 weeks |
| 3 | Smart Inputs (SMS, OCR, voice) | 4–10 weeks |
| 4 | AI Companion | 4–8 weeks |
| 5 | Investment OS | 4–12 weeks |
| 6 | Admin Wealth Brain | 6–12 weeks |
| 7+ | Assisted money, family mode, ecosystem | Future |

### Solo Founder Rules
- Ship ugly. Not perfect.
- Build usefulness before beauty.
- One feature at a time.
- Avoid premature AI complexity.
- Use libraries. Do not reinvent infrastructure.
- Launch personal version first. You are user #1.

---

## 15. API Design Philosophy

**Principles:** predictable, small, modular, domain-oriented.

**Example routes:**
```
POST /capture
POST /bedtime/close
POST /affordability/check
GET  /forecast
GET  /budget
GET  /goals
GET  /investments
```

---

## 16. Deployment

```
Frontend  → Next.js (Vercel or Docker)
Backend   → Go API (Docker)
Database  → PostgreSQL
Cache     → Redis
Local     → docker compose up --build
```

---

## 17. Founder Principles

### Always optimize for
Calm, clarity, trust, simplicity, learning, agency.

### Avoid
Panic, addiction, fear marketing, complexity, judgment.

### The Founder Decision Checklist
Before any feature ask:
- Does this reduce anxiety?
- Does this preserve dignity?
- Does this feel simple?
- Does this help tomorrow?
- Does this teach gently?
- Does this preserve agency?
- Would I recommend this to my younger self?
- Would this help a child learn money?
- Would this comfort someone tired?

If uncertain: **simplify.**

### Anti-Patterns — Never Become
Casino investing app, attention machine, shame machine, finance bro product, complicated dashboard, fear marketer, hidden fee business, addiction loop, surveillance product.

---

## 18. Future Vision

Altradits eventually becomes a **personal wealth operating system** — helping users budget, save, invest, plan, forecast, protect essentials, grow wealth, learn money, and feel calm.

**Ultimate goal:**
> Money becomes easier. Life becomes calmer.

---

## 19. Final North Star

Before shipping any feature ask:

> **"Did this make money feel easier today?"**

If yes: ship.
If no: simplify.

---

*You are not building software. You are building calm financial companionship. 🌱*
