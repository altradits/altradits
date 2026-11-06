# kTown

kTown gives a Kisumu merchant "pay in sats" with nothing to learn and no hardware to buy. The merchant signs up with their M-Pesa number, prints one QR, and sticks it on the counter. A customer with any Lightning wallet scans it, can edit the amount, sees exactly how many shillings the merchant will receive, pays in sats, and the merchant gets KES in M-Pesa.

kTown never holds money and is not a wallet. It is a thin LNURL-pay front for the merchant's Tando address (2547XXXXXXXX@bitcoin.co.ke). The sats go straight to Tando, and Tando converts them to M-Pesa for a 1% fee.

## Tando's API (checked live with read-only GET, Nov 2026)

Docs: https://bitcoin.co.ke/send-money-to-kenya/docs/developer-api.html

- `GET /.well-known/lnurlp/<254..>` answers payRequest with LUD-21 `currency` {code KES, minSendable 15, maxSendable 50000, multiplier in msat per KES}. Only Safaricom ranges resolve (7xx, 11x, 14x).
- `GET <callback>?amount=<KES>&currency=KES` returns an invoice that delivers exactly that many shillings. The payer covers the 1% on top. Without `currency` the amount is millisats and the invoice matches it exactly, and the fee comes out of the delivered shillings.
- Fees and rounding (docs, "Fees and rounding"): the 1% lands on top in KES mode and inside the delivery in sats mode. The M-Pesa payout is floored to a whole shilling. Wallets without currency support, or built strictly to the newer unmerged drafts, fall back to paying in sats, which lands about 1% short of their own conversion.
- `GET /api/payment/<hash>` answers `{success, transaction}` with status (pending, received, completed, failed), isPaid, paymentNetworkReceipt (the M-Pesa code), payToAccount, merchantName (the M-Pesa registered name), currencyAmountSent and the sats figures. A payment counts as settled only when status is completed, isPaid is true and the M-Pesa code is present. Unknown hashes get 404.
- A number its owner claimed points at their own bitcoin wallet instead of M-Pesa. kTown refuses those at registration: without KES terms there is no M-Pesa delivery to promise.

## The server (PR 1)

- `lib/ktown.js`: merchants, sessions, the Tando calls, LNURL answers, history. `api/ktown.js`: the routes. Store keys are listed at the top of lib/ktown.js. Switched on with `KTOWN=on`.
- Registration proves the number works by reading its Tando LNURL. Receiving starts at once: money can only flow to the registered M-Pesa number, so an early QR risks nothing.
- Identity is a 6-digit PIN (patterns refused, 5 wrong tries lock logins for 15 minutes) plus a year-long session per shop phone. Whoever holds the session may change that merchant's settings; a merchant can only ever change their own. A signed-in phone sets a new PIN without the old one. A lost phone with a forgotten PIN needs Stanley to release the record (`ktown_release`, below), then the merchant signs up again, unless the registration is still unclaimed, stale and unpaid, in which case signing up again takes it over by itself. kTown holds no money, so nothing is at risk meanwhile.
- LNURL: `GET /.well-known/lnurlp/k-<id>` (and `/api/ktown/lnurlp/<id>`) answers payRequest with the shop name and M-Pesa name, Tando's msat limits and the KES currency terms. The callback asks Tando for an invoice for exactly that amount and returns it unchanged.
- Two payer paths, one promise. The pay page always prices in KES, so the merchant receives exactly the quoted shillings. A wallet scanning the printed QR directly uses KES mode when it speaks LUD-21 and plain sats otherwise; in sats mode LNURL-pay requires the invoice to equal the asked millisats, so the 1% cannot be added there and lands inside the delivery instead. kTown never grosses up: in KES mode that would overcharge the payer, in sats mode it would break the protocol. What lands short is named instead (see History).
- Amount checks: in KES mode Tando's `converted` must equal the asked shillings and the invoice sats must sit inside a narrow band (the 1% plus drift and rounding); in msat mode the invoice must match the millisats exactly. Anything else is refused and recorded in the Security watch.
- History records only the merchant's own facts: amount, shillings expected and received, which path priced it, the rate, the payer's fee, payment hash, M-Pesa code, time. Nothing about who paid is asked for, read or stored. One record per payment hash; a repeat confirmation changes nothing. Payment records are never pruned. A shortfall is never hidden: quoted vs received shows in History whenever they differ.
- Name verification: the typed M-Pesa name shows from the start as the name the customer will see. It is marked verified once a receipt for that merchant's number carries the same registered name.
- Receipts: `GET /api/ktown/receipt/<hash>` answers only for hashes kTown itself recorded. Anything else gets 404 without Tando ever being asked, so no stranger's payment can be looked up here. The registered name is returned (and kept in history) only when it matches the merchant: a wrong guess learns nothing. A payment started before a takeover still reports its status afterwards, but names no name.

## Who owns a number

Anyone can type any M-Pesa number at sign-up, so a squatter could register someone else's number and lock the real owner out with "already registered". Payments would still land with the true owner (money only ever flows to the registered number), but the owner could not sign up. There is no SMS gateway and Altradits sends no money, so ownership is proven another way:

- A registration starts unclaimed. The first receipt whose number and registered name both match the typed ones claims it. Claiming sticks: renaming later unchecks the name, never the proven number.
- A registration that is still unclaimed after 48 hours, with no paid receipt, can be taken over by signing up again for the same number. The old record goes (its sessions and its QR end with it); its payment entries stay in the store, kept, never deleted.
- Anything showing liveness holds the number: a claim, or money that landed. A working till whose name never matched (a typo, a different spelling) is not disturbed by a takeover.

Why this shape: the true owner can always win. They know their own registered name and can complete a first payment (15 KES from any Lightning wallet, even their own), while a squatter would have to pay the victim and guess the victim's exact registered name to claim. The residual risk is a squatter who pays to hold a number plus its defaced shop name; the money still lands with the victim, and Stanley can release the record (`ktown_release`, below) for persistent abuse. Two people alternating takeovers every 48 hours ends the same way: whoever completes a matched payment first holds the number for good.
- Limits: registration and login per network, per number and site-wide; LNURL and receipts per network and per merchant.

## The app (PR 2)

Static, no build step: two screens and one pay page do not earn React and a
bundler. A hand-written app is a few kilobytes, loads fast on a low-end phone,
and cannot drift from a forgotten rebuild. The repo's page pipeline (own CSP,
frame check, Security watch reporter) applies unchanged.

- `ktown/index.html`, `ktown/app.js`: the QR screen (shop name, M-Pesa name and
  verified mark, one bold QR, Print) and Settings (register or log in, names,
  currency, language, PIN, history, sign out). Served at /ktown.
- `ktown/pay.html`, `ktown/pay.js`: the payer page at /k/<id>. Names and
  limits come from the merchant's LNURL answer (plus its `verified` field,
  which wallets ignore). The amount defaults to KES and converts from the
  payer's currency through /api/ktown/rates; before paying, the payer sees
  only the shillings the merchant will receive (no sats figure, no fee
  line). The invoice is always priced in KES so the merchant receives
  exactly the shown shillings. Then the invoice QR with copy and
  open-in-wallet, then the paid confirmation from the receipt, polled every
  3 seconds: merchant received KSh X, Tando fee KSh Y (1%), you paid Z sats
  (about KSh X+Y).
- `ktown/style.css`: navy ink on cream, Bricolage headings, Figtree text, big
  touch targets, AA-safe text colors. Orange pill actions, a tonal language
  pill, a Material-style bottom bar with an orange active pill, and the
  Altradits header on all three pages. The QR is black on white SVG, crisp
  in print and in black and white.
- `ktown/qrcode-generator-1.4.4.js`: QR encoder by Kazuhiko Arase, MIT
  licence (header kept), vendored so the QR renders locally with no network.
- English and Kiswahili throughout, from a small word list in each page
  script. Server error lines stay in English.
- History converts into the merchant's currency with ≈ (display only; the KES
  figure is exact). Without rates, both pages fall back to KES silently.
  Each settled entry also names what landed and why: the fee the payer
  covered, quoted vs received when they differ, or that the wallet paid in
  sats and the 1% came out of the shillings.

## Print and offline (PR 3)

- One button prints the counter card cropped to A6; a second button builds
  four cards and prints an A4 cut-out sheet. A third renders the card as PNG
  (about 500 by 700) entirely in the browser and downloads it. All three run
  on the same saved merchant data as the screen QR, so card, sheet, app and
  pay page can never disagree.
- The QR holds the pay page link with the LNURL attached, so a phone camera
  opens the exact pay page while a Lightning wallet pays the LNURL directly
  (in KES mode when it speaks LUD-21, in sats otherwise).
- `ktown/sw.js` installs the app as a PWA: it precaches the shell (HTML, CSS,
  scripts, fonts), answers same-site GET reads from the cache for offline
  use, never caches /api/ responses, and falls back to the app on a failed
  read. Only a 401 signs the merchant out, so a failed network keeps the
  saved QR and settings on screen instead of dropping to login.
- `ktown/manifest.webmanifest` with two PNG install icons under
  `ktown/icons/` (192 and 512, plus the SVG they were drawn from).

Serving mirrors Ye₿ente on both stacks (server.mjs and .htaccess). Where
nginx sends pages straight from disk, /ktown, /ktown/terms and /k/<id>
need the same treatment Ye₿ente's app already has: /ktown serves
ktown/index.html, /ktown/terms serves ktown/terms.html, and /k/<id>
serves ktown/pay.html with its query string kept.

## Pre-launch (Kisumu pilot)

Before KTOWN=on for the 10-shop pilot, these guard the first strangers:

- Merchant terms and privacy notice at /ktown/terms, short and plain in
  English and Kiswahili: kTown never holds money and is not a wallet;
  Tando converts sats to M-Pesa for its 1% fee; payments, refunds and
  failed payments are between the payer, Tando and M-Pesa; what kTown
  stores and why; how to ask for deletion; pilot status (free, may
  stop). Approved by Stanley's lawyer (version 2026-11-06).
  Registration ticks "I agree"; the terms version
  (KTOWN_TERMS_VERSION in lib/ktown.js) and the time are stored on the
  merchant record.
- "Powered by Tando (1% fee)" links to https://bitcoin.co.ke on /ktown
  and on every pay page (the address is set in the page script, so
  static pages carry no outside addresses), with a small footer on the
  printed card and sheet.
- KTOWN_HELP: the pilot help contact (a phone number or email Stanley
  sets in env), answered by GET /api/ktown/help and shown as plain
  text on the app and the pay page. Hidden when unset. No form.
- Squatter blocklist: POST /api/admin { action: "ktown_block" |
  "ktown_unblock", phone } keeps a number from registering
  (kt:blocked:<phone>, checked in register); { action: "ktown_release",
  phone } deletes a merchant record so its number can sign up again
  (its sessions and QR end; its payment entries stay, kept). Every
  takeover, block, unblock and release is logged in the Security watch
  (technique ktown_number) with the number, so Stanley can act from
  the log.
- Pilot cap: KTOWN_MAX_MERCHANTS (default 10). Past it, registration
  answers "kTown is full for now." A takeover replaces its record, so
  a full pilot still lets it through. Health answers { ok, on, full }
  only: never the count.

## Still open

- Lost-phone recovery without Stanley (today: he releases the record and the merchant signs up again).
- If the live server ever sets proxy variables, Node sends `https.request` through the proxy and `lib/netsafe.js` can no longer pin DNS. Keep proxy variables off the live server, or teach the guard to refuse proxied requests.
