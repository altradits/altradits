# Hackathon entry: the agency thinks with Meta Muse

One line: a real Bitcoin business in Kenya whose AI departments (drafting,
QA, reports, follow-ups) can now think with Meta Muse instead of only
Anthropic, behind the same budgets, power buttons and circuit breaker.

- Track: indie developer. Theme: Build for Your World.
- Built for the Meta Global AI Developer Hackathon, Oct 26 to Nov 4 2026.
- Repo: https://github.com/altradits/altradits (this project).
- Live site: https://altradits.com (the dashboard shows the active provider).
- Demo video: link added at submission time (3 minutes, recorded Nov 4).

## Why this fits

Stanley runs Altradits alone from Kenya: a Bitcoin Lightning wallet
(YeBente) plus an AI agency that drafts mail, reviews work and reports.
Every word those agents write used to come from one provider. This entry
plugs Meta's Model API in as a first-class brain: same agents, same tools,
same safety rails, now running on `muse-spark-1.3`. It is his own world
(money he holds, a business he runs), made cheaper per call and free of a
single provider.

## What Meta powers

With `AI_PROVIDER=meta` and a `META_MODEL_API_KEY`:

- Department agents (founder, tech, trust, finance and the rest) reason,
  use tools (`submit_deliverable`, `ask_client`, `escalate_to_owner`) and
  loop up to 8 turns, all on Muse.
- Stan drafts approval-queued emails through the `draft_emails` tool.
- QA verdicts and area reviews run through the same client.
- Spend is costed at Meta's list prices ($1.25 in / $4.25 out per million
  tokens, checked Nov 2026) against the unchanged daily, monthly and
  incident ceilings. Without the key, everything pauses cleanly as before.

Without Meta settings the server behaves exactly as before (Anthropic).

## How it works

- `lib/meta.js` (new): a small client speaking the codebase's Messages
  shape over Chat Completions (`POST {base}/chat/completions`). It
  translates system prompts, multi-turn tool conversations and tool
  definitions both ways, and drops Anthropic-only fields. Tool choice
  always rides as `auto` (all the API honours today). No new
  dependency: plain `fetch` with a 120 second cap.
- `lib/ai.js`: provider selection (`AI_PROVIDER`), key and model
  resolution, Muse cost math, provider-aware pause reasons, and one
  `createAiClient()` factory. Status now reports `provider` and `model`,
  which the dashboard shows.
- `lib/stan.js`, `lib/workers.js`: build their client through the factory;
  no agent logic changed.
- `demo/meta.mjs` (new): one command runs four beats against the live API
  in a throwaway folder: status names Meta, a department switches on, one
  instruction becomes queued drafts, spend is tracked.

## New work (all inside the event window)

This PR only, branch `hack/meta-agents`, committed Nov 4 2026:

- `lib/meta.js`, `test/meta.test.mjs` (10 tests), `demo/meta.mjs`,
  `docs/hackathon.md`, plus the provider edits in `lib/ai.js`,
  `lib/stan.js`, `lib/workers.js`, `assets/admin.js`, `.env.example`,
  `test/build-security.test.mjs` and this README pointer.
- Full suite green in CI; new tests run offline against a stubbed fetch.

## Run it

1. `npm ci --ignore-scripts`
2. `AI_PROVIDER=meta META_MODEL_API_KEY=<key> node demo/meta.mjs`
3. Success looks like: provider Meta, model `muse-spark-1.3`, one queued
   draft to `client@example.com`, spend of a fraction of a cent.

## Video shot list (3 minutes)

- 0:00 The problem in one sentence: one founder, one provider, every
  agent word rented from a single brain.
- 0:20 The dashboard: AI status names Meta muse-spark-1.3.
- 0:45 Terminal: the demo command, live: status, power on, instruction,
  queued draft, tracked spend.
- 2:00 The code: `lib/meta.js` translation and the unchanged guard.
- 2:30 What is next: Contributor tier for cheap drafts, Muse on the
  remaining checks, budgets already in place.

## Submission checklist

- [ ] Demo video recorded and linked above.
- [ ] This PR merged (signed merge, CI green).
- [ ] Submitted through the Cerebral Valley portal before Nov 4 9:00 PM ET.
- [ ] Track: indie. Theme: Build for Your World.
