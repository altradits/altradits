# Opcode Circuit

A Bitcoin puzzle game for adult developers. Build and break things on a simulated chain that runs fully in the browser.

Name check: no game or Bitcoin product uses "Opcode Circuit". Web search finds only the generic technical phrase in zkEVM and covenant writeups. Zero word overlap with the kids game Sats Safari. Note: the name is unrelated to the internal AI circuit breaker in lib/ai.js.

Path: /opcode-circuit/. Folder: opcode-circuit/. Offline after load. Toy chain only. No real keys.

Chapters 1 to 4 (shipped):

1. Bytes: 1-1 version bytes, 1-2 varints, 1-3 locktime, 1-4 txid flip, 1-5 typo hunt.
2. Hashes and work: 2-1 avalanche, 2-2 mine it, 2-3 retarget, 2-4 heavyweight fork, 2-5 order the chain.
3. Merkle: 3-1 build the root, 3-2 odd leaf, 3-3 SPV check, 3-4 tamper, 3-5 CVE-2012-2459 duplicate trick.
4. Script: 4-1 P2PKH unlock, 4-2 P2SH vault, 4-3 CLTV too early, 4-4 two of three, 4-5 find the bug, 4-6 hashlock.

Chapters 5 to 8 (next PR): 5. SegWit and Taproot. 6. Policy and fees. 7. Consensus bugs. 8. Lightning.

Sources per puzzle sit on its debrief card. Full list plus how to add a puzzle ships with the polish PR.
