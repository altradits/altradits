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

**Safety**
Every page locks its scripts with a Content-Security-Policy and refuses frames;
every public endpoint is rate-limited; the admin needs a long token.
`test/build-security.test.mjs` keeps these in place.

**The agency** (agents, CRM, marketing, sales pages) lives in
[altradits/chouMi](https://github.com/altradits/chouMi).
