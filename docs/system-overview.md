# System overview

altradits.com is Stanley Chege Thuita's open-source Bitcoin home: free tools, a free
library, and his journey towards full-time open-source work. Nothing is sold.

**Pages**
- `/` home and Ye₿ente manual · `/yebente` the wallet app · `/library` free resources in reading order
- `/bitcoin-core` setup guide · `/bitcoin` learning in Kisumu · `/players` people and projects to learn from
- `/journey` contributions and the Btrust starter-grant bar · `/donate` support in sats · `/admin` node dashboard

**Server** (`server.mjs`, one Node process)
- `api/yebente.js` Ye₿ente wallets · `api/tip.js` support invoices · `api/admin.js` the dashboard
- `api/report.js` blocked-script reports · `api/deploy.js` deploy trigger
- Timers: Ye₿ente settlement every 2 minutes; hourly channel alerts and solvency; daily backup and clean-up.

**Node**
LND, on Stanley's machine, reached through a tunnel. Invoices, wallets and the
dashboard all use it. See `docs/manual-lnd.md` and `docs/manual-tunnel.md`.

**Stan** (`lib/stan.js`)
Stan stayed for security and communication. He keeps the security watch,
emails Stanley every alert, and sends a short report each morning: the node
against the chain tip, sending power, Ye₿ente's balances, and what was turned
away. Admin → "Email me Stan's report now" sends one on demand.

**Email: every message comes from its department** (`lib/email.js`, `data/team-comms.js`)
Owner alerts to Stanley carry the From name, Reply-To and signature of the
department they belong to. Combined reports still come from Stan.

| Email | From | Why |
|---|---|---|
| Deadman's Switch trip, all-clear, hourly update | Trust and Safety | A security incident. Trust owns incident coordination |
| Security watch (high severity only) | Trust and Safety | Attacks and abuse the site turned away |
| Security hold forward | Trust and Safety | A screened threat. Trust holds it until Stanley decides |
| Many wrong admin tokens | Trust and Safety | A credential guessing burst |
| Lightning channel alerts | Web, Automation and Bitcoin | Node health |
| Bounce digest | Web, Automation and Bitcoin | Mail sending health |
| Task needs you, AI agent error | The task's department | The department that owns the task, or whose agent failed |
| Task handover or question to Stanley | The task's department | The department doing the work |
| Unhappy rating | The task's department | About that department's work |
| Contact notice | The routed department | The department the message went to |
| Approved draft addressed to Stanley | The drafting department | The department that wrote it |
| Daily report, overdue digest, weekly learning digest | Stan (unchanged) | Combined cross-department reports from Choumi |
| Receipts | Finance (unchanged) | Money, only after the node confirms |
| Reply rejections, approved external drafts | Owning department (unchanged) | Already department-sent |
| Wallet mail (codes, recovery, security) | Altradits (unchanged) | To wallet owners, not to Stanley |

Delivery. Every department sends through the same transport as receipts do
today (the server's sendmail by default, SMTP or Resend if set). Each From is
an @altradits.com address, so SPF, DKIM and DMARC work as they do for
receipts. No address was invented for this. Reply-To is the sending
department's address, except contact notices, which answer to the visitor.
During a Deadman's Switch lockdown, owner alerts and wallet security notices
still go out. Everything else is held, as before.

Mailboxes. Each sending address must be a real mailbox (or forwarder), or its
replies bounce: hello, stan, trust, tech, social, admin, assistant, care,
orders, finance, marketing (all @altradits.com). The bounce watch reads each
one it has a password for (`MAIL_<LOCAL>`, for example `MAIL_TRUST`). Never
log or print a mailbox password. Quality and careers never send.

No AI in the path. Sender, subject, body and signature are chosen in plain
code at the call site. Mail sends identically with no AI key, with AI paused,
with budgets exhausted, or with the department's power button off. Power
buttons gate AI calls only, never email.

**Safety**
Every page locks its scripts with a Content-Security-Policy and refuses frames;
every public endpoint is rate-limited; the admin needs a long token.
`test/build-security.test.mjs` keeps these in place.

**The agency** (agents, CRM, marketing, sales pages) lives in
[altradits/chouMi](https://github.com/altradits/chouMi).
