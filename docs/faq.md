# Quick answers
Short answers to questions about the system, with where to look in the code.

## Running the business
**How does a change reach the live site?** Merge a pull request into main. The GitHub Action calls /api/deploy; the 5-minute cron is the backup (deploy/cron.sh). Never edit files on the server: the next deploy resets them.

**Where is the data?** ~/altradits-data/db.json on the server (lib/store.js), backed up daily, encrypted, to ~/altradits-backups (lib/backup.js).

**How do I change a price or a service?** data/catalog.js, then merge. Every page and agent reads it.

**Why didn't an email go out?** Admin → Emails or the email log: external emails wait for approval (EMAIL_APPROVAL), bounces are marked hourly (lib/bounces.js).

**Why is a task "held"?** The security screen found a link, code or instructions in it (lib/screen.js). Release or cancel it in Tasks; the Security watch shows the technique.

**The AI stopped working.** The circuit breaker paused it (credit or key problem). Admin shows the state; Resume rechecks (lib/ai.js).

## Payments
**A client says they paid but nothing happened.** Check the node (Finance tab). If it went to the backup Lightning address it is "held": move it to the node from Finance. If on-chain, it may be waiting for 3 or 6 confirmations because of its size.

**Why no receipt yet?** Receipts are only for money the node itself recorded (lib/finance.js).

**Can the website spend from the node?** No. Its key is receive-only (invoices, addresses and reads); the Finance tab confirms "receive only". Ye₿ente sending uses a separate pay key.

**A Ye₿ente payment is "pending".** The node gave no clear answer. It is rechecked automatically; the sats are held, never lost, and refunded only if the node says the payment never started.

## Security
**Where do I see attacks?** Admin → Stan → Security watch: every rejection by technique, with what to improve. High-severity ones also email you hourly at most.

**What stops a change from reopening a hole?** test/build-security.test.mjs and the CI job run on every pull request; .claude/agents/security-reviewer.md reviews changes.

**How do I rotate a secret?** Make a new one (openssl rand -hex 32), set it in Setup Node.js App (and in GitHub for DEPLOY_SECRET), Restart.

**Someone may have my admin token.** Rotate ADMIN_TOKEN at once; check the Security watch for admin token guessing and the email log for anything you didn't send.

## The node
**Is my node up to date?** Run deploy/node-check.sh on the Mac (read-only). See "Your node today" in the library.

**Which key do I use day to day?** readonly.macaroon (alias lncli-ro). Never leave admin.macaroon on disk after use.

**How do I add inbound liquidity?** Buy a channel (Magma) or ask a peer to open one; the Finance tab shows capacity and advice (lib/channels.js).

## Teaching
**Where is the talk script?** Library → Talks → Setting up Bitcoin Core. Every output in it was captured on the Mac's own build.

**Where is the whitepaper?** Library → Reference. It is the original PDF; its SHA-256 is b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553.
