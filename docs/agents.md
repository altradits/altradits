# AI departments, Stan and the marketing team
Altradits runs on AI agents (Claude, through the Anthropic API) supervised by Stan's quality team and by Stanley. Freelancers can take any task an agent can't.

## Departments (data/playbooks.js)
Each department has a playbook (intake questions, delivery steps, quality checklist, tools, escalation rules) and an AI agent:
- Social & Content Agent: captions, posts, newsletters, blogs, graphics briefs, reels.
- Operations & Admin Agent: data entry, spreadsheets, SOPs, inboxes, invoices, receipts, hiring support.
- Personal Assistant Agent: bookings, trips, subscriptions, invitations.
- Sales & Customer Care Agent: reviews, outreach, reply templates, FAQs, listings, leads, research.
- Web, Automation & Bitcoin Agent: signatures, site fixes, automations, Lightning addresses, translations, transcripts. Builds secure by default (every page locks its scripts, every form is limited, nothing unlocked by a typed email).

## A task's life (lib/workers.js)
queued → working (the department agent, with web search and fetch, the playbook and the client's onboarding) → Stan's QA → review (client) → done when approved with 4-5 stars.
- The agent may ask the client one question (waiting_client) through the portal.
- Real-world steps an AI can't take (posting from client accounts, bookings, payments) go to Stanley.
- Anything with links, code, scripts or instructions aimed at the agents is held by the security screen (lib/screen.js) before any AI reads it; Stanley releases or cancels it.
- The queue runs every 2 minutes and on every new task or answer. A daily ceiling (WORKER_CALLS_PER_DAY) and the AI circuit breaker (lib/ai.js) stop runaway costs: when credit runs out, AI pauses and everything waits.

## Stan, Head of Quality (lib/qa.js, data/qa-experts.js)
1. Assign: Stan reads the brief and picks specialist QA experts by rules (no AI call): always the Reality Checker and Client Safety & Secrets, plus up to three more from 31 experts (copy, SEO, data, bookkeeping, legal, privacy, web app security, payments, Bitcoin and Lightning security and more). Each writes acceptance criteria for this brief.
2. Supervise: the department works with those criteria in its brief.
3. Review: each expert tests its own area item by item; failed areas go back for revision (up to 3 rounds, then to Stanley).
4. Decide: Stan makes the final decision and drafts the client message the department head sends.
Verdict rules include: default to fail until proven; any exposed secret fails; any security hole fails (no page policy, access on an unconfirmed email, an unlimited public endpoint, a payment refunded on an unclear answer).

## Learning (lib/learning.js)
Retrieves department rules, 5-star examples, client preferences and QA escapes; records outcomes (QA rounds, ratings, revisions, Stanley's edits); distils rules and client preferences; consolidates them on a daily cadence. The Stan tab shows the learning engine's state.

## Email and Stan's desk
- Department heads send external email from their own addresses (data/team-comms.js) with stan@ copied; Stan sends internal mail and payment confirmations (blind copy to altradits@gmail.com).
- Stanley instructs Stan in the admin; Stan routes to a department, drafts, reviews, and queues the email for Stanley's approval (lib/stan.js). External emails need approval except owner, payment and delivery notices.
- Department inboxes are read over IMAP, read-only (lib/inbox.js), with links and code flagged.

## Marketing team (lib/marketing.js, data/marketing.js)
- Plans the next 7 days: one master message a day, repurposed into native posts per channel slot, checked by the Brand Guardian, published at each slot (X, LinkedIn, Facebook page); other channels arrive as ready-to-paste drafts.
- Every post carries a letter of the weekly treasure hunt (#AltraditsHunt).
- Warm-up kits before each post (lib/warmup.js): Stanley engages from his personal accounts; nothing is posted automatically to strangers.
- The Community Manager (lib/responder.js) answers comments on the brand's own posts every 30 minutes, or hands sensitive ones to Stanley.

## Career tools (Stanley's own)
- Living CV (lib/career.js), job discovery and application packs (lib/jobs.js), and the Apply extension (apply-extension/, lib/apply.js), which fills forms in Stanley's browser and always waits for his approval before submitting.

## The chat (Altra)
The on-site chat (lib/agent.js, lib/agents.js) is off unless CHAT_ENABLED=1. When on, its misuse guard (lib/guard.js) pauses abusive or injected conversations behind a 100-sat Lightning payment, so abuse costs nothing in AI calls.
