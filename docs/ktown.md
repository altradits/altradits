# kTown

kTown gives a Kisumu merchant "pay in sats" with nothing to learn and no hardware to buy. The merchant signs up with their M-Pesa number, prints one QR, and sticks it on the counter. A customer with any Lightning wallet scans it, can edit the amount, sees exactly how many shillings the merchant will receive, pays in sats, and the merchant gets KES in M-Pesa.

kTown never holds money and is not a wallet. It is a thin LNURL-pay front for the merchant's Tando address (2547XXXXXXXX@bitcoin.co.ke). The sats go straight to Tando, and Tando converts them to M-Pesa for a 1% fee.

## Tando's API (checked live with read-only GET, Nov 2026)

Docs: https://bitcoin.co.ke/send-money-to-kenya/docs/developer-api.html

- `GET /.well-known/lnurlp/<254..>` answers payRequest with LUD-21 `currency` {code KES, minSendable 15, maxSendable 50000, multiplier in msat per KES}. Only Safaricom ranges resolve (7xx, 11x, 14x).
- `GET <callback>?amount=<KES>&currency=KES` returns an invoice that delivers exactly that many shillings. The payer covers the 1% on top. Without `currency` the amount is millisats and the invoice matches it exactly, and the fee comes out of the delivered shillings.
- `GET /api/payment/<hash>` answers `{success, transaction}` with status (pending, received, completed, failed), isPaid, paymentNetworkReceipt (the M-Pesa code), payToAccount, merchantName (the M-Pesa registered name), currencyAmountSent and the sats figures. A payment counts as settled only when status is completed, isPaid is true and the M-Pesa code is present. Unknown hashes get 404.
- A number its owner claimed points at their own bitcoin wallet instead of M-Pesa. kTown refuses those at registration: without KES terms there is no M-Pesa delivery to promise.

## The server (PR 1)

- `lib/ktown.js`: merchants, sessions, the Tando calls, LNURL answers, history. `api/ktown.js`: the routes. Store keys are listed at the top of lib/ktown.js. Switched on with `KTOWN=on`.
- Registration proves the number works by reading its Tando LNURL. Receiving starts at once: money can only flow to the registered M-Pesa number, so an early QR risks nothing.
- Identity is a 6-digit PIN (patterns refused, 5 wrong tries lock logins for 15 minutes) plus a year-long session per shop phone. Whoever holds the session may change that merchant's settings; a merchant can only ever change their own. A signed-in phone sets a new PIN without the old one. A lost phone with a forgotten PIN needs Stanley to delete the `kt:phone:<number>` and `kt:<id>` keys by hand, then the merchant signs up again, unless the registration is still unclaimed, stale and unpaid, in which case signing up again takes it over by itself. kTown holds no money, so nothing is at risk meanwhile.
- LNURL: `GET /.well-known/lnurlp/k-<id>` (and `/api/ktown/lnurlp/<id>`) answers payRequest with the shop name and M-Pesa name, Tando's msat limits and the KES currency terms. The callback asks Tando for an invoice for exactly that amount and returns it unchanged.
- Amount checks: in KES mode Tando's `converted` must equal the asked shillings and the invoice sats must sit inside a narrow band (the 1% plus drift and rounding); in msat mode the invoice must match the millisats exactly. Anything else is refused and recorded in the Security watch.
- History records only the merchant's own facts: amount, shillings expected and received, payment hash, M-Pesa code, time. Nothing about who paid is asked for, read or stored. One record per payment hash; a repeat confirmation changes nothing. Payment records are never pruned.
- Name verification: the typed M-Pesa name shows from the start as the name the customer will see. It is marked verified once a receipt for that merchant's number carries the same registered name.
- Receipts: `GET /api/ktown/receipt/<hash>` answers only for hashes kTown itself recorded. Anything else gets 404 without Tando ever being asked, so no stranger's payment can be looked up here. The registered name is returned (and kept in history) only when it matches the merchant: a wrong guess learns nothing. A payment started before a takeover still reports its status afterwards, but names no name.

## Who owns a number

Anyone can type any M-Pesa number at sign-up, so a squatter could register someone else's number and lock the real owner out with "already registered". Payments would still land with the true owner (money only ever flows to the registered number), but the owner could not sign up. There is no SMS gateway and Altradits sends no money, so ownership is proven another way:

- A registration starts unclaimed. The first receipt whose number and registered name both match the typed ones claims it. Claiming sticks: renaming later unchecks the name, never the proven number.
- A registration that is still unclaimed after 48 hours, with no paid receipt, can be taken over by signing up again for the same number. The old record goes (its sessions and its QR end with it); its payment entries stay in the store, kept, never deleted.
- Anything showing liveness holds the number: a claim, or money that landed. A working till whose name never matched (a typo, a different spelling) is not disturbed by a takeover.

Why this shape: the true owner can always win. They know their own registered name and can complete a first payment (15 KES from any Lightning wallet, even their own), while a squatter would have to pay the victim and guess the victim's exact registered name to claim. The residual risk is a squatter who pays to hold a number plus its defaced shop name; the money still lands with the victim, and Stanley can delete the `kt:phone:<number>` and `kt:<id>` keys by hand for persistent abuse. Two people alternating takeovers every 48 hours ends the same way: whoever completes a matched payment first holds the number for good.
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
  payer's currency through /api/ktown/rates; the invoice is always priced in
  KES so the merchant receives exactly the shown shillings. Then the invoice
  QR with copy and open-in-wallet, then the paid confirmation from the
  receipt, polled every 3 seconds.
- `ktown/style.css`: navy ink on cream, Bricolage headings, Figtree text, big
  touch targets, AA-safe text colors. The QR is black on white SVG, crisp in
  print and in black and white.
- `ktown/qrcode-generator-1.4.4.js`: QR encoder by Kazuhiko Arase, MIT
  licence (header kept), vendored so the QR renders locally with no network.
- English and Kiswahili throughout, from a small word list in each page
  script. Server error lines stay in English.
- History converts into the merchant's currency with ≈ (display only; the KES
  figure is exact). Without rates, both pages fall back to KES silently.

## Print and offline (PR 3)

- One button prints the counter card cropped to A6; a second button builds
  four cards and prints an A4 cut-out sheet. A third renders the card as PNG
  (about 500 by 700) entirely in the browser and downloads it. All three run
  on the same saved merchant data as the screen QR, so card, sheet, app and
  pay page can never disagree.
- `ktown/sw.js` installs the app as a PWA: it precaches the shell (HTML, CSS,
  scripts, fonts), answers same-site GET reads from the cache for offline
  use, never caches /api/ responses, and falls back to the app on a failed
  read. Only a 401 signs the merchant out, so a failed network keeps the
  saved QR and settings on screen instead of dropping to login.
- `ktown/manifest.webmanifest` with two PNG install icons under
  `ktown/icons/` (192 and 512, plus the SVG they were drawn from).

Serving mirrors Ye₿ente on both stacks (server.mjs and .htaccess). Where
nginx sends pages straight from disk, /ktown and /k/<id> need the same
treatment Ye₿ente's app already has: /ktown serves ktown/index.html and
/k/<id> serves ktown/pay.html with its query string kept.

## Still open

- Lost-phone recovery without Stanley (today: he deletes two keys by hand).
- If the live server ever sets proxy variables, Node sends `https.request` through the proxy and `lib/netsafe.js` can no longer pin DNS. Keep proxy variables off the live server, or teach the guard to refuse proxied requests.
