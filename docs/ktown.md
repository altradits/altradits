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
- Identity is a 6-digit PIN (patterns refused, 5 wrong tries lock logins for 15 minutes) plus a year-long session per shop phone. Whoever holds the session may change that merchant's settings; a merchant can only ever change their own. A signed-in phone sets a new PIN without the old one. A lost phone with a forgotten PIN needs Stanley to delete the `kt:phone:<number>` and `kt:<id>` keys by hand, then the merchant signs up again. kTown holds no money, so nothing is at risk meanwhile.
- LNURL: `GET /.well-known/lnurlp/k-<id>` (and `/api/ktown/lnurlp/<id>`) answers payRequest with the shop name and M-Pesa name, Tando's msat limits and the KES currency terms. The callback asks Tando for an invoice for exactly that amount and returns it unchanged.
- Amount checks: in KES mode Tando's `converted` must equal the asked shillings and the invoice sats must sit inside a narrow band (the 1% plus drift and rounding); in msat mode the invoice must match the millisats exactly. Anything else is refused and recorded in the Security watch.
- History records only the merchant's own facts: amount, shillings expected and received, payment hash, M-Pesa code, time. Nothing about who paid is asked for, read or stored. One record per payment hash; a repeat confirmation changes nothing. Payment records are never pruned.
- Name verification: the typed M-Pesa name shows from the start as the name the customer will see. It is marked verified once a receipt for that merchant's number carries the same registered name.
- Receipts: `GET /api/ktown/receipt/<hash>` answers Tando's public status (also for hashes kTown did not issue) and moves our record only when the receipt's number matches the merchant's.
- Limits: registration and login per network, per number and site-wide; LNURL and receipts per network and per merchant.

## Still open

- The app, the pay page, print and offline (PR 2 and PR 3).
- Lost-phone recovery without Stanley (today: he deletes two keys by hand).
- If the live server ever sets proxy variables, Node sends `https.request` through the proxy and `lib/netsafe.js` can no longer pin DNS. Keep proxy variables off the live server, or teach the guard to refuse proxied requests.
