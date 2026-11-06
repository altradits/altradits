# Deadman's Switch

The Deadman's Switch guards the money. It watches for signs of compromise
around the clock, in plain code with no AI dependency, and it freezes
money-out only when a threat is real. Stanley's own deploys and panel changes
never freeze anything.

## The three levels

Level 1, watch. One weak signal (server files differ from git HEAD outside a
deploy) opens a watch. The event lands in admin Security watch. Nothing
freezes. Nothing is emailed.

Level 2, confirm. The same signal is still there on the next check after any
deploy has finished, or a second independent signal agrees (an admin sign-in
from a new connection while the files differ). Stanley gets one email with the
exact evidence and a one-tap "this was me" link. Nothing freezes.

Level 3, freeze. Only a strong signal freezes, and only money-out:

- The node balance drops with no matching recorded payment.
- Server code changes to a commit that is not on origin/main, or not signed
  by an allowed key.
- A confirmed admin compromise: a sign-in from a new connection within an
  hour of a token-guessing burst.
- Stanley trips the switch by hand from /admin.

## What Stanley's own changes look like

The check recognises three expected changes and never punishes them.

1. A deploy of signed commits on origin/main. HEAD equal to the origin/main
   tip carries an allowed signature; a HEAD behind the tip is an old deploy
   with one pending. Legitimate either way.
2. The window while a deploy runs. deploy/cron.sh holds .deploy.lock and
   writes .deploy-marker.json with start and end. The file check defers while
   either is live. The balance check still runs: money movement never waits
   for a deploy.
3. DirectAdmin panel blocks in .htaccess. The CloudLinux PASSENGER and ENV
   VARS blocks are panel-managed. Changes inside them are ignored, provided
   every line is a benign Passenger, SetEnv, IfModule, or comment line (a
   variable saved empty is written as a bare `SetEnv NAME`, which is
   harmless). Anything else in .htaccess must match git HEAD.

## What freezes, and what never does

Frozen at level 3: Ye₿ente outbound sends, internal transfers, M-Pesa buys
(new quotes only; a prompt already on its way still settles), trivia payouts,
node top-ups, Developer API top-up creation, and non-security outbound email.

Always live, even at level 3: receiving (invoices, LNURL, Lightning
addresses, kTown, Kazi), balance viewing, wallet security emails (recovery,
sign-out, PIN reset, lock-out), owner alerts, and the whole public site.

## How a watch ends

- The signal clears on its own (the file returns to HEAD after a deploy). The
  watch closes. When level 2 already emailed, one short all-clear follows.
- Stanley taps "this was me" (the email link, or the button in /admin). The
  link works once and dies after 24 hours. /admin always works.
- The signal proves strong. The watch history keeps the escalation, and the
  freeze follows the checklist below.

A watch that Stanley acknowledged but that persists re-opens: his answer did
not match reality, so he hears again.

## How a freeze lifts

Only Stanley lifts, from /admin, after all 5 checklist items hold:

1. The attack has stopped: no new intrusion signs for 15 minutes.
2. Node balances and Ye₿ente wallet records reconciled.
3. Encrypted forensic backup saved.
4. Exposed secrets rotated from a clean device.
5. Stanley confirms the way in is found and closed.

A forced lift (checklist incomplete, written note required) is recorded as
forced. /admin shows the evidence and the likely cause in plain words.

## Runbook

Level 1 arrives in Security watch. No action. It usually clears at the next
deploy. When it does not clear within an hour, read the detail: a file name
outside .htaccess deserves a look at git status on the server.

Level 2 arrives by email. When the change was yours, tap the link. When it
was not, do not tap. Open /admin, read the Security watch, and check git
status and git log on the server. When the change looks hostile, trip the
switch by hand.

Level 3 arrives by email and freezes money-out. Work the checklist:

- Balance drop: inspect LND payments, peers, and on-chain transactions with
  readonly.macaroon only. Record every legitimate owner action with
  node_action_record so the next check knows it was authorised. Never move
  funds to investigate.
- Unsigned or non-main code: inspect git status and git diff on the server,
  restore clean origin/main with a fresh deploy, and rotate secrets when any
  server code was altered.
- Admin compromise: rotate ADMIN_TOKEN in DirectAdmin first (openssl rand
  -hex 32), then Save and Restart the app, before lifting.

After lifting, watch the next two checks: a signal that persists re-opens a
watch, which is correct.

## Threat model notes

The file check catches opportunistic tampering (panel edits, malware,
mistakes), pushed-but-unsigned code, and local commits that diverge from
origin/main. It does not stop an attacker with full server shell access who
also rewrites git history and the trusted keys: no on-server check can. The
backstop then is the balance signal (live LND readings, which the attacker
cannot fake without node access) and Stanley's own eyes on the checks.

A persistent uncommitted file change alone never freezes. That is deliberate:
freezing the money path on an uncorroborated file diff stopped real business
twice in one day. The level-2 email lands within about 10 minutes, and any
actual theft freezes at once through the balance signal.
