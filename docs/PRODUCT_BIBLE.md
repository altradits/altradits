# PRODUCT_BIBLE.md
# Altradits — Product Bible

**Version:** 1.0
**Status:** Living Document
**Classification:** Founder-Only — Soul of the Product

---

> **"You are not building software. You are building calm financial companionship."**

---

## Table of Contents

- [Part 1 — Vision & Philosophy](#part-1--vision--philosophy)
- [Part 2 — User Experience Philosophy](#part-2--user-experience-philosophy)
- [Part 3 — User Personas](#part-3--user-personas)
- [Part 4 — Frontend Experience](#part-4--frontend-experience)
- [Part 5 — Backend Intelligence](#part-5--backend-intelligence)
- [Part 6 — Data Architecture](#part-6--data-architecture)
- [Part 7 — System Architecture](#part-7--system-architecture)
- [Part 8 — UX Copy System](#part-8--ux-copy-system)
- [Part 9 — AI Personality](#part-9--ai-personality)
- [Part 10 — Product Flows](#part-10--product-flows)
- [Part 11 — Revenue Model](#part-11--revenue-model)
- [Part 12 — Development Roadmap](#part-12--development-roadmap)
- [Part 13 — Founder Principles](#part-13--founder-principles)

---

## Part 1 — Vision & Philosophy

### 1.0 Why Altradits Exists

Modern money systems create confusion, overwhelm, shame, anxiety, and loneliness. People struggle with bills, budgeting, saving, investing, and planning. Most financial tools are cold, technical, stressful, and spreadsheet-heavy. They punish confusion. They reward wealth over behavior. They leave people feeling alone.

Altradits exists to create **calm financial companionship**.

Too many people face money alone. Spreadsheets do not comfort people. Statements do not teach behavior. Financial systems often punish confusion.

Altradits should help people feel: **"I can do this."**

### 1.1 Emotional Mission

Help people feel calmer, wiser, and more capable with money.

Not: maximize assets under management.
Not: increase screen time.
Not: create dependence.

Success means the user gradually needs less anxiety. Not more product.

### 1.2 Product Manifesto

Money should feel:
- Calmer
- Clearer
- Less lonely
- Less scary
- More hopeful
- Easier to understand
- Teachable

Every feature, every screen, every word of copy must serve this manifesto.

### 1.3 Product North Star

> **"Did this make money feel easier today?"**

If yes: ship.
If unclear: do not ship.
If no: simplify.

This question governs every product decision. Sprint by sprint. Feature by feature.

### 1.4 Psychological Design Principles

Altradits is designed around how people actually feel about money — not how they ideally should behave.

- People feel shame about spending. Altradits never shames.
- People feel overwhelmed by choices. Altradits simplifies.
- People forget things when tired. Altradits is patient.
- People fear judgment. Altradits is private and kind.
- People need small wins to stay motivated. Altradits celebrates tiny progress.
- People fear the future. Altradits makes tomorrow feel manageable.

### 1.5 Trust System

Every interaction follows one pattern:

```
notice → remind → assist → confirm
```

Altradits never acts without the user knowing. Never moves money silently. Never makes decisions on behalf of users. It notices, it suggests, it asks, it confirms.

---

## Part 2 — User Experience Philosophy

### 2.0 The Loving Mother / Caring Friend Model

Altradits should feel like two people combined:

**A loving mother** who:
- Notices when you're stressed
- Never judges your decisions
- Reminds you gently without nagging
- Protects you from future harm
- Celebrates every small win
- Stays calm when you panic

**A caring friend** who:
- Speaks simply and honestly
- Explains things without jargon
- Checks in without being intrusive
- Helps you think things through
- Never makes you feel stupid
- Is always on your side

### 2.1 Tone of Voice

Altradits speaks in plain, warm, simple language. It never uses financial jargon unless immediately explaining it. It never speaks in ALL CAPS, urgent red text, or panic-inducing language.

**The voice is:**
- Warm but not patronizing
- Simple but not childish
- Honest but not blunt
- Encouraging but not fake
- Calm but not robotic

**It sounds like:** a thoughtful friend who happens to understand money.

### 2.2 Emotional Safety Principles

Users should never feel:
- Judged for their spending
- Embarrassed about their balance
- Pressured to invest or save
- Scared of future financial outcomes
- Stupid for not knowing something
- Guilty for missing a goal

Users should always feel:
- Safe to be honest about money
- Supported in their decisions
- Proud of small progress
- Capable of improving
- In control of their financial life

### 2.3 Child-Simple Financial Language

If a child cannot understand the language, simplify it. Complexity belongs in the backend. Simplicity belongs in the frontend.

| Instead of | Altradits says |
|---|---|
| Portfolio allocation | Money split |
| Liquidity | Easy-to-reach money |
| Net worth | Total money picture |
| Asset allocation | How your money is spread |
| Compound interest | Money growing on itself |
| Amortization | How a loan shrinks over time |
| Diversification | Spreading money around |

### 2.4 Calm Finance UX System

Every screen should:
- Have one primary action
- Show only what is needed right now
- Use soft, calm colors (no urgent reds for routine information)
- Give the user a clear sense of where they are
- Never surprise the user with new information mid-flow

### 2.5 Anti-Anxiety Design

Anxiety in finance apps is often caused by:
- Unexpected numbers appearing on screen
- Red colors and warning icons for normal spending
- Complex dashboards with too many metrics
- Push notifications at stressful times
- Comparison with others

Altradits fights this by:
- Previewing information before showing it fully
- Using calm, neutral colors for normal states
- Showing only the most important metric per screen
- Asking before sending reminders
- Never comparing users to each other

---

## Part 3 — User Personas

### 3.1 Beginner Saver

**Who:** Someone just starting to think about money. May never have budgeted before. Possibly confused, a little ashamed, wanting to do better.

**Fears:** Being judged. Getting it wrong. Not knowing where to start.

**Needs:** Encouragement, simplicity, a safe place to begin.

**How Altradits helps:** Starts with one question. "What mattered today?" No setup complexity. No 12-step onboarding. Builds the habit of noticing before the habit of optimizing.

### 3.2 Child Learner

**Who:** A young person (10–17) learning about money for the first time, possibly through a parent-supervised mode.

**Fears:** Getting in trouble. Not understanding.

**Needs:** Simple language, fun feedback, saving games, a companion that grows.

**How Altradits helps:** The companion system, saving goals, allowance tracking. Language is always child-safe. No investment complexity. Just: save, notice, celebrate.

### 3.3 Young Professional

**Who:** Early career, first salary, learning to manage money independently. Possibly making their first Oak or M-Pesa contributions.

**Fears:** Spending too much. Falling behind. Not saving enough.

**Needs:** Budgeting structure, bill reminders, simple investment tracking, understanding where their money goes.

**How Altradits helps:** Quick capture for salary-day transactions. Budget categories. Behavioral patterns. Gentle forecasting. A sense of progress.

### 3.4 High Ambition Investor

**Who:** Someone building wealth actively. Tracking multiple investments — stocks, bonds, MMF, treasury bills, ETFs. Wants clarity across their portfolio.

**Fears:** Missing opportunities. Losing track. Making uninformed decisions.

**Needs:** Investment tracking, allocation views, research summaries, risk visibility.

**How Altradits helps:** The investment OS layer — portfolio tracking, allocation clarity, goal-linked investing, research dashboard. Calm clarity, not trading excitement.

### 3.5 Family Planner

**Who:** Managing money for a household. Tracking rent, school fees, family support, grocery, transport. Often managing multiple responsibilities at once.

**Fears:** Running short. Missing a bill. Failing the family.

**Needs:** Multi-category budgeting, bill reminders, family goal tracking, income and expense overview across obligations.

**How Altradits helps:** Budget customization, bill calm mode, goal systems for family events, affordability checks before large decisions. Calm, not panic.

### 3.6 Financial Recovery User

**Who:** Someone recovering from debt, a financial crisis, or a period of disorganization. May feel shame or anxiety about their situation.

**Fears:** Judgment. Being told they are failing. Seeing how bad things are.

**Needs:** Non-judgmental support, small wins, gradual re-engagement with money.

**How Altradits helps:** The tone is never shaming. Progress is always celebrated regardless of the baseline. The companion grows from any starting point. Bedtime logoff helps build daily awareness without overwhelm.

---

## Part 4 — Frontend Experience

### 4.0 Screen Inventory

**Core screens:**
- Home (dashboard)
- Budget
- Capture
- Goals
- Investments
- Settings
- Bedtime

**Companion & motivation:**
- Companion screen (growth, milestones)
- Rewards and badges

**Tools:**
- Affordability assistant
- Financial freedom planner
- Subscription protector
- Bill calm mode
- Birthday planner

**Capture methods:**
- Chat capture
- Todo capture
- SMS ingestion (Phase 3)
- Sticky note OCR (Phase 3)
- Voice capture (Phase 3)

### 4.1 Home Dashboard

The home screen shows exactly what the user needs right now. Not everything. Not charts for the sake of charts.

**Primary content:**
- Today's spending summary
- Budget progress (calm, not alarming)
- Saving progress
- Goal progress
- Quick capture action

**Principle:** One glance should answer "Am I okay today?" The answer should almost always feel manageable.

### 4.2 Budget Screen

Simple, customizable categories. Users create their own money categories that match their real life. The system suggests defaults but never forces them.

**Default suggestions:**
```
Food · Transport · Bills · Family · Grow Money · Fun · Emergency · Save
```

**Behavior:** Budget progress shown as calm fill bars. No red unless genuinely urgent. Overspend shown as "fuller than usual" not "over budget."

### 4.3 Capture Screen

The fastest possible money entry. Designed for one-handed use while walking, commuting, or distracted.

**Formats accepted:**
```
Lunch 300
Fuel 2k
Oak 5k
Send mum 2k
```

System parses amount, suggests category, asks for confirmation. No forcing. No required fields.

### 4.4 Goals Screen

Simple goal cards. Each goal shows:
- Name and emoji chosen by the user
- Target amount
- Current progress
- Projected completion date
- One tap to add money

**Example goals:** Birthday fund, Emergency savings, Laptop, Vacation, Freedom fund, School fees.

### 4.5 Companion System

A behavioral growth companion the user selects at onboarding.

**Choices:** Seed 🌱, Puppy 🐶, Kitten 🐱, Tree 🌳

**Grows based on:**
- Daily bedtime logoffs completed
- Consistent capture behavior
- Goal contributions
- Reflective moments

**Never based on:** income, balance, or investment size.

**Purpose:** Give users a visual representation of their financial consistency — not their wealth. Celebrates the behavior, not the outcome.

### 4.6 Bedtime Logoff

The most important screen in Altradits. This is where behavior change happens.

**Flow:**
```
notice → reflect → review → coach → tomorrow preview → close
```

The bedtime ritual helps users close their financial day calmly. It is never stressful. It ends with a preview of tomorrow so the user wakes up prepared.

**Goal:** The user closes the app feeling calmer than when they opened it.

### 4.7 Daily Money Journal

An optional daily reflection prompt. Simple questions:
- What mattered financially today?
- How did money feel today?
- What would you do differently?

Entries are private. Used to improve AI coaching over time (with user consent).

### 4.8 Sticky Notes

Quick personal notes attached to transactions or dates. User can photograph a handwritten sticky note and the system extracts entries.

**Example input:**
```
milk
rent
oak 5k
```

System organizes, previews, and asks the user to confirm before saving.

### 4.9 Affordability Assistant

Answers the question: "Can I afford this?"

User inputs an item or amount. System evaluates:
- Current cashflow
- Upcoming obligations
- Goal progress impact
- Saving behavior
- Risk tolerance

**Output style:**
- "This looks comfortable."
- "This may slow your laptop goal slightly."
- "This week feels tight — next week may be easier."

Never: YES / NO. Always: honest, calm context.

### 4.10 Financial Freedom Planner

Tracks the user's path to financial freedom — the point at which investment income can comfortably support life expenses.

**Shows:**
- Current monthly expenses
- Current passive/investment income
- Gap to freedom
- Estimated freedom timeline
- Investment growth trajectory

**Language:** Plain. "Your money is working. At this rate, it could support your expenses in approximately X years."

### 4.11 Birthday Planner

Helps users prepare financially for upcoming birthdays (their own and others). Links to goals so money is set aside in advance. Reduces the stress of surprise expenses.

### 4.12 Subscription Protector

Detects recurring charges from SMS and bank notifications. Shows the user all active subscriptions. Flags ones that haven't been used. Asks before cancellation. Never cancels silently.

### 4.13 Bill Calm Mode

Before a bill is due, Altradits enters "bill calm mode" — gently notifying the user days in advance in a warm tone. No panic. No red alerts. Just: "Your water bill is likely coming soon. You're covered."

### 4.14 Rewards and Emotional Gamification

Altradits celebrates behavior, not wealth.

**Rewards for:**
- First bedtime logoff
- One week of daily capture
- First goal contribution
- Completing a savings goal
- Seven-day reflection streak

**Never rewards for:**
- Highest balance
- Most investments
- Spending control (never shame-based gamification)

---

## Part 5 — Backend Intelligence

### 5.0 Behavioral Engine

The core intelligence layer. Watches patterns over time without alarming the user. Detects:
- Salary rhythm
- Recurring expenses
- Unusual spending days
- Category drift
- Goal contribution consistency

Output feeds the coaching engine and forecasting engine. Never surfaces raw scores to users.

### 5.1 Classification Engine

Parses free-text input and SMS messages to categorize transactions.

**Examples:**
```
"Fuel 2k"         → Transport, KES 2,000
"Oak 5k"          → Investments / Grow Money, KES 5,000
"Send mum 2k"     → Family, KES 2,000
"Ksh 300 Naivas"  → Food, KES 300
```

Confidence scoring. If confidence is low, asks the user. Never assumes silently.

### 5.2 Reminder Engine

Manages all notifications and reminders. Governed by:
- User-set preferences
- Time of day (no reminders at 2 AM)
- Emotional context (does not remind during detected stress periods)
- Consent (user opted in to each reminder type)

**Reminder styles:** gentle, warm, calm. Never urgent unless genuinely urgent (e.g., bill overdue).

### 5.3 Suggestion Engine

Generates helpful suggestions based on behavioral data:
- "You usually contribute to Oak on Fridays."
- "Your transport spending was higher this week — likely due to the trip on Tuesday."
- "You have KES 3,000 unallocated — want to put some toward your emergency fund?"

Suggestions are non-binding. Always dismissible. Never guilt-inducing.

### 5.4 Pattern Detection Engine

Identifies behavioral patterns over time:
- Salary day behavior
- Weekly spending rhythms
- Category trends (Food spending up, Transport down)
- Friday spending patterns
- End-of-month tightness

Used to power forecasting and coaching. Patterns are explained in plain language.

### 5.5 Financial Freedom Engine

Tracks the user's path to financial independence.

**Inputs:**
- Monthly expenses (from budget)
- Investment growth (from investment tracking)
- Passive income (user-declared)
- Savings rate

**Output:** Freedom timeline and progress over time.

### 5.6 Affordability Engine

Simulates the impact of a purchase on:
- Current cashflow
- Upcoming obligations (detected or user-declared)
- Goal timelines
- Saving rhythm

Returns a comfort level, not a decision. User chooses.

### 5.7 AI Coaching Engine

Powered by LLM. Reads behavioral data, pattern signals, and daily context to generate Socratic, caring coaching moments.

**Characteristics:**
- Never directive ("you should do X")
- Always curious ("have you noticed X?")
- Always kind
- Always based on real data (not generic advice)

**Coaching triggers:**
- After bedtime logoff
- After salary detection
- After a goal is completed
- After a week of consistent behavior
- After a missed entry pattern

### 5.8 Risk Detection Engine

Quietly monitors for financial risk signals:
- Declining savings rate
- Increasing essential spending
- Goals falling behind
- Approaching bill without sufficient buffer

**Response:** Gentle, early warning. Never panic. Always framed as preparation, not alarm.

### 5.9 Emotional Context System

Tracks emotional signals from:
- Daily journal entries (if enabled)
- Time of day
- Day of week
- Pattern deviations

Used to adapt coaching tone. If a Monday after a hard week, the AI leads with support before coaching.

### 5.10 Event Detection System

Detects financially significant life events:
- Salary received
- Large expense
- Bill pattern
- Subscription renewal
- Birthday approaching
- Goal completed
- Goal stalled

Events trigger appropriate flows (bedtime queue, coaching refresh, suggestion).

### 5.11 Notification Logic

All notifications pass through a filter:
1. Is this genuinely useful right now?
2. Is this the right time of day?
3. Has the user consented to this type of notification?
4. Will this cause anxiety or reduce it?

If any filter fails: do not send.

---

## Part 6 — Data Architecture

### 6.0 Database Philosophy

Simple, normalized, event-friendly, analytics-ready, auditable.

No premature optimization. No exotic data structures. Just clean relational data that can be understood at a glance.

### 6.1 Key Tables

| Table | Purpose |
|---|---|
| `users` | Identity, preferences, tone settings, companion choice |
| `transactions` | All money events with amount, category, source, timestamp |
| `budgets` | Category allocations per period |
| `goals` | Savings targets with progress tracking |
| `daily_snapshots` | End-of-day behavioral and emotional record |
| `investments` | Portfolio items with type, amount, institution |
| `reminders` | Scheduled notifications with consent flags |
| `companion_state` | Growth level, milestones, last interaction |
| `events` | System event log (typed, timestamped) |
| `subscriptions` | Detected recurring charges |
| `journal_entries` | Optional daily reflections |
| `behavioral_scores` | Internal pattern signals (never user-facing) |

### 6.2 Relationships

- One user → many transactions
- One user → many goals
- One user → one companion state
- One user → many daily snapshots
- One user → many investments
- Transactions linked to budget categories
- Goals optionally linked to investment items
- Events linked to any entity that triggered them

### 6.3 Events Table

Everything significant is stored as an event. This enables:
- Behavioral analysis
- Coaching triggers
- Audit history
- Pattern detection

**Event types:**
```
transaction_created
sms_received
todo_created
goal_updated
goal_completed
day_closed
birthday_near
salary_received
subscription_detected
bill_detected
reminder_sent
coaching_triggered
companion_leveled_up
affordability_checked
```

### 6.4 Daily Snapshots

Stored every time the user completes a bedtime logoff.

**Contains:**
- Total income that day
- Total expenses that day
- Category breakdown
- Goal contributions
- Emotional reflection (optional)
- Coaching note delivered
- Companion state at close

Used for weekly summaries, behavioral analysis, and long-term trend detection.

### 6.5 AI Memory Layers

The AI coaching engine has access to layered memory:

- **Immediate:** Today's transactions and events
- **Weekly:** Last 7 days of behavior and snapshots
- **Pattern:** Detected rhythms and recurring behaviors
- **Profile:** User-declared goals, tone preferences, financial situation

Memory is never stored indefinitely without consent. Users can review and delete AI memory.

### 6.6 Behavioral Scoring

Internal only. Never surfaced to users.

Scores track:
- Capture consistency
- Bedtime logoff frequency
- Goal contribution regularity
- Reflection depth

Used only to adapt AI tone and coaching frequency. Never used to shame, rank, or compare users.

---

## Part 7 — System Architecture

### 7.0 Architecture Philosophy

Altradits uses **Modular Monolith Architecture**.

Fast founder iteration. Clean structure. Maintainability. Future scale readiness.

Avoid: premature microservices, Kubernetes complexity, engineering theatre.

### 7.1 Frontend Architecture

**Stack:** Next.js, TypeScript, TailwindCSS

**Structure:**
```
apps/web/
├── app/          # Next.js App Router pages
├── components/   # Shared UI components
├── hooks/        # Custom React hooks
├── services/     # API call layer
├── store/        # State management
├── lib/          # Utilities and helpers
├── styles/       # Global styles
└── types/        # TypeScript type definitions
```

**Design principles:**
- Server-first rendering where possible
- Progressive enhancement
- Mobile-first responsive design
- Calm color palette, no panic UI states

### 7.2 Backend Architecture

**Stack:** Go(Gin), PostgreSQL, Redis

**Structure:**
```
server/
├── cmd/api/main.go         # Entry point
├── internal/               # Private domain modules
├── workers/                # Background job runners
├── database/               # Migrations, queries, seeds
├── configs/                # Environment configuration
├── pkg/                    # Shared packages
└── tests/                  # Test suites
```

### 7.3 APIs

**Design principles:** predictable, small, modular, domain-oriented.

```
POST /capture                # Log a transaction or note
POST /bedtime/close          # Complete the bedtime logoff
POST /affordability/check    # Run an affordability simulation
GET  /forecast               # Get behavioral forecast
GET  /budget                 # Get budget state
GET  /goals                  # Get goal progress
GET  /investments             # Get investment portfolio
POST /sms/ingest             # Process incoming SMS
POST /ocr/extract            # Extract from sticky note image
GET  /companion              # Get companion state
GET  /coaching/latest        # Get latest coaching note
```

### 7.4 AI Orchestration

The AI coaching engine connects to an LLM API (OpenAI or equivalent) with:
- A system prompt encoding Altradits' tone and Socratic coaching style
- Behavioral context injected per request
- Output filtered to remove directive language
- Fallback responses if the API is unavailable

The AI never runs without behavioral data. Generic advice is explicitly prohibited. Every coaching moment is grounded in the user's actual patterns.

### 7.5 SMS Ingestion Pipeline

```
SMS received (M-Pesa / bank alert)
→ Parse amount and description
→ Classify transaction (confidence scored)
→ If high confidence: suggest entry to user
→ User confirms
→ transaction_created event fired
→ Budget updated
→ Bedtime queue updated
→ Coaching context refreshed
```

### 7.6 OCR Pipeline

```
User photographs sticky note
→ Image sent to OCR service
→ Text extracted
→ Lines parsed as potential transactions
→ Preview shown to user
→ User confirms each line
→ Confirmed entries saved
```

### 7.7 Notification Engine

All notifications pass through the notification engine before sending. The engine checks:
- User notification preferences
- Time of day rules
- Emotional context signals
- Rate limiting (no notification spam)

Notifications are queued, not immediate, unless genuinely time-sensitive.

### 7.8 Background Workers

```
bedtime_worker.go    # Triggers end-of-day prompts based on user patterns
sms_worker.go        # Processes SMS ingestion queue
forecast_worker.go   # Runs behavioral forecasts nightly
coaching_worker.go   # Refreshes coaching context after events
```

### 7.9 Security and Permissions

**Core rule:** Trust first. Protect always.

- All secrets encrypted at rest
- JWT-based authentication with secure session management
- Role-based access control
- Audit log for all sensitive operations
- Consent tracked for every data permission
- SMS and bank data stored with explicit user consent only
- No data sold. Ever.

**Permission flow:**
```
explain benefit → request permission → confirm → easy to revoke
```

---

## Part 8 — UX Copy System

### 8.0 What Altradits Says

The words Altradits uses are as important as the features it provides. Language is product.

**Capturing a transaction:**
- "Saved. 🌱"
- "Got it — food, KES 300. Confirm?"
- "Added to your day."

**Budget progress:**
- "Fridays usually feel fuller."
- "Food is tracking slightly higher this week."
- "Transport looks steady."

**Coaching moments:**
- "Tiny progress still counts. 🌱"
- "Saving felt harder this week — that's okay."
- "You've been consistent for 5 days. That matters."

**Bedtime:**
- "Ready to close today? 🌙"
- "Today felt fuller than expected. Tomorrow looks manageable."
- "You logged every entry this week. That's a big deal."

**Affordability:**
- "This looks comfortable."
- "This may slow your laptop goal slightly — up to you."
- "Things feel a bit tight this week. Next week may be easier."

**Goal progress:**
- "You're 40% of the way to your birthday fund."
- "One more contribution and your emergency fund reaches its target."

### 8.1 What Altradits Never Says

- "Overspending detected."
- "Poor financial discipline."
- "You are falling behind."
- "Financial crisis warning."
- "SAVE NOW!"
- "You'll fail financially without premium."
- "Upgrade now!"
- "Warning: insufficient funds."
- "You are spending irresponsibly."

### 8.2 Caring Language Patterns

| Situation | Bad | Good |
|---|---|---|
| Overspend | "Budget exceeded." | "Food felt fuller this week." |
| Missed goal | "Goal behind schedule." | "Your laptop goal slowed a bit — want to catch up?" |
| Low balance | "Insufficient funds warning." | "This week feels tight. Want to check what's coming?" |
| No capture | "No entries today." | "Haven't seen anything today — busy one?" |
| Bill due | "Bill payment required." | "Your water bill is likely coming soon. You're covered." |

### 8.3 Reminder Styles

**Gentle (default):**
> "Hey — you haven't closed your day yet. Five minutes tonight?"

**Caring:**
> "Just checking in. How did today feel, money-wise?"

**Protective:**
> "Rent usually comes around now. Want to make sure you're covered?"

**Celebratory:**
> "You've closed your day 7 days in a row. 🌱 That's a streak."

### 8.4 Motivation Language

Altradits motivates through recognition of effort, not comparison or fear.

**Good motivation:**
- "Tiny progress still counts."
- "You showed up today. That matters."
- "Consistency compounds."
- "One more step toward your goal."
- "This week was harder — that's real life. You're still here."

**Bad motivation:**
- "You're X% behind your peers."
- "Only X days left to hit your target."
- "You missed X days this week."

---

## Part 9 — AI Personality

### 9.0 Core Character

The Altradits AI is kind, gentle, protective, calm, smart, and non-judgmental. It has genuine warmth — not performed warmth.

**It is never:** aggressive, guilt-inducing, fear-based, pushy, or mysterious.

### 9.1 Friend Mode

Used for: casual daily interactions, capture confirmations, light coaching.

**Tone:** Warm, brief, low-pressure.

> "Got it — transport, 2k. Saved. 🌱"
> "Fridays usually feel fuller for you. That's a pattern."

### 9.2 Loving Mother Mode

Used for: bedtime logoff, stressful weeks, financial difficulty.

**Tone:** Protective, reassuring, patient. Like someone who loves you and knows money.

> "Today felt bigger than expected. You still showed up. That matters."
> "You're doing better than you think. Let's close today calmly."

### 9.3 Coach Mode

Used for: goal reviews, weekly summaries, habit formation moments.

**Tone:** Encouraging, direct, growth-oriented. Always grounded in real data.

> "Your saving rate was up 12% this week. What changed?"
> "You've hit your transport budget 3 weeks in a row. Want to try stretching the food goal next?"

### 9.4 Protective Mode

Used for: detected risk, approaching bills, unusual spending.

**Tone:** Careful, honest, early. Never alarmist.

> "Rent is usually around this time. Your buffer looks good — just wanted you to know."
> "This month's spending is tracking a bit higher than usual. Nothing urgent, but worth a look."

### 9.5 Celebration Mode

Used for: goal completions, streaks, milestones.

**Tone:** Genuine, warm, specific to what the user actually did.

> "You hit your emergency fund target. 🌱 That took 4 months of consistent effort."
> "Seven bedtime logoffs in a row. Your companion noticed too."

### 9.6 Calm Language Rules

The AI must always follow these rules regardless of mode:

1. Never use urgency language unless the situation is genuinely urgent
2. Always explain the "why" behind a suggestion
3. Never give advice without grounding it in the user's actual data
4. Never ask the user to do more than one thing at a time
5. Always end interactions on a note of possibility, not pressure
6. If uncertain, say less — not more

---

## Part 10 — Product Flows

### 10.0 Signup

```
welcome screen
→ one-line mission ("Calm financial companionship.")
→ companion selection (Seed / Puppy / Kitten / Tree)
→ first money goal ("What are you saving toward?")
→ first capture prompt ("What mattered financially today?")
→ home screen
```

Purpose: reduce overwhelm. No lengthy forms. No required financial data upfront.

### 10.1 First Week Onboarding

Day 1: First capture, first category, first bedtime logoff.
Day 2: Budget categories introduced. Gentle suggestion to customize.
Day 3: Goals screen introduced.
Day 4–6: Behavioral patterns noticed and reflected back.
Day 7: First weekly summary. First coaching note. Companion levels up.

### 10.2 First Salary

SMS or manual entry of salary received.

```
salary_received event
→ "Salary in. 🌙 Want to review your plan for this month?"
→ Budget review
→ Goal contribution suggestions
→ Essential bills confirmed
→ Saving allocation suggested (not forced)
→ User confirms
```

### 10.3 First Savings

User makes first contribution to a goal.

```
goal contribution captured
→ "First step toward [goal name]. 🌱"
→ Progress bar appears
→ Companion reacts
→ Projected completion date calculated
```

### 10.4 First Investment

User logs first investment entry.

```
investment created
→ "Logged. [Investment name] is now in your picture."
→ Investment tracking screen introduced
→ Allocation view shown if multiple investments
```

### 10.5 Missed Bills

System detects a recurring charge that has not appeared this month.

```
pattern detected: bill not received
→ "Your [bill name] hasn't appeared yet — usually comes around now."
→ User can confirm it's paid, mark as delayed, or flag to check
→ No alarm unless user confirms it is overdue
```

### 10.6 Pregnancy / Family-Safe Support

When a user declares a pregnancy or new family member:

```
family event declared
→ Expenses recategorized to include family items
→ New goal suggested (baby fund / school fees)
→ Coaching tone shifts to protective + long-term
→ Financial freedom timeline recalculated
→ Bill calm mode activated for essential services
```

### 10.7 Birthday Planning

User declares an upcoming birthday (their own or another's).

```
birthday_near event
→ "Your birthday is in X weeks. Want to plan for it?"
→ Budget set for celebration
→ Goal card created if needed
→ Gentle reminders as date approaches
→ Post-birthday reflection
```

### 10.8 Emergency Spending

User captures a large unexpected expense.

```
large unusual transaction detected
→ "That was a big one. Everything okay?"
→ User can mark as emergency
→ Budget impact shown calmly
→ Goal timeline recalculated
→ Coaching: "Unexpected things happen. Your emergency fund is for this."
```

### 10.9 Financial Recovery

User declares they are recovering from debt or financial difficulty.

```
recovery mode activated (user-declared)
→ Tone shifts to protective, patient, non-comparative
→ Goals simplified to essentials first
→ Coaching focuses on small wins only
→ No investment suggestions until buffer established
→ Financial safety priority order enforced
```

Priority order:
1. Food, rent, water, electricity, transport
2. Cash buffer
3. Goals
4. Optimization

---

## Part 11 — Revenue Model

### 11.0 Purpose

Revenue exists to sustain care. Not exploit anxiety. Not maximize addiction. Not create financial dependence.

Altradits makes money when users feel calmer, safer, more organized, and more trusting.

> "Altradits should earn because it helped."

### 11.1 Revenue Philosophy

Money products often profit from confusion, complexity, hidden fees, stress, and attention addiction. Altradits rejects this entirely.

**Rule:** If revenue harms trust, remove it.

**The business must answer:** "Would a loving mentor charge this way?"

### 11.2 Revenue Layers

| Layer | Model | What's included |
|---|---|---|
| 1 | Free core | Budgeting, capture, bedtime logoff, goals, companion, basic forecasting, basic affordability |
| 2 | Premium membership | Advanced forecasting, AI coaching, multi-account sync, investment tracking, behavior insights, calendar planning, OCR history |
| 3 | Investment tracking | Portfolio view, allocation clarity, growth reporting, risk exposure, goal-linked investing |
| 4 | Optional assistance | Bill reminders, cashflow timing, payday planning (explicit consent required) |
| 5 | Family mode | Child budgeting, allowance tracking, saving games, money education, family dashboards |
| 6 | Admin intelligence | Research dashboard, opportunity tracking, risk summaries, wealth analytics |

### 11.3 Free Core Experience

The free tier must already be genuinely valuable. Never cripple the core experience.

**Free includes:** budgeting, daily capture, bedtime logoff, goal tracking, basic reports, simple affordability, companion growth, basic forecasting.

**Core promise:** Money feels easier. Even for free.

### 11.4 Premium Membership

Power users pay for deeper support. Monthly subscription.

**Tone:** Never aggressive upsell.
- Bad: "Upgrade now!"
- Good: "🌱 Want deeper planning support?"

**Pricing philosophy:** Affordable. Simple. Transparent.

### 11.5 Managed Investment Service (Optional Future)

This enters regulated territory. Altradits must begin as: education, organization, tracking, coaching, planning — not investment manager, broker, or custodian.

**If ever offered:** transparent fees, performance-independent advisory fees, clear plain-language disclosure.

**User-facing language example:**
- Steady Growth
- Safety Basket
- Future Builder
- Income Basket

**Rule:** Never hide fees inside complexity.

### 11.6 What Altradits Must Never Do

- Sell user data
- Attention addiction mechanics
- Notification spam
- Hidden commissions
- Confusing fees
- Behavior manipulation
- Fear marketing
- Dark patterns
- Artificial urgency
- Fake scarcity
- Emotional guilt upsells

> "You'll fail financially without premium." — Never.

### 11.7 Revenue vs Trust Decision Framework

Before monetizing any feature, ask:
- Does this help?
- Does this reduce stress?
- Does this preserve agency?
- Is pricing understandable?
- Would we proudly explain it?
- Would a caring mentor recommend this?

If no to any: reject.

### 11.8 Suggested Business Evolution

| Phase | Focus |
|---|---|
| 1 | Personal OS — solo use, behavior tracking, Oak tracking, planning |
| 2 | Friends & family — premium planning, AI coaching |
| 3 | Investment tracking — multi-asset management, family mode |
| 4 | Regulated partnerships — assisted investing, institution integrations |

**Rule:** Grow trust before complexity.

### 11.9 Unit Economics Philosophy

Healthy business signals:
- Low churn
- High trust
- High retention
- Referrals
- Calm engagement

Bad business signals:
- Spam, addiction loops, fear, upsell pressure

**Success metric:** "People stayed because life felt easier."

---

## Part 12 — Development Roadmap

### 12.0 Purpose of the Roadmap

A vision this large can feel overwhelming. The roadmap answers: "What do we build first?"

```
Bad: build everything → burn out → never launch

Good: build smallest useful thing → learn → improve → grow
```

Altradits should evolve like a tree:
```
seed → roots → stem → branches → forest
```

**Core principle:** Build calm first. Intelligence later.

### 12.1 Development Philosophy

Build in layers:
```
foundation → behavior capture → clarity → intelligence → forecasting → automation → investing assistance
```

Every phase must deliver real value, real calm, real usability. Never build future complexity first.

**Golden build rule:** At every stage ask: "If we stopped building here, would this still help someone?" If yes: correct direction.

### 12.2 Phase 0 — Foundations (2–4 weeks)

Goal: working skeleton. No intelligence yet.

**Build:**
- Project setup
- Authentication
- Database schema
- Dashboard shell
- Navigation
- User profile
- Basic state management

**Screens:** Home, Budget, Capture, Goals, Settings, Bedtime

**Success:** Login works. App runs. Navigation works.

### 12.3 Phase 1 — Daily Money OS MVP (4–8 weeks)

Goal: daily money clarity.

**Features:** Quick capture, budget categories, daily dashboard, bedtime logoff, daily snapshots, goals.

**V1 definition of done:** User can track spending, track Oak, budget calmly, close the day, plan goals, see tomorrow, feel organized.

**Success metric:** User returns daily.

### 12.4 Phase 2 — Money Intelligence (4–8 weeks)

Goal: less effort.

**Features:** Auto classification, behavior detection, forecasting lite, affordability engine V1, weekly review.

**Success metric:** App becomes genuinely helpful.

### 12.5 Phase 3 — Smart Inputs (4–10 weeks)

Goal: reduce typing.

**Features:** SMS parsing (M-Pesa, bank alerts), todo integration, sticky note OCR, voice capture.

**Success metric:** Logging money feels effortless.

### 12.6 Phase 4 — AI Companion (4–8 weeks)

Goal: money feels supportive.

**Features:** Companion system, AI coaching, personalized guidance, tone adaptation (planner / minimalist / encourager).

**Success metric:** User feels emotionally supported.

### 12.7 Phase 5 — Investment OS (4–12 weeks)

Goal: organize wealth.

**Features:** Investment tracking, allocation view ("money split"), financial freedom screen, goal-linked investing.

**Success metric:** User sees long-term clarity.

### 12.8 Phase 6 — Admin Wealth Brain (6–12 weeks)

Goal: personal investment intelligence layer.

**Features:** Research dashboard (markets, bonds, stocks, MMFs, ETFs, macro signals), daily research summaries, opportunity tracking, risk dashboard (exposure, allocation, liquidity, concentration, cash runway).

**Success metric:** You feel organized.

### 12.9 Phase 7 — Assisted Money (Optional Future)

Goal: reduce effort.

**Rule:** Notice → explain → permission → confirm. Never silent automation. Always consent.

### 12.10 Phase 8 — Family Mode

Goal: teach money early.

**Features:** Child budgeting, allowance tracking, saving games, goal growth, family planning.

### 12.11 Phase 9 — Platform Ecosystem

Potential future: banks, mobile money providers, investment platforms, calendar sync, bill systems, market data, tax support.

**Only after:** trust is fully established.

### 12.12 Recommended Build Order

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

### 12.13 Solo Founder Rules

1. Ship ugly. Not perfect.
2. Build usefulness before beauty.
3. One feature at a time.
4. Avoid premature AI complexity.
5. Use libraries. Do not reinvent infrastructure.
6. Launch personal version first. You are user #1.
7. Solve your own pain. That becomes product truth.

---

## Part 13 — Founder Principles

### 13.0 Purpose of Founder Principles

Founder principles exist to protect the soul of Altradits. Because products drift.

Over time there will be pressure to: grow faster, monetize harder, add complexity, copy competitors, maximize engagement, optimize numbers.

Founder principles answer:
- "What do we refuse to become?"
- "How do we decide when things become hard?"

This document protects: trust, simplicity, care, clarity, human dignity, long-term thinking.

**Purpose:** Help future decisions feel obvious.

### 13.1 The Core Belief

Money should feel calmer, clearer, less lonely, less scary, more hopeful, more understandable.

Altradits exists because too many people face money alone. Spreadsheets do not comfort people. Statements do not teach behavior. Financial systems often punish confusion.

Altradits should help people feel: **"I can do this."**

### 13.2 The Founder Mission

Help people feel calmer, wiser, and more capable with money.

Not: maximize assets under management.
Not: increase screen time.
Not: create dependence.

Success means the user gradually needs less anxiety. Not more product.

### 13.3 The Product Promise

**Altradits promises:** clarity, calm, organization, guidance, gentle teaching, trust, future confidence.

**Never promises:** guaranteed wealth, quick riches, financial perfection, market prediction certainty.

**Rule:** Hopeful. Never deceptive.

### 13.4 The North Star Question

Every decision asks: "Does this make money feel easier?"

If unclear: do not ship.

### 13.5 Trust Over Growth

If forced to choose: choose trust. Always.

**Bad growth:** spam, fear, manipulation, attention addiction, confusing upsells.

**Good growth:** usefulness, word of mouth, clarity, love, trust, retention.

**Question:** Would a trusted friend recommend this?

### 13.6 Calm Over Excitement

Many apps optimize dopamine, urgency, stress. Altradits optimizes clarity, calm, confidence.

Goal: steady confidence. Not emotional volatility.

### 13.7 Teach Before Automating

Never remove understanding.

```
teach → assist → automate (optional)
```

User remains informed. Always.

### 13.8 People Over Metrics

**Bad metrics:** screen time, daily addiction, notification clicks.

**Good metrics:** lower anxiety, better habits, more planning, less regret, goal progress, clarity.

**Ask:** Did this genuinely help?

### 13.9 Small Steps Philosophy

Behavior change happens quietly.

**Celebrate:** one bedtime logoff, one saving moment, one thoughtful decision, one reduced impulse, one week of awareness.

**Avoid:** perfection pressure.

**Rule:** Tiny progress compounds.

### 13.10 Protect Dignity

Money shame destroys learning. Never shame.

| Bad | Good |
|---|---|
| "Overspending detected." | "Today felt fuller than expected." |
| "Poor financial discipline." | "Saving felt harder this week." |

**Rule:** Preserve dignity. Always.

### 13.11 Transparency Over Magic

AI should feel understandable.

**Bad:** mysterious recommendations.

**Good:** "Fridays usually feel fuller. Because: higher spending pattern, last 8 Fridays, salary distance."

Explain. Do not mystify. Trust grows through understanding.

### 13.12 Human Agency First

The user stays in control. Always.

Never: silent money movement. Never: forced investment. Never: hidden optimization.

```
notice → explain → permission → confirm
```

User agency > convenience.

### 13.13 Child-Simple Rule

If a child cannot understand it: simplify.

Complexity belongs in the backend. Simplicity belongs in the frontend.

### 13.14 Build for Real Life

People are busy, emotional, tired, messy, forgetful, human.

Build for: sticky notes, short texts, missed entries, late nights, salary delays, family obligations, messy behavior.

Not ideal behavior.

### 13.15 Consent Is Sacred

Every permission should feel clear.

**SMS access example:**
- Bad: "Allow permissions."
- Good: "Want help organizing money moments automatically?"

**Rule:** Explain benefit. Preserve control. Easy to revoke.

### 13.16 Financial Safety First

Before optimization: protect essentials.

**Priority order:**
1. Food, rent, water, electricity, transport
2. Cash buffer
3. Goals
4. Optimization

Example: protect water bill before investment increase.

### 13.17 Build for the Tired Version of the User

Assume: the user is exhausted, emotionally drained, busy, confused.

Every interaction should answer: "Can this be easier?"

- Bad: 12-step budgeting setup.
- Good: "What mattered today?"

### 13.18 Love Over Fear

Fear converts faster. Love lasts longer.

| Bad | Good |
|---|---|
| "You are falling behind." | "Tiny progress still counts. 🌱" |
| "Financial crisis warning." | "Things may feel slightly tighter next week." |

**Tone:** protective, calm, supportive.

### 13.19 Founder Decision Checklist

Before any feature:

- [ ] Does this reduce anxiety?
- [ ] Does this preserve dignity?
- [ ] Does this feel simple?
- [ ] Does this help tomorrow?
- [ ] Does this teach gently?
- [ ] Does this preserve agency?
- [ ] Would I recommend this to my younger self?
- [ ] Would this help a child learn money?
- [ ] Would this comfort someone tired?

If uncertain: **simplify.**

### 13.20 Founder Anti-Patterns

**Never become:**
- Casino investing app
- Attention machine
- Shame machine
- Finance bro product
- Complicated dashboard
- Fear marketer
- Hidden fee business
- Addiction loop
- Surveillance product

**Never sacrifice:** trust for growth.

### 13.21 The Founder Story

Why Altradits exists:

- Because money can feel lonely.
- Because spreadsheets can feel cold.
- Because growing wealth should not require panic.
- Because people deserve clarity.
- Because children should learn money gently.
- Because future-you deserves care.

**Founder reminder:** You are not building software. You are building calm financial companionship.

### 13.22 Founder North Star

When overwhelmed ask:

> **"What would make tomorrow easier for this person?"**

Then build only that.

Because simplicity compounds.
And trust compounds faster.

---

*Version 1.0 — Living Document — All rights reserved.*

*"Calm financial companionship." 🌱*
