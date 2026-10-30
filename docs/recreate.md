# Recreate everything from scratch
Follow these steps in order to rebuild Altradits on new hosting, or to check the current setup. Secret values are never written in this document: only the names of the settings and where each comes from.

> Before anything else, keep this offline (printed or on an encrypted drive, not in email or chat): where the node's seed and wallet password are, who can reach the Mac, the DirectAdmin and GitHub logins, and the BACKUP_KEY. The QuadrigaCX collapse shows what happens when only one person can reach the keys.

## 1. The repository
- GitHub: altradits/altradits (private). Sole collaborator: altradits. 2FA on.
- Ruleset "Protect main": pull request required, no bypass. Recommended: make the "Tests and security checks" job required.
- Actions secret DEPLOY_SECRET (same value as on the server).
- Workflows: deploy.yml (calls /api/deploy on every push to main), test.yml (tests and dependency audits on every PR), marketing.yml (wakes the marketing team at post times), snake.yml (profile graphic).

## 2. Hosting (HostAfrica, DirectAdmin)
1. DirectAdmin → Setup Node.js App: Node 24, application root domains/altradits.com/public_html, startup file app.cjs, mode production.
2. Clone the repository into public_html (the deploy key must be read-only).
3. Keep the CloudLinux Passenger block at the top of .htaccess (it is in the repository so a reset never removes it).
4. Data folder: ~/altradits-data (created automatically, owner-only). Backups: ~/altradits-backups.
5. Cron (every 5 minutes):
```
# one line in DirectAdmin → Cron Jobs (split here only to fit the page):
*/5 * * * * cd /home/altradit/domains/altradits.com/public_html &&
  { [ -f deploy/cron.sh ] ||
    { git fetch -q origin main && git reset -q --hard origin/main; }; } &&
  sh deploy/cron.sh >> /home/altradit/deploy.log 2>&1
```
> nginx in front of Apache sends .html files straight from disk, without header rules. That is why every page carries its own security policy (deploy/page-csp.mjs). Apache does honour each folder's .htaccess deny file, which keeps server code private.

## 3. Settings (environment variables)
Set in Setup Node.js App, then press Restart. Names only:

**Core:** NODE_ENV=production, SITE_URL, ADMIN_TOKEN (openssl rand -hex 32), CRON_SECRET, DEPLOY_SECRET, IP_SALT, BACKUP_KEY, OWNER_EMAIL, OWNER_PHONE, DATA_DIR (optional), BACKUP_DIR (optional).

**Email:** EMAIL_TRANSPORT (sendmail or smtp), SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_REPLY_TO, EMAIL_BCC, EMAIL_APPROVAL, RESEND_API_KEY (optional), IMAP_HOST, IMAP_PORT, and one MAIL_<MAILBOX> per department mailbox read in the admin.

**AI:** ANTHROPIC_API_KEY, AGENT_MODEL, AGENT_WORKER_MODEL, AGENT_EFFORT, MARKETING_MODEL, WORKER_CALLS_PER_DAY, AI_RETRY_MINUTES, CHAT_ENABLED (chat is off unless 1).

**Lightning node:** LND_REST_URL (the tunnel's https address), LND_INVOICE_MACAROON (receive-only, hex), LND_TLS_CERT (base64 of tls.cert), CHAIN_APIS (optional explorers).

**Ye₿ente:** YEBENTE_WALLETS (on), YEBENTE_LND_PAY_MACAROON (sending key), YEBENTE_MAX_BALANCE_SATS, YEBENTE_MAX_PAYMENT_SATS, YEBENTE_DAILY_SEND_SATS, YEBENTE_RECOVERY_HOLD_SATS, YEBENTE_MPESA_BUY, YEBENTE_BUY_MAX_KES, YEBENTE_DAILY_BUY_KES, YEBENTE_BUY_SPREAD_PCT, YEBENTE_CALLBACK_SECRET, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_ENVIRONMENT.

**Social:** X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, LINKEDIN_TOKEN, LINKEDIN_PERSON_URN, LINKEDIN_ORG_ID, LINKEDIN_ORG_TOKEN, LINKEDIN_VERSION, FB_PAGE_TOKEN, FB_PAGE_ID, FB_GRAPH_VERSION, CALLMEBOT_APIKEY.

> Never set JOBS_ALLOW_LOCAL on the server (it is a test switch, and the code ignores it there anyway).

## 4. Email
1. DirectAdmin → E-mail Manager: create stan@altradits.com; forwarders for hello@, care@, orders@, social@, admin@, assistant@, tech@, finance@, trust@, marketing@, careers@, quality@.
2. DNS: SPF and DKIM enabled; add DMARC.
3. EMAIL_TRANSPORT=sendmail (or SMTP_* for the stan@ mailbox).

## 5. The Lightning node (Stanley's Mac)
Full steps: Manual: LND for a business, and Manual: connecting a website to your node. In short:
1. LND (lnddir ~/.lnd-altradits) with Tor, auto-unlock from a password file, REST on 127.0.0.1:8080.
2. Bake a receive-only macaroon for the website and a separate pay macaroon for Ye₿ente; keep readonly.macaroon for daily checks; delete admin.macaroon after any admin use.
3. ngrok tunnel with a reserved domain and a traffic policy that allows only the server's IPv4 address.
4. Set LND_REST_URL, LND_INVOICE_MACAROON, LND_TLS_CERT (and YEBENTE_LND_PAY_MACAROON) on the server; restart.
5. Open a channel with inbound liquidity (Magma or a trusted peer); check the admin Finance tab.

## 6. Ye₿ente
```
cd yebente
npm ci --ignore-scripts
npm run build      # writes yebente/app (committed; the server never builds)
```
Turn wallets on with YEBENTE_WALLETS=on only after the pay macaroon and limits are set.

## 7. Pages and checks before every merge
```
npm ci --ignore-scripts
node deploy/page-csp.mjs     # after editing any page's inline script
npm test                     # includes the build-stage security guard
```

## 8. Verify a fresh install
- https://altradits.com/healthz answers "ok".
- /api/yebente/health shows node: true when the tunnel and node are up.
- The admin signs in with ADMIN_TOKEN; the Finance tab shows the node and "receive only" for the website key.
- Stan → Security watch is quiet; Stan → Library opens every document.
- Test orders and payments only on a local copy (npm run dev), never on the live site.

## 9. Restore from a backup
```
BACKUP_KEY=... node deploy/restore-backup.mjs \
  ~/altradits-backups/db-YYYY-MM-DD.json.gz.enc > /tmp/db.json
```
Check the file, stop the app, copy it over ~/altradits-data/db.json, start the app.

## 10. Local development
```
npm install
npm run dev        # http://localhost:3000, admin token "dev"
npm test
```
