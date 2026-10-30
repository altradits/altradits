# Payments, receipts and the books
Altradits collects Bitcoin only: Lightning (preferred) and on-chain, both received by Altradits' own LND node. Prices are in US dollars and converted at the live BTC price when the invoice is made.

## Orders and proposals
- Every order, proposal and donation is a "proposal" record with a secret token (api/order.js, api/donate.js, lib/crm.js). Only someone holding the token can see or pay it.
- Every order also gets a memorable name (lib/pickup.js) so a client without email can collect their work at /collect. Only its hash is stored; lookups are rate-limited per connection and site-wide.
- Coupons from the treasure hunt (lib/hunt.js) reduce the price; at least $1 (MIN_TO_PAY) is always paid so every order has a real payment on the node.
- Business rules (price floors, discount caps, approval thresholds) live in lib/crm.js and data/catalog.js, so no AI can quote below what Stanley agreed.

## Making the invoice (POST /api/pay)
1. Checks the token and that the proposal is accepted.
2. Makes (or reuses, if it has more than 3 minutes left) a Lightning invoice for the amount due on the node. Earlier invoices stay watched, each with the price and coupon it was made with, so whichever is paid is accounted exactly.
3. Offers a fixed-amount LNURL (api/lnurl.js) for wallets that prefer it, limited to the amount within 2% for price movement.
4. Gives an on-chain address from the node (one per order) when the amount is above dust (546 sats), and a single BIP 21 QR containing both.
5. Shows the fees honestly: Altradits adds none; the wallet's routing fee or the on-chain fee is the payer's.

## Detecting payment (GET /api/pay)
- Lightning: the node's own record must say SETTLED.
- On-chain: the full amount (1% tolerance) must be buried deep enough for its size: 1 confirmation below 0.01 BTC, 3 below 0.1 BTC, 6 above (confirmationsFor in lib/lightning.js). Until then the client sees "seen, waiting for confirmations".
- One confirmation per order however many checks arrive at once (a lock, then a re-read).
- The invoice that settled decides the price and coupon, not whatever the order shows now.

## Held payments and receipts
- A receipt is only issued for money the node itself recorded (nodeSettlement). A payment seen only by a block explorer, or made to the backup Lightning address while the node was down, is "held".
- Finance tab → Waiting to move to the node: the system makes a node invoice for the exact sats; Stanley pays it from the backup wallet; when the node shows it settled, the official receipt goes out (lib/finance.js moveToNode, checkHeld runs hourly).
- Receipts are numbered once and rebuilt from the record when viewed again (never a new number). Stan's QA reconciles each one; a mismatch alerts Stanley without holding the client's email.

## Balances, retainers and donations
- Orders paid "half now, half on delivery" get a balance invoice when the client approves the work.
- Monthly retainers renew on day 25 (invoice), are due day 30 and pause on day 35 (lib/followups.js).
- Donations to Bitcoin education can be exact sats; they are shown apart from sales in the statement (lib/statement.js).

## Why it is built this way (lessons from Bitcoin's history)
- Unconfirmed is not paid (whitepaper section 11; double-spends against zero-confirmation payments).
- Confirmations scale with the amount (the 2013 chain split; reorganisations on smaller chains).
- The node's own record, not a block explorer's (the whitepaper's section 8 on simplified verification; the 2015 SPV-mining fork).
- Payments are identified by payment hash, address or the node's record, never by a transaction id that can change (malleability, blamed in the Mt. Gox collapse).
- The website's key can create invoices and never spend (least privilege; the 2019 Binance theft).
