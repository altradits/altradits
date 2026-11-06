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

Facts are checked against the Bitcoin whitepaper and the bitcoin.org
developer docs. Numbers the whitepaper does not state (100,000,000 sats to
a bitcoin, 10 minute blocks, the halving every 210,000 blocks, the 21
million cap) come from bitcoin.org and the code. Each stop's card names its
whitepaper section.

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
