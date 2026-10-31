# Deploying altradits.com

Merging a PR into `main` is the deploy. Within 5 minutes the server picks it up.

## How it works

- **Hosting:** HostAfrica Web_Starter (DirectAdmin). The site is a Node.js app
  (DirectAdmin → *Setup Node.js App*), app root `domains/altradits.com/public_html`,
  startup file `app.cjs`. Node serves the pages, Ye₿ente and the `/api/*` endpoints.
- **Deploy:** the GitHub Action on every push to `main`, and DirectAdmin cron every
  5 minutes as a backup, run [`deploy/cron.sh`](deploy/cron.sh): fetch `origin/main` →
  hard reset → `npm install` if `package*.json` changed → restart the app → ping `/healthz`.
  Cron line:
  ```
  */5 * * * * cd /home/altradit/domains/altradits.com/public_html && { [ -f deploy/cron.sh ] || { git fetch -q origin main && git reset -q --hard origin/main; }; } && sh deploy/cron.sh >> /home/altradit/deploy.log 2>&1
  ```
- **Never edit files on the server.** The reset discards them. Change the repo instead.
- **Data** (Ye₿ente wallets, the email log, the security log) lives in `DATA_DIR` outside the web root.
- **Email** goes out through the server's own mail (`EMAIL_TRANSPORT=sendmail`).
- **Daily jobs** (backup, clean-up) run inside the app after 06:00 UTC; hourly jobs
  (channel alerts, Ye₿ente solvency) once the node is connected.

## Configuration

Environment variables are set in *Setup Node.js App*, see [`.env.example`](.env.example).
After changing them, press **Restart** on the app.

## The Lightning node (LND)

The node makes the support page's invoices, runs Ye₿ente's wallets, and fills the
admin dashboard. The site needs:

| Setting | What it allows |
| --- | --- |
| `LND_REST_URL` (+ `LND_TLS_CERT` if self-signed) | Where the node's REST port is |
| `LND_INVOICE_MACAROON` | Make and look up invoices; can never move funds |
| `LND_READONLY_MACAROON` | Read block height, sync, peers and channels for the dashboard |
| `YEBENTE_LND_PAY_MACAROON` | Ye₿ente payments out (see [docs/yebente.md](docs/yebente.md)) |

```
lncli bakemacaroon invoices:read invoices:write   # prints the hex for LND_INVOICE_MACAROON
xxd -p -c 1000 ~/.lnd/data/chain/bitcoin/mainnet/readonly.macaroon   # LND_READONLY_MACAROON
base64 < ~/.lnd/tls.cert | tr -d '\n'               # only if self-signed: LND_TLS_CERT
```

The node's REST port (default 8080) must be reachable from the hosting server
(see [docs/manual-tunnel.md](docs/manual-tunnel.md)).

## The agency

The agents, marketing, CRM and sales pages moved to
[altradits/chouMi](https://github.com/altradits/chouMi) on 31 October 2026. On
its first start after that, the app archived their records to one owner-only
file in `DATA_DIR/archive` and removed them from the store (admin → System).

## Local development

```
npm install
npm run dev     # http://localhost:3000, admin password "dev"
npm test
```
