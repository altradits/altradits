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

## Operations (running without Stanley)

- **Departments & playbooks:** `data/playbooks.js`. Each department's intake questions, delivery steps, quality checklist, tools and escalation rules. Edit and merge to update everywhere.
- **Team:** freelancers apply at `/join.html`; approve them in the dashboard's **Team** tab. Approved members get a private workspace link (`/team.html?m=…`).
- **Client portal:** sent in the kick-off email after payment (`/portal.html?c=…`): onboarding, task requests, approvals, hours meter, referral link.
- **Routing:** each task is matched to a department, estimated, and assigned to the least-busy approved member with spare weekly hours. Stanley is emailed only when nobody has capacity, or (daily) when work is overdue.
- **Referrals:** `RULES.referralCreditPct` in `data/catalog.js` (default 10% of the new client's first month as credit).
- **Growth tab:** outreach templates and a daily outreach counter in the dashboard.

## AI department agents and task workflow

With `ANTHROPIC_API_KEY` set, every client task goes to its department's AI agent (`data/playbooks.js` → `agent`):
queued → agent works (web search/fetch, playbook, client onboarding) → Quality Reviewer → client review →
approved and rated 4–5★ = **done**. The agent may ask the client one question (portal), and anything needing
real-world steps, failing QA three times, or rated ≤3★ comes to Stanley (`owner` / `follow_up`).
The queue runs inside the app (`lib/workers.js`), every 2 minutes and on every new task or answer.

## Altra misuse guard

`lib/guard.js`. Prompt-injection, abuse, spam, repetition, bot-speed and endless no-progress chats (plus anything
Altra flags with `flag_misuse`) pause the chat behind a `RULES.humanCheckSats` (100) sat Lightning invoice from the
node. While paused no AI is called; paying reopens the chat automatically. `RULES.maxAiTurnsPerDay` caps AI chat
turns per day. Tunables live in `data/catalog.js` → `RULES`.

## Apply with AI (Chrome extension)

`apply-extension/` is a Chrome extension Stanley loads in his own browser (see its README).
**🤖 Apply with AI** in *My job hunt* hands the job to the extension, which opens it in a new
tab, fills the form with AI, asks Stanley in an on-page panel when it needs him (unknown
answers, logins, CAPTCHAs) and waits for his approval before the final submit. The AI steps,
PDFs and progress run through the server (`lib/apply.js`, `lib/pdf.js`), so no API key lives
in the browser. **Fill from my CV** proposes the Applicant details from his uploaded CV.

## Local development

```
npm install
npm run dev     # http://localhost:3000, admin password "dev"
npm test
```

## Marketing team: connecting the social accounts

The marketing team (admin → Marketing) plans posts daily at 05:00 UTC and publishes each at its slot. Accounts without keys get their posts in your daily "Ready to post" email instead, so nothing is lost while you set these up. Add the values as environment variables in DirectAdmin → Setup Node.js App, then restart the app.

| Account | Variables | Where to get them |
|---|---|---|
| X @altradits | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | developer.x.com → your app → Keys and tokens. Set app permissions to **Read and write** *before* generating the access token. X bills per post (about $0.015 each; posts have no links to avoid the higher link price). |
| LinkedIn · Stanley | `LINKEDIN_TOKEN` (optional `LINKEDIN_PERSON_URN`) | linkedin.com/developers → create an app → add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** → OAuth token generator with scopes `openid profile w_member_social`. Expires after about 60 days: the team emails you when a post fails so you can renew it. |
| LinkedIn · Altradits page | `LINKEDIN_ORG_ID` (+ `LINKEDIN_ORG_TOKEN` if different) | The number in your company page admin URL. Needs the **Community Management API** product (LinkedIn reviews the request) and scope `w_organization_social`. |
| Facebook · Altradits page | `FB_PAGE_TOKEN` (optional `FB_PAGE_ID`, default 61579168157529) | developers.facebook.com → app → Graph API Explorer → Page access token with `pages_manage_posts`, `pages_read_engagement`; exchange for a long-lived token. |
| Facebook · Stanley, TikTok (@altradits and Stanley's @5tan_lee), Instagram (@altradits) | none | Meta doesn't allow posting to personal profiles by API, and TikTok needs a video file: these always arrive as ready-to-paste drafts. |

Optional: `LINKEDIN_VERSION` (default 202608), `FB_GRAPH_VERSION` (default v25.0), `MARKETING_MODEL`. The GitHub Action "Wake the marketing team" pings the site at each slot because the host idles the app.

### Scheduler, repurposing and the treasure hunt

- The team keeps the **next 7 days** scheduled: one master message a day, repurposed into a native post per account slot (admin → Marketing → Scheduler shows each post as it will look on its platform). Posts for unconnected accounts stay scheduled; once you add an account's keys, its queued posts go out on time with nothing else to do.
- **Master content**: write a brief (or leave it empty), press *Create master*, then *Repurpose & schedule* onto any day (1–3 days). Slots already posted are kept; scheduled ones are replaced. Edit or cancel any post before it goes out; a day you change is left alone by the auto-planner.
- **Treasure hunt** (altradits.com/hunt): every post ends with the fixed branded hashtag `#AltraditsHunt` and one letter of the week's word; winners who opt in (X handle or first name) are congratulated in the next post that goes out (tagged on X) (words and coupon % in `data/marketing.js` → `HUNT`). Solvers get a personal share link; the coupon (default 10% off one order, 30-day expiry) unlocks when someone else opens it, and is spent when the order is paid. Customers enter it under "Have a hunt code?" at checkout.

### Replies: Altradits answers, you engage

Altradits never comments elsewhere, likes, follows or starts conversations; that's you, from your personal accounts (the LinkedIn "link in first comment" is posted by your personal profile too). Every 30 minutes the Community Manager reads new comments on the brand's own posts and mentions of @altradits, then replies, sends sensitive ones to your inbox (complaints, payments, refunds, legal, anything unsure), or ignores spam. Turn it off in admin → Marketing → Replies. Extra permissions it needs:

- **Facebook Page token:** also `pages_read_user_content` and `pages_manage_engagement`.
- **LinkedIn company page:** also `r_organization_social` (part of the Community Management API).
- **X:** no extra keys; reading mentions is billed per request under X's pay-per-use plan (a few cents a day at this volume).

### Warm-up kits: you engage before each post drops

Every scheduled post comes with a warm-up kit written by the team: search terms and hashtags for its topic, and 3–5 comments (entertaining, educational or a genuine question) you can leave on other people's posts. About 15 minutes before the post drops you get a "Warm up now" email and the kit appears under admin → Marketing → Engage now. On X it also finds real recent posts on the topic and drafts a reply to each, with a link that opens X with the reply filled in. Nothing is posted for you: X's automation rules ban automated replies to posts found by keyword search, and LinkedIn, Facebook and TikTok offer no API for it. Kit comments never pitch, link, quote prices or name Altradits. The reminder emails can be turned off in the admin.

## Free kits and the mailing list

altradits.com/templates.html offers six free, complete kits (data/templates.js): inbox, social media, invoicing, customer replies, cold outreach and hiring. A visitor leaves an email to download one (PDF guide, plus a spreadsheet where it helps). They join the list tagged with that kit, become a lead in the CRM, and get three follow-ups over ten days (lib/subscribers.js): a tip plus "do it together" (pay-as-you-go hours), then the matching "done for you" quick job, then the monthly service. One email a day at most, one-click unsubscribe in every email, consent wording stored with each sign-up. See subscribers and export a CSV in admin → Growth. Emails go out through the same mail setup as the rest of the site (EMAIL_TRANSPORT / SMTP_*).

## Email addresses, letterhead and BCC

All email now goes out from **stan@altradits.com** or a department address (data/team-comms.js; see admin → Team → Department directory), with a blind copy to altradits@gmail.com (`EMAIL_BCC`, set to `none` to stop it). Emails carry the Altradits letterhead (logo, contact line, sender signature) and the kit PDFs carry it too.

Set up in DirectAdmin → E-mail Manager (one time):
1. Create the mailbox **stan@altradits.com** (or a forwarder to altradits@gmail.com).
2. Create forwarders to stan@altradits.com (or altradits@gmail.com) for: social@, admin@, assistant@, care@, tech@, orders@, marketing@, careers@, quality@, so replies to any department reach you.
3. In DNS management, check SPF and DKIM are enabled for altradits.com, so mail from these addresses isn't marked as spam.
4. Keep `EMAIL_TRANSPORT=sendmail` (or SMTP_* for the stan@ mailbox) in Setup Node.js App.
