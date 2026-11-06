# Sats Safari

A free browser game for children (about 8 to 13) that teaches how Bitcoin
works by playing. Seven short stops across a savanna map. English and
Kiswahili from day one. No real money, no accounts, no trackers. Progress
stays in the browser. Served at /sats-safari.

Name check (6 Nov 2026): no existing game or Bitcoin product is called
"Sats Safari". (Unrelated: UK school-test revision sheets call themselves
"SATs safari", and a slot game is called "Safari Coins".)

## Files

- `sats-safari/index.html`: the shell. Menu, map, level host, learned card.
- `sats-safari/app.js`: router, map, learned card. `SHIPPED` lists the stops
  this build carries; others show "soon".
- `sats-safari/i18n.js`: loads `i18n/<lang>.json`. English is the fallback.
- `sats-safari/progress.js`: stars, badges, language and sound in
  localStorage, every access guarded. Pure JS, unit tested.
- `sats-safari/sound.js`: synthesized blips. Off by default.
- `sats-safari/levelN.js`: stop N. Exports `META` and `start(root, ctx)`.
- `sats-safari/parents.js`: the parents and teachers screen (`#/parents`).
- `sats-safari/sats.js`, `chain.js`, `mining.js`, `supply.js`: pure game
  logic shared by the browser and the tests.
- `sats-safari/sw.js`: offline play. Own cache (`sats-safari-vN`), scope
  /sats-safari. Bump the version when cached files change.
- The game lives at /sats-safari/ (trailing slash). The worker's scope only
  covers that directory, so the bare /sats-safari redirects there (301 on
  both stacks) and /sats-safari/ is the canonical address.
- `test/sats-safari.test.mjs`: game tests. Run: `npm test`.

Site wiring (mirrors kTown): `server.mjs` (PUBLIC allow-list and the
/sats-safari route), `.htaccess`, `sitemap.xml`, `lib/visits.js` (page views
counted as `sats-safari`: day, page, referring site only), the portfolio
card, and the page lists in `test/build-security.test.mjs`.

The game page carries the same policy format `deploy/page-csp.mjs` writes
(CSP meta tag plus /assets/report.js). `deploy/page-csp.mjs` itself only
knows the root and kTown pages, so `test/sats-safari.test.mjs` checks the
game page's policy is fresh with the same function. After editing the game
page, refresh its tag:

```sh
node -e "import('./deploy/page-csp.mjs').then(async ({ withPolicy }) => {
  const fs = await import('node:fs');
  const f = 'sats-safari/index.html';
  fs.writeFileSync(f, withPolicy(fs.readFileSync(f, 'utf8')));
});"
```

## Levels

| Stop | Name | Teaches | Whitepaper |
| --- | --- | --- | --- |
| 1 | Sats Market | 100,000,000 sats make one bitcoin; counting small amounts | §2 |
| 2 | Keys and Padlocks | Secret key opens, public address receives; never share the secret | §2, §10 |
| 3 | Send It On | Sending sats; the same sats cannot be spent twice | §2, §5 |
| 4 | Block Train | Transactions packed in blocks, each linked to the last | §3 |
| 5 | The Guessing Game | Mining as guessing; difficulty keeps 10 minutes a block | §4 |
| 6 | Friends Agree | Everyone keeps the same list; longest valid chain wins | §5 |
| 7 | Only 21 Million | The cap and the halving, as a story | §6 |

How each stop plays (2 to 4 minutes each):

1. Tap coins to count, fill a bitcoin bar in tens of millions, buy a mango
   with exact change.
2. Open your chest with the secret key, refuse the fox who begs for it,
   share only the public address.
3. Pick a destination, sign, watch the coin fly. Then try to spend the same
   sats twice and watch the friends refuse.
4. Load transactions on the train, seal the block, link three blocks in
   order, then change one old letter and watch the links break.
5. Tap to guess a one-zero hash, drill for two zeros, then answer harder or
   easier as the pace changes.
6. Pick the tallest pile, disqualify its broken link, break the tie, refuse
   the bossy baboon.
7. Walk four halving seasons, then answer how many coins can ever exist and
   what the next season gives.

Facts are checked against the Bitcoin whitepaper and the bitcoin.org
developer docs. Numbers the whitepaper does not state (100,000,000 sats to
a bitcoin, 10 minute blocks, the halving every 210,000 blocks, the 21
million cap) come from bitcoin.org and the code. Each stop's card names its
whitepaper section.

## Parents screen

`#/parents` (menu button "For parents and teachers"): what the seven stops
teach, how to play offline, and exactly what data leaves the device. The
wording is pinned to the code: progress stays in the browser
(`progress.js`); the visit counter stores day, page, referring site and
utm_source only (`lib/visits.js`: no IP, no cookie, no user agent); the
script-lock reporter sends page, rule and blocked address
(`assets/report.js`).

## Offline

One online visit installs the worker (cache `sats-safari-vN`, scope
/sats-safari). After that the whole game plays with no internet: all files
are precached. To check by hand: open the game, turn on airplane mode,
reload and play. Fonts fall back to the device's own while offline.

## How to add a language

1. Copy `sats-safari/i18n/en.json` to `sats-safari/i18n/<code>.json`.
   Translate every value. Keep `{n}` style placeholders. No em-dashes.
2. In `sats-safari/i18n.js`, add the code to `langs()` and teach
   `loadLang()` to fetch it.
3. In `sats-safari/app.js`, extend the language button cycle.
4. Add the file to `SHELL` in `sats-safari/sw.js`.
5. Run `npm test`. The i18n test fails until every key matches English.

## Screenshots

Headless Chrome through the repo's file layout (no server needed):

```sh
node /tmp/pw-shot/shoot.mjs /sats-safari /tmp/sats-safari-review/menu-1280.png 1280
```

Review shots live in /tmp/sats-safari-review/.
