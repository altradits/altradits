# Mempool Mayhem: sats trivia battle

A free live quiz about Bitcoin and Lightning at /trivia. Entry costs
nothing. Donors fund a prize pool in real sats, and winners are paid over
Lightning. The server owns the clock, the answers, the scores and the
battle sats. The page only shows and collects.

## Run a game

1. Switch on: `TRIVIA=on`. Off means no new games and no answers. Reads
   (health, pool, ledger, past games) stay up either way.
2. Point the pool at a wallet: `TRIVIA_HOUSE_WALLET=<handle>`. Donations
   stay closed until this is set.
3. Create and schedule (admin API): `trivia_create` with a title and an
   optional player list, then `trivia_schedule` with a future start time.
4. Players join on /trivia before the start. One seat per account.
5. Start (admin API): `trivia_start` with the game id and round count.
   The first round opens at once.
6. Play runs itself. Every read settles whatever the clock has closed.
   Twenty seconds a question. Silence costs a life.
7. When the game ends, pay each winner (admin API): `trivia_payout` with
   the winner name, a destination, and the house wallet PIN. One payout
   per winner. Mid-game withdrawals are impossible.

## Cancel with a written rule

`trivia_cancel` needs a rule, stored on the game:

- keep: paid sats move to a named scheduled game. Unpaid invoices die.
- return: paid sats are marked for manual return by Stanley. Lightning
  needs each donor's invoice, so returns are never automatic.

Nothing is ever deleted. Cancelled games archive with every entry kept.

## Money paths

Receiving reuses donations: node invoices plus settle, credited once to
the house wallet. Paying reuses the wallet payout path only: PIN,
spendable caps, outbound precheck, fee reserve, lockdown gate. Battle
sats are play units. They move between players as rounds settle and are
never withdrawable.

## Honest copy

The page promises nothing it cannot keep: free entry, donor funded
prizes, no earnings talk, no staked mode shown while off. Player names
and accounts are the only personal data kept. No email, no phone.

## Staked play (off)

Staked play stays off until the licences are in place and the lawyer
gives written OK. The switch is `TRIVIA_STAKES=on`, default off. When
off, every staked endpoint refuses with one plain message, and the
public page shows nothing staked. Donor-funded play runs as above
either way.

When on, each seated player locks the same equal stake from their own
wallet through a Lightning hold invoice. The sats stay locked until the
game ends. A staked game starts only when every seat is locked. At the
end Stanley settles the locks (`trivia_stake_settle`): the stakes join
the pool, and winners are paid with the normal payout approval. To call
off a staked game, cancel the locks first (`trivia_stake_cancel`): the
node refunds every payer. Expired locks refund themselves.

Test on a fake node or regtest first. The test suite locks, settles and
cancels against a fake node (`test/trivia-stakes.test.mjs`). For
regtest, point `LND_REST_URL` at the regtest node with its invoice
macaroon, set `TRIVIA=on` and `TRIVIA_STAKES=on`, then set, lock, settle
and cancel one game from the admin API before touching real sats.

## Files

- `trivia.html`, `assets/trivia.js`, `assets/trivia.css`: the page.
- `lib/trivia.js`: rules engine. `lib/trivia-ledger.js`: sats ledger.
- `lib/trivia-donors.js`: donor pool, joins, cancel, payouts.
- `lib/trivia-stakes.js`: equal own stakes on hold invoices, off by default.
- `lib/trivia-live.js`: live rounds on the server clock.
- `lib/lightning.js`: hold invoice calls (make, read, settle, cancel).
- `api/trivia.js`: public API. `api/admin.js`: trivia actions.
- `data/trivia/level-1..5.json`: the question bank.
- `test/trivia-*.test.mjs`: engine, ledger, bank, donor, admin, live, stakes.
