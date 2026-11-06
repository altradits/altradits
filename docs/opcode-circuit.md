# Opcode Circuit

A Bitcoin puzzle game for adult developers. Build and break things on a simulated chain that runs fully in the browser.

Name check: no game or Bitcoin product uses "Opcode Circuit". Web search finds only the generic technical phrase in zkEVM and covenant writeups. Zero word overlap with the kids game Sats Safari. Note: the name is unrelated to the internal AI circuit breaker in lib/ai.js.

Path: /opcode-circuit/. Folder: opcode-circuit/. Offline after load (service worker scoped to the path). Toy chain only. No real keys. The sim banner says so on every screen.

## Chapters and puzzles

43 puzzles. Each is one idea, solved by doing. Pars reward fewer bytes, fewer ops, fewer sats.

1. Bytes: 1-1 version bytes, 1-2 varints, 1-3 locktime, 1-4 txid flip, 1-5 typo hunt.
2. Hashes and work: 2-1 avalanche, 2-2 mine it, 2-3 retarget, 2-4 heavyweight fork, 2-5 order the chain.
3. Merkle: 3-1 build the root, 3-2 odd leaf, 3-3 SPV check, 3-4 tamper, 3-5 CVE-2012-2459 duplicate trick.
4. Script: 4-1 P2PKH unlock, 4-2 P2SH vault, 4-3 CLTV too early, 4-4 two of three, 4-5 find the bug, 4-6 hashlock.
5. SegWit and Taproot: 5-1 weight math, 5-2 address forensics, 5-3 Schnorr verify, 5-4 key path, 5-5 script path, 5-6 Tapscript add.
6. Policy and fees: 6-1 pick the block, 6-2 RBF bump, 6-3 CPFP rescue, 6-4 eviction, 6-5 pinning demo (simplified).
7. Consensus bugs: 7-1 the 92 billion bug, 7-2 patch the printer, 7-3 double input, 7-4 patch the double, 7-5 reorg response.
8. Lightning: 8-1 fund it, 8-2 lock and claim, 8-3 peel the onion (toy cipher), 8-4 route it, 8-5 decode the invoice, 8-6 survive the jam.

## Sources

Every puzzle shows a debrief card with primary sources. The full set: the whitepaper (sections 1 to 4, 7, 8), FIPS 180-4, the RIPEMD-160 reference, SEC 2, BIP16, BIP65, BIP112, BIP125, BIP141, BIP143, BIP147, BIP173, BIP340 plus test-vectors.csv, BIP341, BIP342, BIP350, BIP431, BOLT2, BOLT3, BOLT4, BOLT7, BOLT11, the Poon-Dryja paper, the Sphinx reference via BOLT4, CVE-2010-5139 and CVE-2018-17144 disclosures, Core PRs 7600 and 14247, and Core files (serialize.h, hash.h, uint256.h, pow.cpp, chainparams.cpp, primitives, consensus/merkle.cpp, merkleblock.cpp, script/interpreter.cpp, interpreter.h, script.h, consensus/tx_check.cpp, consensus/amount.h, policy/rbf.h, policy/packages.h, validation.cpp, chain.cpp, mempool-replacements.md).

Simplify only where labelled. Never teach anything wrong. Simplified puzzles carry a badge naming what was reduced.

## Files

- opcode-circuit/index.html, style.css, game.js: shell, theme, routes.
- opcode-circuit/engine/: store.js (localStorage in try/catch), score.js (stars), achieve.js (13 achievements).
- opcode-circuit/sim/: primitives.js (SHA-256, RIPEMD-160, secp256k1, Schnorr, bech32/m, base58check), interpreter.js (Script with trace), vectors.js (official vectors), toychain.js (tx, block, merkle, fees, bugs, taproot), lightning.js (HTLC, invoice, route, onion, channel).
- opcode-circuit/content/: chapters.js, puzzles1.js, puzzles2.js, views.js (widgets, debugger, sandbox).
- opcode-circuit/sw.js, manifest.webmanifest, icons/icon.svg (original, code drawn).
- test/game-*.test.mjs: vectors, interpreter, puzzles (reference passes, wrong fails), score, offline scan, page checks.

## How to add a puzzle

1. Pick one idea and the chapter it belongs to. 4 to 6 puzzles per chapter.
2. Add an entry to puzzles1.js (chapters 1 to 4) or puzzles2.js (5 to 8). Fields: id, ch, n, title, input (text, choice, script), widget, idea, briefing, prompt, check, reference, wrong (at least 2), hints (at least 2), par, scored, debrief. Add simplified when anything is reduced.
3. check() must be pure and fast. No mining inside check: verify, do not search. Your reference must earn 3 stars within par.
4. Reuse a widget from views.js when one fits (hashpad, pairhash, debugger, and the rest). Add a widget only for a new teaching tool. Widgets never touch the network or storage.
5. Run node --test test/game-puzzles.test.mjs, then npm test. The suite enforces reference passes, wrong fails, pars, hints, and sources.
6. Keep copy short. No em-dashes. Cite primary sources. Toy fixtures must read as toy (short hashes say shortened).
