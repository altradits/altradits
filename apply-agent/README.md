# Altradits Apply Agent

Runs on your Mac. When you click **🤖 Apply with AI** on a job in the dashboard
(My job hunt), this agent opens Chrome, goes to the job, and fills the
application with AI from your **Applicant details** and the job's
**application pack** (tailored CV and cover letter as PDFs, screening answers).

It **pauses and asks you** when it needs something only you can do: an answer
it doesn't know, a login or new account, an email check, or a CAPTCHA. When
everything is filled it **stops for your review**: press **✅ Submit for me** in
the panel on the page (or submit yourself and press Continue). The result is
recorded in the dashboard.

## One-time setup

```bash
cd ~/altradits/apply-agent
npm install
mkdir -p ~/.altradits-apply
nano ~/.altradits-apply/config.env
```

Put these three lines in `config.env` (they stay on your Mac):

```
SITE_URL=https://altradits.com
ADMIN_TOKEN=<your dashboard password>
ANTHROPIC_API_KEY=<your Anthropic key>
```

Then `chmod 600 ~/.altradits-apply/config.env`.

## Run it

```bash
cd ~/altradits/apply-agent && npm start
```

Leave the window open. The dashboard shows **🟢 Apply Agent online** while it runs.
Chrome opens with its own profile (`~/.altradits-apply/chrome-profile`), so job
sites you log into there stay logged in. Generated PDFs are kept in
`~/.altradits-apply/documents/`.

## Notes

- It uses your installed Google Chrome; nothing large is downloaded.
- Each application costs some Claude usage (roughly a few cents to tens of
  cents depending on form length).
- Some job sites prohibit automated applications in their terms; the agent
  always leaves the final submit to you.
