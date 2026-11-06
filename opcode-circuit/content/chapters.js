// Opcode Circuit campaign: 8 chapters. Puzzles live in puzzles1.js (1 to 4)
// and puzzles2.js (5 to 8). Each puzzle carries its own debrief sources.
export const CHAPTERS = [
  {
    id: "bytes", num: 1, title: "Bytes",
    briefing: "Bitcoin speaks in bytes. Parse a real transaction layout: version, inputs, outputs, locktime. Mind the byte order.",
    sources: ["Whitepaper sections 1 and 2", "Core src/serialize.h (VarInt)", "Core src/hash.h (Hash256)", "Core src/uint256.h", "BIP173 checksum appendix"],
  },
  {
    id: "work", num: 2, title: "Hashes and work",
    briefing: "Hashing is easy. Finding a hash under target is work. Mine a toy block, then weigh chains and retarget difficulty.",
    sources: ["Whitepaper sections 3 and 4", "Core src/pow.cpp", "Core src/chainparams.cpp", "Core src/primitives/block.h"],
  },
  {
    id: "merkle", num: 3, title: "Merkle",
    briefing: "Thousands of txs, one 32 byte root. Build trees, prove inclusion like an SPV wallet, then spot a historic root trick.",
    sources: ["Whitepaper sections 7 and 8", "Core src/consensus/merkle.cpp", "Core src/merkleblock.cpp", "BIP37 (context, privacy deprecated)"],
  },
  {
    id: "script", num: 4, title: "Script",
    briefing: "Coins wear locks made of opcodes. Write unlocking scripts on a stack machine with an op by op debugger.",
    sources: ["Core src/script/interpreter.cpp EvalScript", "Core src/script/interpreter.h", "Core src/script/script.h", "BIP16 (P2SH)", "BIP65 (CLTV)", "BIP112 (CSV)"],
  },
  {
    id: "segwit", num: 5, title: "SegWit and Taproot",
    briefing: "Witnesses moved the sigs. Taproot hid the scripts. Verify Schnorr sigs and spend both key path and script path.",
    sources: ["BIP141", "BIP143", "BIP173", "BIP340 plus test vectors", "BIP341", "BIP342", "BIP350", "Core tapscript path"],
  },
  {
    id: "fees", num: 6, title: "Policy and fees",
    briefing: "Consensus says what is valid. Policy says what relays. Bump fees, rescue stuck parents, and fill one toy block.",
    sources: ["BIP125", "Core doc/policy/mempool-replacements.md", "Core src/policy/rbf.h", "Core src/policy/packages.h", "Core PR 7600 (ancestor feerate)"],
  },
  {
    id: "bugs", num: 7, title: "Consensus bugs",
    briefing: "Twice the chain printed money it should not have. Re-trace both bugs on simplified code, then write the patch.",
    sources: ["CVE-2010-5139 disclosure and block 74638", "CVE-2018-17144 bitcoincore.org notice 2018-09-20", "Core PR 14247", "Core src/consensus/tx_check.cpp", "Core src/consensus/amount.h"],
  },
  {
    id: "lightning", num: 8, title: "Lightning",
    briefing: "Millions of payments, two chain txs. Open a channel, lock HTLCs, route across a graph, then survive a jam.",
    sources: ["BOLT2", "BOLT3", "BOLT4", "BOLT7", "BOLT11", "Poon-Dryja paper", "lnd htlcswitch, onion, channeldb"],
  },
];
