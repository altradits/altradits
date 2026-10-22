# Deploying altradits.com

Merging a PR into `main` is the deploy. Within 5 minutes the server picks it up.

## How it works

- **Hosting:** HostAfrica Web_Starter (DirectAdmin). The site is a Node.js app
  (DirectAdmin → *Setup Node.js App*), app root `domains/altradits.com/public_html`,
  startup file `app.cjs`. Node serves the pages and the `/api/*` agent endpoints.
- **Deploy:** DirectAdmin cron, every 5 minutes, runs [`deploy/cron.sh`](deploy/cron.sh):
  fetch `origin/main` → hard reset → `npm install` if `package*.json` changed →
  restart the app (`tmp/restart.txt`) → ping `/healthz`.
  Cron line:
  ```
  */5 * * * * cd /home/altradit/domains/altradits.com/public_html && { [ -f deploy/cron.sh ] || { git fetch -q origin main && git reset -q --hard origin/main; }; } && sh deploy/cron.sh >> /home/altradit/deploy.log 2>&1
  ```
- **Never edit files on the server.** The reset discards them. Change the repo instead.
- **Data** (leads, proposals, email log) lives in `DATA_DIR` outside the web root.
- **Email** goes out through the server's own mail (`EMAIL_TRANSPORT=sendmail`).
- **Daily follow-ups** run inside the app once a day after 06:00 UTC.

## Configuration

Environment variables are set in *Setup Node.js App*, see [`.env.example`](.env.example).
After changing them, press **Restart** on the app.

Business settings (prices, services, payment details, booking link, approval
limits) live in [`data/catalog.js`](data/catalog.js) and deploy like any other change.

## Lightning payments (LND)

Proposal pages show a "Pay with Bitcoin Lightning" QR for the exact amount due
(USD converted at the live BTC price). Two modes:

| Mode | Set up | Payment confirmation |
| --- | --- | --- |
| Lightning address (default) | `PAYMENTS.lightningAddress` in `data/catalog.js` | You confirm in the dashboard |
| **LND node** | `LND_REST_URL`, `LND_INVOICE_MACAROON` (+ `LND_TLS_CERT` if self-signed) | Automatic: client is activated, kick-off email sent, you get one "Paid ⚡" email |

The site only needs an **invoice macaroon**: it can create and look up invoices but
can never move funds. On your node:

```
lncli bakemacaroon invoices:read invoices:write   # prints the hex for LND_INVOICE_MACAROON
base64 < ~/.lnd/tls.cert | tr -d '\n'               # only if self-signed: LND_TLS_CERT
```

The node's REST port (default 8080) must be reachable from the hosting server
(e.g. a hosted node such as Voltage, or your own node behind a domain). Add the
variables in *Setup Node.js App*, then Restart. The dashboard's System panel
shows which mode is active.

## Local development

```
npm install
npm run dev     # http://localhost:3000, admin password "dev"
npm test
```
