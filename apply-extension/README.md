# Altradits Apply (Chrome extension)

Applies to jobs from your Altradits dashboard **in your own Chrome**, using the
tabs and accounts you're already signed into. Click **🤖 Apply with AI** on a job
in *My job hunt*: the extension opens the job in a new tab, fills the
application with AI (your Applicant details, tailored CV and cover letter as
PDFs, screening answers), and shows a small Altradits panel on the page.

- It **asks you** when it needs something only you can do: an answer it doesn't
  know, a login or new account, an email check, or a CAPTCHA. It never guesses,
  never types passwords and never solves CAPTCHAs.
- When everything is filled it **stops for your review**. Press **✅ Submit for me**
  in the panel (or submit yourself and press Continue). The result is recorded in
  the dashboard.
- No API key in the browser: the AI runs on your Altradits server, and the
  extension uses the dashboard sign-in already in that tab.

## Install

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the folder `~/altradits/apply-extension`.
4. Open (or reload) `https://altradits.com/admin.html` → **My job hunt**. The
   Applications panel shows **🟢 Apply extension ready**.

It sits next to your other extensions (including Claude) and only acts on a tab
it opened for an application you started. To update it after a new version,
press the reload ↻ icon on its card in `chrome://extensions`.

## Develop

```bash
cd apply-extension && npm install && npm test   # end-to-end test in headless Chrome
```
