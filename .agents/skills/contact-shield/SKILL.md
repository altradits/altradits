---
name: contact-shield
description: Security playbook for paid forms and inbound messages at Altradits.
---

# Contact Shield

Use when building or changing anything that accepts money or messages from
strangers: the contact form, future paid gates, and the inbox that serves
them. The incident history lives in `data/bitcoin-attacks.js`; every rule
below traces to a lesson there or to a known form-abuse vector. No em-dashes
in site copy, per house style.

## Paid gates

- Server-side verification only. Only the node's own lookup counts; fallback
  providers, client claims, and preimages pasted by users never open a gate.
  When the node cannot be reached, pause instead of accepting anything
  unverified.
- Fixed server-minted invoices. Amount, memo, and expiry come from the server;
  the client only picks the topic. Bind each submission to its quote record
  (hash inside and out) and expire quotes.
- Single use. Mark a quote spent inside a lock before storing anything, so a
  double submit cannot pass twice.
- Receipts never repeat. Mint from the never-resetting counter. Paid messages
  are payment records: cleanup may prune spent quotes, never messages.

## Inbound messages

- Screen every message with `lib/screen.js` before the team sees it. Links,
  code, scripts, secrets, and instructions aimed at our agents put it on hold:
  store with reasons, log to the Security watch, defang anything forwarded to
  Stanley, and block ack drafts from held text. A human decides held messages.
- Plain words stay free. Only flag `node` (and similar) when it runs
  something, never in Lightning prose like "fund node liquidity".
- Minimal data: name, email, topic, message. Nothing is stored before payment.
  Escape everything rendered in the dashboard; emails escape HTML by default.

## Replies and approvals

- Nothing goes back out without Stanley. Team replies queue as drafts for his
  approval in the dashboard. Transactional receipts are the one exception: proof
  of payment sends immediately, since it cannot wait for a queue.
- Held messages never enter AI context, drafts, or auto-replies.

## Rate limits and cleanup

- Layer per-IP and site-wide caps on quotes, payment checks, and submits, on
  top of the generic 429 watch. Daily cleanup prunes spent rate counters,
  expired quotes, and old archives in that order.

## Tests that must keep passing

- Paid and unpaid paths, single-use quotes, validation errors, hostile text
  held with reasons and logged, held ack refused, quotes pruned with messages
  kept. These run in CI on every pull request through `npm test`.
