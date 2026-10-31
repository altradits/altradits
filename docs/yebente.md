# Ye₿ente wallets
Ye₿ente (/yebente) is a Bitcoin app with custodial Lightning wallets kept by Altradits on its own node. Balances live in a ledger on the server (lib/ywallet.js), never in the browser. The app source is yebente/src (React, Vite); its build in yebente/app is committed and served as files.

## The ledger
- Every balance change runs under one ledger lock, so two requests can never spend the same sats; every change writes a history entry.
- Credits happen once per reference (payment hash, M-Pesa receipt), however many times a confirmation arrives.
- No amount, balance or invoice may exceed 21 million BTC or leave safe-integer range (the 2010 overflow lesson); a corrupted balance never pays out.
- Limits (settings): YEBENTE_MAX_BALANCE_SATS (default 200,000), YEBENTE_MAX_PAYMENT_SATS (100,000), YEBENTE_DAILY_SEND_SATS (200,000). Daily caps count the whole 24 hours; the balance cap counts invoices and buys still on their way in.

## Creating, logging in and staying signed in
One secret for people: the 6-digit PIN (or fingerprint once it's on). The app opens on Log in, then Create; recovery is only for a lost phone or a forgotten PIN.
- POST /api/yebente/wallet/create {pin, handle?, email?, device}: a 6-digit PIN (patterns like 123456 or 112233 are refused), an optional handle (name@altradits.com is its Lightning address) and a 12-word recovery phrase shown once (download as a card; no copy or share button; only its hash is stored).
- Each phone makes its own device key: WebCrypto ECDSA P-256, private half non-extractable in IndexedDB (navigator.storage.persist() asked). The server keeps only the public key, at most 5 phones per wallet.
- Staying signed in: a session (15 minutes idle, 12 hours at most) lives in sessionStorage. When it ends the phone is locked, not logged out: wallet/unlock needs a one-time 60-second challenge signed by the device key AND the PIN or a passkey. A copied browser profile has no key; a stolen unlocked phone gets at most 12 hours and still needs the PIN to pay. The app locks itself after 3 minutes in the background, and while locked shows no balance or history.
- Logging in on a new phone (wallet/login/start, wallet/login/finish): an 8-digit email code (10 minutes, 3 PIN tries per code, 10 codes a day) and then the PIN. It resets nothing and applies no hold, and wrong PINs here never lock the owner's wallet. The reply to login/start is the same, and takes the same time, whether the email exists or not; the owner is emailed when a new phone logs in.
- PIN mistakes: 5 wrong tries lock spending for 15 minutes, then 1 hour, then 24 hours within a day; the owner is emailed; the Security watch records it.
- Settings → Phones and security lists the phones (remove one with the PIN) and the wallet's recent security events (50 kept). Lock now ends the session; Remove from this phone deletes the device key.
- Older phones with a device token (before device keys) are moved to a device key with one PIN on their next open.

## Receiving
- wallet/invoice makes an invoice on the node for this wallet; it is credited when the node says paid, and a background sweep every 2 minutes credits payments made while the app was closed.
- handle@altradits.com works as a Lightning address (LNURL-pay) from any wallet.

## Sending
- To another Ye₿ente handle or its QR: instant and free, inside the ledger.
- To a Lightning address or LNURL: resolved on the server through the public-address guard (lib/netsafe.js), the returned invoice must be for exactly the amount asked.
- To an invoice: paid by the node with a fee reserve (1%, at least 10 sats), the unused part refunded. A payment is refunded only when the node says FAILED or that it never started it; any unclear answer leaves it pending, rechecked after 5 seconds and by the background check (never on payments under 3 minutes old).
- Fingerprint or face approval (WebAuthn passkeys) can stand in for the PIN once per payment; signatures, origin and counter are checked on the server.

## Recovery (lost phone or forgotten PIN)
- By email (the confirmed address) or with the 12 recovery words, always with a NEW PIN. This is a reset: every other phone, older token and fingerprint key is signed out, and for 24 hours at most 1,000 sats in total can leave the wallet (YEBENTE_RECOVERY_HOLD_SATS), in case it isn't the owner. The owner's email is told.
- A recovery email counts only after its confirmation link is opened, with a button (a link preview or mail scanner opening the page confirms nothing).
- The recovery link works once for 30 minutes and carries its token after # (never sent to a server log). Requests answer the same, in the same time, for any address.
- The email can't be changed during a hold; a change tells the old address.

## Privacy of the balance
- Wallet emails (kind "wallet") go out directly, with no copy to Altradits staff, no handle, balance or amount in them, and the link is not stored in the email log.
- handle@altradits.com answers every LNURL query with the same fixed limits and one generic refusal, so a stranger can't probe a balance by asking for amounts; LNURL invoices expire in 10 minutes and don't count toward the owner's incoming total. Invoice memos are generic ("Ye₿ente payment"), and failed transfers give one generic error.

## Buying sats with M-Pesa
- Off unless YEBENTE_MPESA_BUY=on with Daraja credentials. A quote checks the wallet limit, the daily KES limit (including pending buys), and that the node could pay out everything wallets would then hold.
- Safaricom's result arrives at a callback whose path carries YEBENTE_CALLBACK_SECRET; status checks go through the signed-in wallet only.

## Sending power (the channel reserve)
Each Lightning channel keeps a reserve on our side, 1% of the channel, that can never be spent. The node can send only what is above it: with a 2,943,434-sat channel, the first 29,434 sats on our side are locked. Below that, every send out of Ye₿ente (to other wallets, and M-Pesa through Tando) is refused before anything is taken, with "Sending out of Ye₿ente is paused"; payments between Ye₿ente handles still work.
To add sending power, pay a node invoice: admin → Finance → Sending power suggests an amount (enough for every wallet balance plus 20,000 sats) and shows a QR to pay from any Lightning wallet; it updates when the node records the payment. Donations at /donate add sending power the same way.

## M-Pesa through Tando
Send Mobile pays a Kenyan Safaricom number through Tando (bitcoin.co.ke): the app asks Tando for an invoice priced in shillings (15 to 50,000 KES, Tando's 1% fee on top), the node pays it, Tando pays the phone by M-Pesa and publishes the Safaricom receipt code, which the app shows. It needs sending power on the node.

## Solvency
Every hour the server compares the total of all Ye₿ente balances with what the node can send (lib/attacks.js checkSolvency). A shortfall is recorded in the Security watch and emailed to Stanley: add outbound liquidity or pause buying. This is the Mt. Gox and QuadrigaCX lesson.

## Turned off on purpose
Sign-in-free invoices on the node, public M-Pesa status queries and every payout path that would pay on request (M-Pesa B2C, on-chain disbursement) answer 501.
