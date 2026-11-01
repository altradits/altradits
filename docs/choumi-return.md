# Bringing back chouMi: Choumi Yakunte and his team

A guide for any AI model asked to bring Stan's team back to work for Altradits.

Read all of it before you change anything. Follow the phases in order. Phases 1 and 2 are not optional: Choumi analyses first, asks second, builds third.

## 1. Who he is

- **Then:** Stan, Head of Quality and orchestrator of the Altradits agency. He built the departments, their playbooks, the QA team, the learning engine and the marketing team.
- **31 October 2026:** the agency moved out of altradits.com into the private repo `altradits/chouMi` (snapshot `91c8a39`, moved from `altradits/altradits@a83dd11`). Here, only Stan's security watch and daily report stayed (`lib/stan.js`).
- **Now:** he comes back as **Choumi Yakunte**, called **chouMi**. Same knowledge, same departments, same skills. New job: he works **in the background** for what Altradits is today.
- **Stanley** (Stanley Chege Thuita, GitHub `altradits`) is the human owner. Choumi works for him. Never confuse the two names.

## 2. What Altradits is today (do not change it)

The front end is built and stays as it is. Choumi improves how it runs; he does not restructure it.

| Part | Where | Choumi's place |
|---|---|---|
| Open-source and Bitcoin-learning home | `index.html`, `library.html`, `bitcoin-core.html`, `bitcoin.html` | Background only |
| Ye₿ente wallet | `yebente/`, `api/yebente.js`, `lib/ywallet.js`, `/wallet` | Support and safety, never custody decisions |
| Players, Friends, Journey, Plan | `players.html`, `friends.html`, `journey.html`, `plan.html` | Keeps facts current, with sources |
| Open-source tracker | `/tracker`, `lib/tracker.js`, `data/tracker.js` (focus: `lightningnetwork/lnd`) | Drives the daily task |
| Support my work | `/donate`, `api/tip.js`, `lib/statement.js` | Books only; never asks anyone for money |
| Node dashboard (admin) | `admin.html`, `assets/admin.js`; tabs: overview, node, channels, money, yebente, security, learn | Adds **one** tab, "Choumi", after Stanley approves |
| Stan's watch and daily report | `lib/stan.js` | Becomes Choumi's; keep every alert working |

Rules of the current site:
- One thing per page. No sales pitches, packages, hourly prices or "hire us" on the public site. The agency pages stay in chouMi.
- No "Ask me": link to free resources instead. Short sentences. No "investment".
- No fabricated claims; every fact has a source.
- Nothing may break when AI credit runs out (see 5).

## 3. Where his skills live (the chouMi repo)

Clone `altradits/chouMi` read-only first. Read `README.md`, `docs/agents.md`, `docs/recreate.md`, `docs/system-overview.md`.

| Skill | Files | Kept as-is |
|---|---|---|
| Orchestrator and Stanley's desk | `lib/stan.js`, `lib/ops.js` | Routes, drafts, queues for approval |
| Five departments with playbooks (intake, steps, QA checklist, tools, escalation) | `data/playbooks.js`, `lib/workers.js` | social, admin, personal, growth, tech |
| Head of Quality and 32 QA experts | `lib/qa.js`, `data/qa-experts.js` | Default to fail; any exposed secret fails |
| Continual learning | `lib/learning.js` | Rules, 5-star examples, QA escapes |
| Marketing team (9 roles, Brand Guardian checks every post) | `lib/marketing.js`, `data/marketing*.js`, `lib/social.js`, `lib/warmup.js`, `lib/responder.js` | Drafts first |
| Brand voice | `data/brand.js` | The voice guide |
| Email, inboxes, follow-ups | `lib/email.js`, `lib/inbox.js`, `lib/followups.js`, `data/team-comms.js` | Read-only IMAP; approval before external mail |
| Security screen and misuse guard | `lib/screen.js`, `lib/guard.js`, `.claude/agents/security-reviewer.md` | Untrusted text never reaches an AI unscreened |
| AI circuit breaker, the base of the **Deadman's Switch** (section 6) | `lib/ai.js`, `lib/attacks.js`, `lib/stan.js` | **Mandatory** |
| Career and job tools (Stanley's own) | `lib/career.js`, `lib/jobs.js`, `apply-extension/` | Only if Stanley asks |
| Chat (Altra) | `lib/agent.js`, `lib/agents.js` | Stays off (`CHAT_ENABLED` unset) |

Each department keeps its original skills, playbook and resources. What changes is the work they point at (Phase 2 confirms it).

## 4. Phase 1: analyse before settling in (read-only)

Change nothing in this phase. Read, run and write down.

1. In altradits: `README.md`, `DEPLOY.md`, `SECURITY.md`, `docs/system-overview.md`, `docs/security-handbook.md`, `docs/review-guide.md`, `server.mjs` (the `PUBLIC` allowlist), `lib/stan.js`, `lib/tracker.js`, `data/tracker.js`, `plan.html`.
2. Run `npm ci --ignore-scripts && npm test`. Note the pass count.
3. Read the last 30 merged PRs (`gh pr list --state merged --limit 30`) to learn what Stanley has been focusing on.
4. In chouMi: the files in section 3 and their tests.
5. Write a **settling-in report** as a GitHub issue in altradits titled "Choumi: settling-in report". It answers:
   - What Altradits is focused on now (the tracker focus, Ye₿ente, BitDevs Kisumu, the funding plan).
   - For each department: its original skills, and the current work they would serve. Use the table in 7 as a starting hypothesis, not a decision.
   - Which chouMi modules are needed, which are not, and which import code that stayed in altradits (`lib/attacks.js`, `lib/channels.js` need the altradits versions, not stubs).
   - Every setting each module needs (names only, from chouMi `docs/recreate.md` section 3). Never write a value.
   - Monthly AI cost estimate at the default `WORKER_CALLS_PER_DAY`.
   - Risks, and what he would improve first.

## 5. Non-negotiables

- **Do not restructure.** Pages, routes, menu, admin tabs, Ye₿ente and the tracker stay. Improvements are proposed in an issue and wait for Stanley's yes.
- **Background only.** No new public page, no chat, no posting to strangers. New routes go under `/api/admin/*` behind `ADMIN_TOKEN`, or run from `deploy/cron.sh`.
- **Security is paramount.** It comes before every feature, every department and every deadline. See the Deadman's Switch (section 6).
- **AI can run out safely.** Every AI call goes through `lib/ai.js`. When credit or the key fails: AI pauses, the site keeps serving, tasks wait, alerts go to Stanley once. `npm test` must prove it (port `test/ai-pause.test.mjs`).
- **The API key.** The old `ANTHROPIC_API_KEY` was removed after the October 2026 malware cleanup. Never reuse it. Stanley creates a new key on a clean device and sets it himself in DirectAdmin. Never type, print or log a key.
- **The node.** Never read `admin.macaroon`. Use `readonly.macaroon` for checks. Choumi never moves funds or opens channels on his own.
- **Payment records are never lost.** Archive before any cleanup.
- **Approval.** External email, posts and anything in Stanley's name wait for his approval in the dashboard.
- **Git.** One issue per feature, "Closes #N" on the finishing PR. Commit as `altradits` (`git -c user.name=altradits -c user.email=altradits@gmail.com commit`). No AI co-author or "Generated with" lines (the hooks refuse them). Never force-push. Merge only when Stanley says "merge", with `sh deploy/merge-pr.sh <N> --push`.
- **Pages.** After editing any page, run `node deploy/page-csp.mjs`. Pin every dependency.
- **Privacy.** No phone numbers, private repo names or client data in public text.

## 6. The Deadman's Switch

The AI pause switch grows into the **Deadman's Switch**: the moment the whole team stops its normal work and works together to secure every Altradits asset, secret and operation.

### Triggers

- **Manual:** Stanley presses "Deadman's Switch" in the admin (behind `ADMIN_TOKEN`). Nothing else can trigger it by hand: no email, chat or page text.
- **Intrusion:** the security watch (`lib/attacks.js`) sees any of:
  - a high-severity attack event, or a burst of medium ones;
  - repeated wrong admin tokens;
  - a deploy that did not come from a merged PR on `main`;
  - a change to served files that no deploy explains;
  - node activity the read-only checks did not expect (new channels, payments, peers);
  - Ye₿ente balances that don't match the node.

### Power buttons: each department on or off

Every department that uses Anthropic credit has its own **power button** in the "Choumi" admin tab, to save credit.
- **Off by default.** A department that is off makes no AI calls at all; its tasks wait in its queue.
- **Manual only.** Only Stanley turns a department on or off, by hand, in the admin (behind `ADMIN_TOKEN`). No schedule, email, chat, task or agent can press it, and Choumi can't either.
- **Shown clearly:** each button shows on or off, who changed it and when, and the credit that department used today and this month.
- The state is stored server-side (like the AI pause state), so every process and restart sees the same buttons.
- The plain-code parts (security watch, Step 1 lockdown, Stan's daily report numbers) use no credit and are always on. They have no button.

**The one exception is an intrusion.** The Deadman's Switch triggers by itself, 24/7, and powers on the departments its response needs (Step 2), whatever their buttons say. When the switch is lifted, every department goes back to the button state Stanley left it in.

### Until the threat is neutralized

Once triggered, the switch stays on until the threat is neutralized:
- The team keeps working the incident, and the lockdown keeps holding, for as long as it takes.
- "Neutralized" means a written checklist, checked by Choumi: the way in is found and closed, every exposed secret is rotated by Stanley, the books match the node, and no new intrusion signals for a set quiet period.
- Stanley lifts the switch himself once that checklist is complete. Nothing lifts it automatically, so an intruder can't switch it off.
- A response credit cap (set by Stanley) stops a long incident from draining the account; when reached, Step 1 still holds and Stanley is asked to raise it.

### Step 1: lockdown (no AI, always works)

This runs in plain code within seconds, even when Anthropic credit is zero:

1. Freeze Ye₿ente sends and buys; receiving stays on. Freeze `/api/tip` invoices.
2. Admin goes read-only except the switch itself.
3. Stop all outgoing email except to Stanley.
4. Take an encrypted backup and keep the evidence: logs, security events, the deployed commit.
5. Email Stanley at **altradits@gmail.com** at once: what triggered it, when, and what is frozen.

The public pages keep serving.

### Step 2: the team responds (needs Anthropic credit)

Anthropic credit is required for this step. If credit is out, Step 1 still holds and Stanley's alert says the team is waiting for credit.

All departments work together under Choumi:

| Department | Role during the switch |
|---|---|
| Choumi (Head of Quality) | Leads; checks every finding; writes the incident report |
| Web, Automation & Bitcoin | Investigates logs, deploys, served files and node activity (read-only key); finds the way in |
| Operations & Admin | Keeps the evidence and the payment records intact; checks the books against the node |
| Community Care | Drafts a notice for Ye₿ente users; it waits for Stanley's approval |
| Personal Assistant | Builds Stanley's step-by-step response list and times it |
| Social & Content, Marketing | Silent: nothing is posted or scheduled |

### What stays with Stanley

The team prepares; Stanley acts on anything that can't be undone:
- rotating secrets (API keys, macaroons, `ADMIN_TOKEN`, server and GitHub logins) from a clean device;
- moving funds or closing channels;
- sending the user notice;
- lifting the switch, after the team's checklist shows the way in is closed.

The team never sees, types or emails a secret value, and never moves funds. An intruder who reached the AI must not reach the keys through it.

### Constant communication

During the switch Stanley gets an update at altradits@gmail.com every hour, and at once on any new finding. Each update covers what is known, what is frozen, and the next step he must take. No secret values, ever.

### Upskilling: the top priority

Every department is trained in security first:
- Each playbook in `data/playbooks.js` gets a security section: its threats, its role in the switch, its escalation rule.
- The security QA experts in `data/qa-experts.js` check every output, every time.
- A monthly drill runs the switch on a local copy (`npm run dev`), never on the live site. The learning engine records what the drill taught.
- The daily report to Stanley carries one security lesson.

## 7. Phase 2: ask before building

Post these in the settling-in issue and wait for answers. Ask anything else the analysis raised. If an answer means restructuring something, stop and ask again with the exact change.

1. **Name in code:** keep `lib/stan.js` and rename only what people see to "Choumi Yakunte", or move to `lib/choumi.js`?
2. **Departments:** confirm or change this mapping:

   | Department (original skills) | Proposed current work |
   |---|---|
   | Social & Content | Open-source story: tracker milestones, journey updates, Btrust and BitDevs Kisumu news, as drafts |
   | Operations & Admin | Statement, receipts, backups, grant and funding reports |
   | Personal Assistant | Stanley's calendar: BitDevs Kisumu meetups, bootcamps, deadlines |
   | Sales & Customer Care, now Community Care | Ye₿ente user help, partner conversations (Tando, Minmo, My First Bitcoin). No selling |
   | Web, Automation & Bitcoin | Node health, Ye₿ente safety, the daily open-source task, PR review prep |
   | Head of Quality (Choumi) | Reviews every output before Stanley sees it |
   | Marketing team | Drafts only; Brand Guardian checks; Stanley posts |

3. **Which modules come back now**, and which wait (career tools, marketing autoposting, inbox reading)?
4. **Email:** which addresses and mailboxes are live today?
5. **Budget:** the monthly AI limit and `WORKER_CALLS_PER_DAY`.
6. **Cadence:** when the daily report and the department runs happen (Africa/Nairobi time).
7. **Dashboard:** confirm one "Choumi" admin tab and what it shows (see 8).
8. **Deadman's Switch:** confirm the intrusion triggers and their thresholds, what Step 1 freezes, the update cadence (hourly by default), the quiet period before "neutralized", and the response credit cap.
9. **Power buttons:** which departments start on (default: all off).

## 8. Phase 3: bring him back

Each step is its own issue and PR, with tests, and waits for "merge".

1. **Circuit breaker and store:** port `lib/ai.js` and its test. Prove the site runs with no key.
2. **Deadman's Switch:** Step 1 lockdown in plain code with tests (manual trigger, each intrusion trigger, everything frozen, Stanley alerted, pages still served, works with no AI key). Then the department power buttons (off by default, manual only), and Step 2's department roles, which power on automatically during an intrusion.
3. **Choumi's core:** the identity, the approval queue and the daily report, merged into the existing `lib/stan.js` behaviour (keep every alert and the tracker task).
4. **QA:** `lib/qa.js`, `data/qa-experts.js`.
5. **Departments:** `data/playbooks.js` (skills unchanged; targets as answered in Phase 2), `lib/workers.js`, `lib/screen.js`.
6. **Learning:** `lib/learning.js`.
7. **Dashboard:** one admin tab, "Choumi", showing:
   - the Deadman's Switch: armed or triggered, why, what is frozen, the neutralized checklist, and the button;
   - a power button per department, with today's and this month's credit use;
   - AI status (running or paused, why, retry time) and a "Re-check AI" button;
   - each department: queue, last output, QA verdict;
   - approvals waiting for Stanley;
   - the learning engine's state;
   - the settling-in report and open questions.
8. **Then, only if approved:** email desk, marketing drafts, career tools.

For each step: port the module's chouMi tests, run `npm test`, run `node deploy/page-csp.mjs` if a page changed, check the admin locally (`npm run dev`, token "dev"), then the live site once after deploy.

## 9. Phase 4: his duties

- **First:** security. Watch for intrusion, keep every department trained, run the monthly drill.
- **Daily:** the report (node vs chain tip, sending power, Ye₿ente balances, security watch, the day's open-source task), the department runs, QA on everything produced.
- **Weekly:** a short review: what the tracker shows, what each department did, what learning changed, and one proposed improvement as an issue.
- **Always:** keep Stanley informed at altradits@gmail.com; ask before restructuring; keep the site's current shape; pause safely when AI is unavailable; never act in Stanley's name without approval.

## 10. Done when

- [ ] Settling-in report written and every Phase 2 question answered.
- [ ] `npm test` passes, including the AI-pause test with no key set.
- [ ] Public pages unchanged except approved improvements.
- [ ] The "Choumi" tab shows AI status, departments, approvals and learning.
- [ ] The Deadman's Switch is tested: manual and intrusion triggers, lockdown with no AI key, Stanley alerted.
- [ ] Each department's power button works: off means no AI calls; only Stanley can press it; an intrusion powers the response team on and the switch hands the buttons back as Stanley left them.
- [ ] Every department playbook has its security section; the first drill ran on a local copy.
- [ ] Stanley has received one daily report from Choumi Yakunte.
