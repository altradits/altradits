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

## Local development

```
npm install
npm run dev     # http://localhost:3000, admin password "dev"
npm test
```
