# Whitepaper

> "The root problem with conventional currency is all the trust that's required to make it work." — Satoshi Nakamoto, 2008

## Altradits Core Values — Derived from the Bitcoin Whitepaper

Ten values, each grounded in a section of the Bitcoin whitepaper, and what each one means in practice for Altradits.

---

## Value 1: Trust Minimization, Not Trust Elimination

> **Bitcoin Whitepaper, Section 1 (Introduction):** "What is needed is an electronic payment system based on cryptographic proof instead of trust."

**Altradits Interpretation:** Bitcoin removes the need to trust a central bank. Altradits removes the need to trust a "nguru" or an opaque fund manager.

| Traditional Problem | Altradits Solution |
|---|---|
| Trust the nguru with your sats | No ngurus. Assets are public (VOO, BND). |
| Trust the Sacco to pay interest | Interest comes from verifiable market returns. |
| Trust the organizer to track attendance | QR check-ins prove attendance. |

**Our Application:**
- Every transaction is logged in the database (auditable)
- Every asset in the pool is public (VOO, BND, money markets)
- Every profit update is recorded with timestamp and admin ID
- Students scan QR at events — proof of attendance cannot be faked

> **Altradits Way:** "Don't trust. Verify. Every sat, every attendance, every profit is traceable."

---

## Value 2: Proof of Work (Patience as Work)

> **Bitcoin Whitepaper, Section 4 (Proof-of-Work):** "The proof-of-work involves scanning for a value that when hashed... the proof-of-work is a CPU time expense."

**Altradits Interpretation:** Bitcoin rewards computational work. Altradits rewards temporal work — the work of waiting, of discipline, of not touching your sats for 5 years.

| Traditional Problem | Altradits Solution |
|---|---|
| Instant gratification (withdraw anytime) | 5-year minimum lock — patience is rewarded |
| No penalty for quitting early | Early withdrawal penalty (up to 100% of profit) |
| No incentive to hold | Monthly profit accrual + bonus at maturity |

**Our Application:**
- 5-year lock minimum — proof of patience
- Penalty decreases each year (100% → 10%)
- After maturity, capital stays invested forever (perpetual proof of work)
- Milestone badges (1 year, 2 years, etc.) gamify the waiting

> **Altradits Way:** "Waiting is work. Your patience is your proof."

---

## Value 3: Timestamped Transparency

> **Bitcoin Whitepaper, Section 3 (Timestamp Server):** "A timestamp server works by taking a hash of a block of items to be timestamped and widely publishing the hash... The timestamp proves that the data must have existed at the time."

**Altradits Interpretation:** Bitcoin timestamps transactions immutably. Altradits timestamps every action — deposits, withdrawals, profit injections, investments, check-ins, reviews.

| Traditional Problem | Altradits Solution |
|---|---|
| No record of when a nguru took your money | Every transaction has a `created_at` timestamp |
| No proof you attended an event | QR check-in with timestamp + scanner ID |
| No audit trail for profit distribution | Distribution logged with admin ID + timestamp |

**Our Application:**
- All tables have `created_at` and `updated_at`
- Event check-ins store `check_in_date` and `scanned_by`
- Profit distributions store `last_distribution_at` and `approved_by`
- Certificates have an `issued_at` timestamp and unique hash

> **Altradits Way:** "If it's not timestamped, it didn't happen. Every action leaves a trail."

---

## Value 4: Cryptographic Proof of Identity (Not KYC)

> **Bitcoin Whitepaper, Section 2 (Transactions):** "We define an electronic coin as a chain of digital signatures."

**Altradits Interpretation:** Bitcoin uses cryptographic signatures, not government IDs. Altradits uses session tokens, QR codes, and API keys — not KYC. Identity is proven by what you have (phone, email, QR), not who you are.

| Traditional Problem | Altradits Solution |
|---|---|
| KYC takes days, excludes the unbanked | Signup with email/phone only (under 10 seconds) |
| Banks need your ID to serve you | Altradits only needs your sats |
| Event check-ins require name lists | QR code is your proof |

**Our Application:**
- No KYC for MVP — email or phone only
- QR codes for event check-ins (cryptographic secret)
- API keys for business integrations (not personal info)
- Wallet created instantly on signup

> **Altradits Way:** "You are your keys. Not your ID."

---

## Value 5: Decentralized Review (Not Central Authority)

> **Bitcoin Whitepaper, Section 5 (Network):** "Nodes express their acceptance of the block by working on creating the next block in the chain."

**Altradits Interpretation:** Bitcoin has no central judge — nodes collectively agree. Altradits has no central reviewer — the community reviews hackathon submissions, awards points, and invites collaboration.

| Traditional Problem | Altradits Solution |
|---|---|
| One organizer judges all projects | Any community member can review |
| Centralized grading can be biased | Multiple reviewers, average rating |
| No way to discover talent | Collaboration invites from reviews |

**Our Application:**
- Hackathon submissions are reviewed by any logged-in user
- Reviewers award points and ratings
- Students can be invited to collaborate based on their work
- Leaderboard shows top-reviewed submissions

> **Altradits Way:** "The community decides. Not one person."

---

## Value 6: Incentive Alignment (You Profit When They Profit)

> **Bitcoin Whitepaper, Section 6 (Incentive):** "The incentive can help encourage nodes to stay honest."

**Altradits Interpretation:** Bitcoin miners are rewarded for securing the network. Altradits admin is rewarded only when customers profit. We do not profit from your losses.

| Traditional Problem | Altradits Solution |
|---|---|
| Nguru profits whether you win or lose | Altradits only takes 2% of profit (not principal) |
| Sacco pays 0% interest, keeps your float | You earn monthly profit from real assets |
| Event organizers charge high fees | Ticket prices in sats, reward sats back |

**Our Application:**
- 2% admin fee taken only from pool profit
- Principal never touched
- Students earn sats for attending (reward, not cost)
- Well-wishers donate directly, no middleman fee

> **Altradits Way:** "We win when you win. Your loss is our loss."

---

## Value 7: Simplicity (Fewest Moving Parts)

> **Bitcoin Whitepaper, Section 9 (Combining and Splitting Value):** "Transactions are... simple to describe."

**Altradits Interpretation:** Bitcoin is complex under the hood but simple to use. Altradits is the same — few buttons, no manuals, self-explaining.

| Traditional Problem | Altradits Solution |
|---|---|
| Investment apps have 50 confusing buttons | 6 customer buttons max |
| Events require printed tickets | QR code on phone |
| Hackathons need complex submission systems | One submit form |

**Our Application:**
- Customer dashboard: Deposit, Withdraw, Send, Receive, Invest, My Businesses
- Event check-in: one QR scan
- Profit access: choose daily/weekly/monthly/annual with one click

> **Altradits Way:** "If it needs a manual, it's broken."

---

## Value 8: Privacy by Default

> **Bitcoin Whitepaper, Section 10 (Privacy):** "The public can see that someone sent an amount to someone else, but without information linking the transaction to anyone."

**Altradits Interpretation:** Bitcoin is pseudonymous. Altradits is pseudonymous by default — no KYC, no real names required, no data sold.

| Traditional Problem | Altradits Solution |
|---|---|
| Banks sell your data | We don't ask for your name (optional) |
| Events require full name | QR code is enough |
| Hackathon submissions expose identity | Reviewer sees only the work, not the name (toggle) |

**Our Application:**
- Full name optional for MVP
- Phone/email never shared with third parties
- Donations can be anonymous
- Reviewers see submission, not student name (toggle)

> **Altradits Way:** "Your business is yours. We only need your sats."

---

## Value 9: Long-Term Horizon (No Shortcuts)

> **Bitcoin Whitepaper, Section 11 (Calculation):** "The probability of a slower attacker catching up diminishes exponentially as blocks go by."

**Altradits Interpretation:** Bitcoin rewards long-term thinking — the longer you wait, the more secure your transaction. Altradits rewards long-term saving — 5 years minimum, with bonuses for waiting longer.

| Traditional Problem | Altradits Solution |
|---|---|
| "Get rich quick" promises | "Get rich certain" — 5 years minimum |
| No penalty for quitting | Penalty decreases with time (incentive to stay) |
| No benefit for holding longer | Bonus for 2, 3, 5+ years |

**Our Application:**
- 5-year minimum lock
- Penalty: 100% of profit forfeited if under 1 year, down to 10% at 4-5 years
- Bonus at 2, 3, and 5 years (extra sats)
- Projected balance shown at maturity to motivate waiting

> **Altradits Way:** "Shortcuts are traps. Wait. The math works."

---

## Value 10: Open Participation (No Gatekeepers)

> **Bitcoin Whitepaper, Section 8 (Simplified Payment Verification):** "The system is secure as long as honest nodes collectively control more CPU power than any cooperating group of attacker nodes."

**Altradits Interpretation:** Bitcoin has no gatekeepers — anyone can run a node. Altradits has no gatekeepers — anyone can invest (no minimum wealth), organize an event (approval only to prevent spam), review hackathon submissions, or sponsor a student.

| Traditional Problem | Altradits Solution |
|---|---|
| Investment requires $10,000 minimum | Invest 1,000 sats (≈70 KES) |
| Only "experts" can review | Any logged-in user can review |
| Only "verified" organizers can host | Anyone can request to organize |

**Our Application:**
- No minimum investment (1 sat works)
- Community reviewers: anyone with an account
- Event organizer: request approval (admin checks for spam)
- Student sponsorship: any well-wisher can donate

> **Altradits Way:** "No gatekeepers. No minimums. No excuses."

---

## Summary Table

| # | Value | Bitcoin Source | Altradits Application |
|---|---|---|---|
| 1 | Trust Minimization | Section 1 | No ngurus. Public assets. Auditable logs. |
| 2 | Proof of Work (Patience) | Section 4 | 5-year lock. Penalty for early exit. Milestone badges. |
| 3 | Timestamped Transparency | Section 3 | Every action logged. QR check-ins timed. |
| 4 | Cryptographic Proof (Not KYC) | Section 2 | Signup with email/phone. QR codes. API keys. |
| 5 | Decentralized Review | Section 5 | Community reviews submissions. No single judge. |
| 6 | Incentive Alignment | Section 6 | Admin profits only when customers profit (2% of profit). |
| 7 | Simplicity | Section 9 | Few buttons. No manuals. Self-explaining. |
| 8 | Privacy by Default | Section 10 | No KYC. No name required. Anonymous donations. |
| 9 | Long-Term Horizon | Section 11 | 5-year minimum. Penalty decreases with time. Bonuses. |
| 10 | Open Participation | Section 8 | No minimum investment. Anyone can review. Open organizing. |

---

## How These Values Guide Every Altradits Decision

- **Product decisions:** "Does this feature increase transparency or hide information?" → If it hides, we don't build it.
- **Pricing decisions:** "Does this fee align our incentives with customer profit?" → If we profit when you lose, we don't charge it.
- **Partnership decisions:** "Does this partner follow the same values?" → If they require KYC or opaque fees, we say no.
- **Event decisions:** "Does this event require gatekeeping?" → If yes, we find another venue.
- **Hackathon decisions:** "Does the review process have a single point of failure?" → If yes, we decentralize.

---

## The Altradits Pledge

> We are not a bank. We are not a nguru. We are not a gatekeeper.
>
> We are a set of values, coded into software, running on Bitcoin.
>
> We trust math, not men. We reward patience, not gambling. We open doors, we don't close them.
>
> This is the Altradits way. Guided by Satoshi. Built for Kenya.
>
> Plant seeds. Wait. Harvest forever.

---

## References

- Nakamoto, S. (2008). *[Bitcoin: A Peer-to-Peer Electronic Cash System](https://bitcoin.org/bitcoin.pdf).*
- Poon, J., & Dryja, T. (2016). *[The Bitcoin Lightning Network](https://lightning.network/lightning-network-paper.pdf).*
- Antonopoulos, A. (2017). *[Mastering Bitcoin](https://github.com/bitcoinbook/bitcoinbook).*

— Stanley, Founder, Altradits
altradits@gmail.com | +254707172370
