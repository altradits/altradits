# Ye₿ente wallets
Ye₿ente (/yebente) is a Bitcoin app with custodial Lightning wallets kept by Altradits on its own node. Balances live in a ledger on the server (lib/ywallet.js), never in the browser. The app source is yebente/src (React, Vite); its build in yebente/app is committed and served as files.

## The ledger
- Every balance change runs under one ledger lock, so two requests can never spend the same sats; every change writes a history entry.
- Credits happen once per reference (payment hash, M-Pesa receipt), however many times a confirmation arrives.
- No amount, balance or invoice may exceed 21 million BTC or leave safe-integer range (the 2010 overflow lesson); a corrupted balance never pays out.
- Limits (settings): YEBENTE_MAX_BALANCE_SATS (default 200,000), YEBENTE_MAX_PAYMENT_SATS (100,000), YEBENTE_DAILY_SEND_SATS (200,000). Daily caps count the whole 24 hours; the balance cap counts invoices and buys still on their way in.

## Creating and opening a wallet
- POST /api/yebente/wallet/create {pin, handle?, email?}: a 6-digit PIN (patterns like 123456 or 112233 are refused), a handle (name@altradits.com is its Lightning address), a device token and a 12-word recovery phrase (shown once; only its hash is stored).
- Restore on a new phone with the phrase and a new PIN; the owner is emailed.
- PIN mistakes: 5 wrong tries lock spending for 15 minutes, then 1 hour, then 24 hours within a day; the owner is emailed; the Security watch records it.

## Receiving
- wallet/invoice makes an invoice on the node for this wallet; it is credited when the node says paid, and a background sweep every 2 minutes credits payments made while the app was closed.
- handle@altradits.com works as a Lightning address (LNURL-pay) from any wallet.

## Sending
- To another Ye₿ente handle or its QR: instant and free, inside the ledger.
- To a Lightning address or LNURL: resolved on the server through the public-address guard (lib/netsafe.js), the returned invoice must be for exactly the amount asked.
- To an invoice: paid by the node with a fee reserve (1%, at least 10 sats), the unused part refunded. A payment is refunded only when the node says FAILED or that it never started it; any unclear answer leaves it pending, rechecked after 5 seconds and by the background check (never on payments under 3 minutes old).
- Fingerprint or face approval (WebAuthn passkeys) can stand in for the PIN once per payment; signatures, origin and counter are checked on the server.

## Recovery by email
- A recovery email counts only after its confirmation link is opened.
- The recovery link works once for 30 minutes; it signs every other device out, removes fingerprint keys, and holds payments above 1,000 sats for 24 hours.

## Buying sats with M-Pesa
- Off unless YEBENTE_MPESA_BUY=on with Daraja credentials. A quote checks the wallet limit, the daily KES limit (including pending buys), and that the node could pay out everything wallets would then hold.
- Safaricom's result arrives at a callback whose path carries YEBENTE_CALLBACK_SECRET; status checks go through the signed-in wallet only.

## Solvency
Every hour the server compares the total of all Ye₿ente balances with what the node can send (lib/attacks.js checkSolvency). A shortfall is recorded in the Security watch and emailed to Stanley: add outbound liquidity or pause buying. This is the Mt. Gox and QuadrigaCX lesson.

## Turned off on purpose
Sign-in-free invoices on the node, public M-Pesa status queries and every payout path that would pay on request (M-Pesa B2C, on-chain disbursement) answer 501.
