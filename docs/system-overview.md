# System overview
Altradits (altradits.com) is a global virtual-assistant business run by Stanley Chege Thuita. Clients pick a fixed-price task, pay in Bitcoin, and the work is done by AI department agents and approved freelancers, checked by Stan's quality team before the client sees it. The same site hosts Ye₿ente, a Bitcoin wallet app with custodial Lightning wallets on Altradits' own node.

> Source of truth: the GitHub repository altradits/altradits (private). This document describes it as of 30 October 2026. Every PDF in the library is rebuilt from the repository each time it is opened.

## The pieces
**Website and API (one Node.js process)**
- server.mjs serves the pages and every /api/* endpoint; app.cjs starts it under Phusion Passenger on HostAfrica.
- Pages: index (home), va (all tasks), products (free kits), bitcoin (accept Bitcoin), donate, hunt (treasure hunt), cv (paywalled CV), join (team applications), collect (collect an order by its name), proposal, portal (client workspace), team (freelancer workspace), admin (Stanley's dashboard).
- Ye₿ente: a React app built into yebente/app and served at /yebente; its API is /api/yebente/*.

**Data**
- A key-value store (lib/store.js): a JSON file in ~/altradits-data on the server (Upstash Redis if configured). Writes are atomic and locked so several Passenger processes can share it.
- Daily encrypted backups (lib/backup.js) in ~/altradits-backups: 14 daily and 8 weekly copies.

**Money**
- Lightning invoices from Altradits' own LND node on Stanley's Mac, reached through an ngrok tunnel that only admits the server's IP. The website's key can only create and read invoices.
- On-chain addresses from the same node, one per order; confirmations scale with the amount.
- A backup Lightning address (Wallet of Satoshi) when the node is down: such payments are "held" until moved to the node; only then is a receipt issued.
- Ye₿ente wallets: balances in a ledger on the server, backed by the node's channels; sending uses a separate pay key.

**People and agents**
- Five departments, each with an AI agent and a playbook (data/playbooks.js): Social & Content, Operations & Admin, Personal Assistant, Sales & Customer Care, Web, Automation & Bitcoin.
- Stan, Head of Quality: splits every job across specialist QA experts (data/qa-experts.js), decides, and drafts the client message.
- The marketing team plans and publishes posts; the Community Manager answers comments on the brand's own posts.
- Freelancers apply, are approved by Stanley, and work from their team workspace.

**Operations**
- Deploy: merging to main triggers the GitHub Action, which calls /api/deploy; a DirectAdmin cron runs deploy/cron.sh every 5 minutes as backup.
- Timers inside the app: queue every 2 minutes, marketing every 5, hourly jobs (channels, held payments, bounces, solvency), daily jobs after 06:00 UTC (follow-ups, backup, clean-up, nurture, CV sync, job discovery, learning).

## How an order flows
1. A visitor presses a price button: POST /api/order creates a lead and an order (a proposal with a secret token) and gives it a memorable name like AMBER-FALCON-RIVER-MAPLE-7342.
2. POST /api/pay makes a Lightning invoice (and an on-chain address) for the amount due, with a QR.
3. The page polls GET /api/pay. When the node reports the invoice SETTLED (or the on-chain amount is deep enough), the order is confirmed exactly once (a lock prevents double confirmation).
4. The client is emailed (if they gave an email) with their portal link and receipt; Stanley gets one "Paid" email; the task is queued for its department.
5. The department agent works the task; Stan's QA panel tests it; the client reviews in the portal and approves (4-5 stars closes it) or asks for changes (14-day fix window, 30 for automation).

## How a Ye₿ente payment flows
1. A wallet is created with a 6-digit PIN; the server returns a device token and a 12-word recovery phrase (shown once).
2. Receiving: an invoice on the node for that wallet; credited once when the node reports it paid (also swept every 2 minutes).
3. Sending: to another handle (instant, inside the ledger), to a Lightning address or LNURL (resolved on the server through the public-address guard), or to an invoice (paid by the node with a fee reserve; refunded only on the node's final answer).

## Security in one paragraph
Every page locks its scripts with a Content-Security-Policy and refuses frames; every public endpoint is rate-limited; access needs a secret token or a confirmation link, never a typed email; outside links are fetched only from public addresses; money is final only on the node's own word; the security screen holds any task with links, code or instructions before an AI reads it; and the Security watch in Stan's tab records everything turned away. The build guard (test/build-security.test.mjs) and CI enforce these rules on every change. Details: the Security handbook.

## Where things live
- api/: one file per endpoint. lib/: the logic. data/: catalog, playbooks, experts, brand, marketing, attack history.
- deploy/: cron.sh (deploy), page-csp.mjs (page policies), restore-backup.mjs, node-check.sh (node health on the Mac).
- docs/: this library's sources (never served as files). test/: 180-odd tests; npm test runs them all.
- yebente/: the wallet app source (src) and its build (app).
- apply-extension/: Stanley's Chrome extension for job applications.
