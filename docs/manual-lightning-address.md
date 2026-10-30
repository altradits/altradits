# Manual: Lightning addresses and LNURL
A Lightning address looks like an email (yourname@altradits.com) and lets anyone pay you from any Lightning wallet. Behind it is LNURL-pay: two web requests that end with a fresh invoice from your node.

## How it works (LUD-06 and LUD-16)
1. The payer's wallet turns name@domain into https://domain/.well-known/lnurlp/name and fetches it:
```
{
  "tag": "payRequest",
  "callback": "https://altradits.com/api/yebente/lnurl/yourname",
  "minSendable": 1000,
  "maxSendable": 100000000,
  "metadata": "[[\"text/plain\",\"Pay yourname@altradits.com\"],
               [\"text/identifier\",\"yourname@altradits.com\"]]",
  "commentAllowed": 0
}
```
2. The payer picks an amount (in millisatoshis) and calls the callback with ?amount=:
```
{ "pr": "lnbc...", "routes": [] }
```
3. The wallet pays the invoice "pr".

## What the receiver must do (Altradits does all of these)
- Make a new invoice from its own node for exactly the amount asked, with description_hash = SHA-256 of the metadata.
- Refuse amounts outside min and max (Ye₿ente: up to what the wallet can still hold).
- Rate-limit callbacks per address.
- Serve only over HTTPS on its own domain.

## What the payer must check (Ye₿ente does these)
- The invoice amount equals the amount asked; otherwise refuse (and the Security watch records "invoice substitution").
- When the invoice carries a description hash, it must equal the SHA-256 of the metadata the address published.
- Fetch the address and callback only from public internet hosts (lib/netsafe.js), with no redirects and a size cap.

## LNURL as a QR code
An LNURL is the same https link encoded in bech32 with the prefix lnurl (LUD-01), uppercase in QR codes so they stay small:
```
LIGHTNING:LNURL1DP68GURN8GHJ7...
```
Ye₿ente's receive screen shows the wallet's own address this way; when another Ye₿ente user scans it, the payment stays inside the ledger (instant, free).

## For a shop: fixed-amount LNURL
Proposals also offer an LNURL for exactly the amount due (api/lnurl.js): minSendable and maxSendable are within 2% of the price, so the client can't underpay.

## Phone numbers as Lightning addresses
phone@bitcoin.co.ke pays an M-Pesa number in Kenya through Bitcoin.co.ke's own LNURL service. Ye₿ente treats it like any Lightning address: the same amount and description checks apply.
