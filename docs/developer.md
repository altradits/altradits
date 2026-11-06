# Altradits Developer (issue #421)

Other Bitcoin developers power their apps with Altradits' infrastructure:
LNURL-pay fronts, exact-amount invoice checks, settlement verification,
receipts and webhooks. Live at `/developer`, reference at
`/developer/reference`, dashboard at `/developer/dashboard`.

## Custody boundary (hard)

Altradits never receives, holds or forwards developers' customers' money.
A developer's customers pay straight to the developer's OWN Lightning
address or node. Altradits fronts it the way kTown fronts a merchant's
address: it fetches the invoice from their address, checks amount and
description hash, tracks settlement, and fires webhooks. No cut is taken
in flight.

The 0.5% is a service charge to the developer, prepaid in sats to
Stanley's node as a fee balance. The site's LND key stays receive-only:
the only node calls are creating invoices (ownership challenges,
top-ups) and reading their settlement. The admin macaroon is never read.

## How a payment flows

1. The developer registers their own Lightning address and proves it:
   the address resolves over LNURL-pay, its metadata names itself, and
   they pay a 1-sat challenge invoice from the wallet behind it.
   Honest scope: Lightning payments carry no sender identity, so the
   proof shows control of a funded wallet plus a self-naming address,
   not cryptographic ownership of the address.
2. Their app creates an invoice: `POST /api/dev/v1/invoices`
   (destination, sats or fiat). Altradits fetches the BOLT11 from
   their address, checks the exact amount and the description hash,
   and returns the invoice unchanged.
3. Their customer pays the invoice. The sats go straight to the
   developer's address.
4. Settlement: LUD-21 verify when the destination answers one
   (preimage kept); without it the invoice stays pending here and
   says so plainly. `invoice.settled` webhooks fire, signed.
5. The fee deducts from the prepaid balance: `ceil(sats / 200)`,
   minimum 1 sat. An empty balance refuses new invoices (402).

## Money in, money out

- Top-ups are the developer's own payments for the service, 100 sats
  minimum, invoiced from the node (`nodeOnly`). Customer money never
  enters the fee balance.
- Refund rule: credits are non-refundable, except on account close:
  unused live balance pays out to a verified destination within
  7 days. Test sats refund to nothing.
- Closing an account (manual, until the dashboard ships it): Stanley
  suspends the account in admin, reads the live balance from the
  statement, asks the developer for an invoice from a verified
  destination, pays it from the node, and records the payout. The
  ledger is never deleted.

## Sandbox

Test keys (`ak_test_...`) only serve the built-in simulator
(`dev@sandbox.altradits.com`), in-process: no network, no node.
Simulator invoices use signet encoding (`lntb...`), unpayable on
mainnet. Testing is free: a dry test balance auto-grants 10,000 test
sats, on the record. `POST /sandbox/settle` plays the customer.
The sandbox runs while mainnet is off.

## Switches and limits

- `DEVAPI=on` (default off; health always answers).
- `DEVAPI_SANDBOX=on` (may be on while mainnet is off).
- Per invoice: 1 to 100,000,000 sats. Per key: 100 invoices an hour.
  Per account: 2,000 invoices and 20 top-ups a day. Webhook retries:
  1m, 5m, 30m, 2h, 12h, then dead. Replay window: 5 minutes.
- Deadman lockdown freezes new top-ups only. Invoices, reads, settlement
  checks, top-up crediting and webhook retries continue.

## Files

- `lib/devapi.js`: accounts, keys, destinations, invoices, webhooks,
  fees, simulator. `api/dev.js`: `/api/dev/v1/*`.
- `docs/developer-openapi.json`: the OpenAPI 3.1 contract (spec version 1.4.0).
  The reference page restates it; `test/developer-pages.test.mjs`
  fails when a path is missing from either.
- `developer.html`, `developer-reference.html`,
  `developer-dashboard.html`: page, reference, dashboard.
- Tests: `test/developer-accounts.test.mjs`,
  `test/developer-invoices.test.mjs`, `test/developer-fees.test.mjs`,
  `test/developer-sandbox.test.mjs`, `test/developer-pages.test.mjs`,
  `test/developer-admin.test.mjs`.
- Admin: the Developer tab (`?view=developer`, `dev_suspend_key` action)
  shows accounts, settled volume, live fees earned, abuse flags
  (shortfalls, suspensions, guessing counts), and suspends keys.
