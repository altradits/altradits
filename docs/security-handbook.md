# Security handbook
How Altradits is defended, how the defences are kept from slipping, and what to do when something happens. The owner's rule: lose a feature rather than expose the system.

## Principles
1. Access only with proof: a secret token the owner already holds, or a confirmation link. A typed email, name or phone number proves nothing.
2. Money is final only on the node's own final word. Unclear answers hold the funds and are rechecked.
3. Nothing that costs us (node invoices, AI calls, emails, M-Pesa queries) is open without sign-in or a secret, and every public endpoint has per-visitor and site-wide limits.
4. Outside addresses are fetched only from the public internet, checked on the very IP connected to.
5. Every page locks its scripts and refuses frames; visitor text is always escaped.
6. Secrets live only in the host's settings: compared in constant time, never logged, never in code, pages, commits or chat.
7. Least privilege: receive-only key for the website, separate pay key for Ye₿ente, read-only key for daily checks.
8. Each fixed hole gets a test that fails on the old code.

## The defences, by layer
**Pages**
- A Content-Security-Policy meta tag in every page (deploy/page-csp.mjs): only our scripts, inline scripts pinned by hash, no other sites called, framed or posted to.
- A frame check in every page's script (clickjacking).
- /assets/report.js reports anything the lock blocks to the Security watch.
- Private pages (admin, portal, team, proposal, collect) are noindex; the admin's sign-in is rate-limited.

**API**
- Rate limits on every public endpoint (store hit counters); the admin allows 20 wrong tokens per connection per 15 minutes and alerts at 100 an hour site-wide.
- Tokens compared with safeEqual; tokens and ids never in logs.
- Request bodies capped (100 kB; 8 MB only with the admin token).
- Connections identified by a keyed hash (IP_SALT), never stored raw.

**Money**
- See Payments and Ye₿ente in this library: confirmations by amount, node-only receipts, single confirmation per order, ledger lock, credit once per reference, 21-million cap, payout refunds only on final answers, solvency check hourly.

**AI agents**
- The security screen holds links, code, scripts and instructions before any AI reads them (prompt injection, OWASP LLM01).
- Agents can't move money; payment addresses and "send funds" instructions are held.
- Content under review is data, not instructions (Stan's verdict rules).

**Server and deploy**
- Server-code folders each deny the web server (.htaccess); nginx refuses dot-folders.
- Deploys only hard-reset to origin/main; package installs run with --ignore-scripts; dependencies pinned to exact versions released at least two weeks earlier.
- HSTS, nosniff, Referrer-Policy and frame headers on API responses.

## The gates (build stage)
- test/build-security.test.mjs: page policies current, frame checks, the reporter present, no inline handlers, direct fetch() only to reviewed services, rate limits on every API file, no logged or ===-compared secrets, no Math.random on the server, payouts refunded only on FAILED, no merging records on an unconfirmed email, every folder denied or deliberately public, no committed secrets.
- test/security.test.mjs: replays of the audit's attacks.
- .github/workflows/test.yml: tests and dependency audits on every pull request; actions pinned by commit; read-only.
- .claude/agents/security-reviewer.md: the review agent with the hosting facts and these rules.

## The Security watch (admin → Stan)
Records, with technique, place, connection hash and advice: prompt injection, links or code in tasks, chat abuse, admin token guessing, webhook or secret forgery, rate-limit hits, server-side request forgery, blocked scripts, wallet PIN guessing, forged fingerprint approvals, invoice substitution, and custodial shortfall. High-severity techniques email Stanley at most once an hour each. The panel also lists Bitcoin's attack history with the guard for each.

## The audits (October 2026)
1. Portal takeover through an unconfirmed email on a new order: fixed (no merging; a note for Stanley instead).
2. Payout refunded on a tunnel error while the node might still pay: fixed (only FAILED or "never started" refunds; rechecks; no reconciliation of payments under 3 minutes old).
3. Sign-in-free node invoices and Daraja queries: turned off or put behind sign-in and limits.
4. Daily caps counting only the latest 200 entries; balance cap passable with several invoices: fixed.
5. DNS rebinding and missing private ranges in outside lookups: fixed (lib/netsafe.js).
6. Pages served without security headers: fixed with in-page policies and frame checks.

## In an incident
1. Contain: rotate the secret involved (ADMIN_TOKEN, DEPLOY_SECRET, CRON_SECRET, YEBENTE_CALLBACK_SECRET, a macaroon). For the node, bake new macaroons and delete the old root key's macaroons; for Ye₿ente, set YEBENTE_WALLETS=off to stop all wallet activity.
2. Look: Security watch, the admin email log, deploy.log and passenger.log on the server, the node's logs on the Mac.
3. Fix in the repository with a test that fails on the old code; merge; confirm the deploy.
4. Tell affected clients plainly what happened and what was done (care@).
5. Add the lesson to this handbook and, if it is a pattern, to the build guard.
