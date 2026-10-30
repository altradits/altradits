# Aligned with the whitepaper
Satoshi Nakamoto's "Bitcoin: A Peer-to-Peer Electronic Cash System" (2008) is in the library as published. This is how Altradits follows it, section by section, and where a custodial service necessarily departs from it.

## 1. Introduction: trust versus proof
The paper's goal is payments based on cryptographic proof instead of trust in a financial institution. Altradits checks payments against its own node and never asks clients to trust a third party's word that they paid. Ye₿ente is custodial (users trust Altradits), so it compensates with limits, a solvency check and the option to withdraw to the user's own wallet at any time.

## 2. Transactions: a chain of signatures
A coin moves by its owner signing it over. Altradits never holds clients' keys for their own wallets (the Bitcoin & Lightning QA expert fails any deliverable where we would). The Lightning node signs only what its owner's keys allow; the website's key can't sign payments at all.

## 3-4. Timestamp server and proof-of-work
Blocks order transactions and proof-of-work makes rewriting them expensive. Altradits waits for blocks before treating on-chain money as received, and more blocks for more money.

## 5. Network
Nodes accept the longest valid chain. The Mac's Bitcoin Core keeps many peers and anchor connections; the node findings recommend running LND against that full node instead of a single light-client peer.

## 6. Incentive
Honest mining pays better than attacking. A business still assumes someone might try, which is why confirmations scale with the amount at risk.

## 7. Reclaiming disk space
Old spent transactions can be pruned without losing security. The manual explains prune=550 for small machines.

## 8. Simplified payment verification
A light client trusts the network's longest chain and is weaker under attack; the paper suggests businesses that receive frequent payments run their own nodes. Altradits issues receipts only from its own node's record. The open item: LND currently uses Neutrino (a light client) with one peer; moving it to the Mac's own Bitcoin Core closes this.

## 9. Combining and splitting value
Transactions have multiple inputs and outputs, usually one for payment and one for change. The talk walks through exactly this in a real transaction (input 50 BTC, outputs 1.5 and 48.49999859, fee 141 sats).

## 10. Privacy
Keep public keys anonymous and use a new key pair for each transaction. Altradits gives each order its own on-chain address, stores connections only as keyed hashes, keeps no phone numbers or home addresses, and allows orders and donations without email. LND runs over Tor.

## 11. Calculations
The probability an attacker catches up drops exponentially with each block. With an attacker at 10% of the hash power, a payment 5 blocks deep has under a 0.1% chance of being reversed. Altradits: 1 confirmation below 0.01 BTC, 3 below 0.1 BTC, 6 above (confirmationsFor). Zero-confirmation on-chain payments are never accepted.

## 12. Conclusion
A system for transactions without relying on trust. Every part of Altradits that touches money is built so that its own node, not a third party, has the final word.
