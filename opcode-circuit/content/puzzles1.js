// Opcode Circuit puzzles, chapters 1 to 4. Each puzzle is one idea, solved
// by doing. check() is pure and fast: reference passes, wrong fails. Tests
// in test/game-puzzles.test.mjs enforce that for every puzzle here.
import { hexToBytes, bytesToHex, readU32LE, readVarInt, sha256, doubleSha256, hash160, segwitDecode, base58CheckDecode, bytesToBig, bigToBytes, pointMult, pointCompress, ecdsaSign, SECP_N, concat } from "../sim/primitives.js";
import { parseAsm, execute, executeP2SH, disassemble } from "../sim/interpreter.js";
import { answerBytes } from "../engine/score.js";
import { serializeTx, parseTx, txidOf, bitsToTarget, hashMeetsBits, blockHashOf, chainWork, retarget, merkleRoot, merkleVerify, flip } from "../sim/toychain.js";
const enc = new TextEncoder();
const cost = (bytes, ops = 0, sats = 0) => ({ bytes, ops, sats });
// Toy tx, version 2, 2 inputs, 1 output, locktime 750000.
const TX_HEX = "020000000211111111111111111111111111111111111111111111111111111111111111110000000047aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaafdffffff22222222222222222222222222222222222222222222222222222222222222220100000000feffffff015cc10000000000001976a914751e76e8199196d454941c45d1b3a323f1433bd688acb0710b00";
const TXID = "7e3298d3a2e3fdbd0f56445a98c4ff67f34834fec2331223613f66a31e99f72d";
export const PUZZLES1 = [
  {
    id: "1-1", ch: "bytes", n: 1, title: "Read the version", input: "text", widget: "none",
    idea: "Integers in Bitcoin are little endian.",
    briefing: "A raw tx starts with 4 version bytes. This one starts with 02000000. Bytes run little end first, so the lowest byte comes first. Type the version as a decimal number.",
    prompt: "Version bytes 02000000. Type the version number.",
    check(a) {
      const ok = a.trim() === "2";
      return { ok, ...cost(answerBytes(a)), message: ok ? "Version 2. The 02 sits in the lowest byte." : "Read the 4 bytes little end first." };
    },
    reference: "2", wrong: ["33554432", "0"], hints: ["Little endian: first byte is the lowest place.", "02000000 hex is 2, not 33554432."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/serialize.h (all ints are little endian)", "Whitepaper section 1 (tx fields)"],
  },
  {
    id: "1-2", ch: "bytes", n: 2, title: "Count with varints", input: "text", widget: "none",
    idea: "Counts use compact size: small counts take 1 byte.",
    briefing: "Counts in Bitcoin use compact size. Under 253 the count is one byte. 253 and up start with fd, fe, or ff, then the count little endian. Decode three counts: fc, then fd2c01, then fe70110100. Type the three numbers, comma separated.",
    prompt: "Decode fc, fd2c01, fe70110100. Type like 1,2,3.",
    check(a) {
      const ok = a.replace(/\s+/g, "") === "252,300,70000";
      return { ok, ...cost(answerBytes(a)), message: ok ? "252, 300, 70000. The fd boundary sits at 253." : "fc is plain. fd means 2 more bytes LE. fe means 4 more bytes LE." };
    },
    reference: "252,300,70000", wrong: ["252,300,7000", "253,300,70000"], hints: ["fc is below 253, so it is itself: 252.", "fd2c01: bytes 2c01 little endian is 300."],
    par: { bytes: 13, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/serialize.h WriteCompactSize", "Whitepaper section 1 (tx counts)"],
  },
  {
    id: "1-3", ch: "bytes", n: 3, title: "Find the locktime", input: "text", widget: "none",
    idea: "A tx ends with a 4 byte locktime.",
    briefing: "The last 4 bytes of a tx are its locktime: the earliest height or time it can confirm. Below sits a full toy tx in hex. The outputs end with an OP_CHECKSIG byte ac. Read the 4 bytes after it, little endian, and type the locktime.",
    prompt: "Toy tx:", code: TX_HEX, ask: "Type the locktime (decimal).",
    check(a) {
      const ok = a.trim() === "750000";
      return { ok, ...cost(answerBytes(a)), message: ok ? "750000. The tail bytes b0710b00 read little end first." : "Find the final ac, then read 4 bytes little endian." };
    },
    reference: "750000", wrong: ["2957395200", "0"], hints: ["Locktime is the last 4 bytes: b0710b00.", "b0710b00 little endian is 0x000b71b0, which is 750000."],
    par: { bytes: 3, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Whitepaper section 1 (tx anatomy)", "Core src/primitives/transaction.h CTransaction"],
  },
  {
    id: "1-4", ch: "bytes", n: 4, title: "Txid flip", input: "text", widget: "hashpad",
    idea: "A txid is the double SHA-256, shown backwards.",
    briefing: "Hash the whole tx twice with SHA-256. That gives the internal order. Wallets show it flipped, highest byte first. Use the hash pad: paste the tx hex, hash twice, flip. Type the txid.",
    prompt: "Toy tx:", code: TX_HEX, ask: "Type the txid (64 hex chars).",
    check(a) {
      const t = a.trim().toLowerCase();
      const ok = t === TXID;
      return { ok, ...cost(answerBytes(t)), message: ok ? "That is the txid. Internal order is the same bytes flipped." : "Hash twice, then reverse the 32 bytes for display." };
    },
    reference: TXID, wrong: ["7e3298d3a2e3fdbd0f56445a98c4ff67f34834fec2331223613f66a31e99f72e", [...TXID].reverse().join("")], hints: ["Double SHA-256 first: hash the hash.", "Then reverse byte order for display. Wallets show the flip."],
    par: { bytes: 32, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/hash.h Hash256", "Core src/uint256.h (display order)", "Whitepaper section 2 (tx hash chain)"],
  },
  {
    id: "1-5", ch: "bytes", n: 5, title: "Typo hunt", input: "choice", widget: "addrcheck",
    idea: "Address checksums catch typos.",
    briefing: "Two addresses. One has a one char typo. Paste each into the checker. Then say which is broken and why.",
    prompt: "A: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb. B: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4.",
    choices: ["A has a bad checksum, B is fine", "B has a bad checksum, A is fine", "Both are broken", "Both are fine"],
    check(a) {
      const ok = a === "A has a bad checksum, B is fine";
      return { ok, ...cost(1), message: ok ? "Right. Base58check caught the flipped last char." : "Run both through the checker and compare." };
    },
    reference: "A has a bad checksum, B is fine", wrong: ["B has a bad checksum, A is fine", "Both are fine"],
    hints: ["The checker says valid or names the failure.", "A ends in Nb. The real address ends in Na."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP173 checksum appendix (bech32)", "Original client base58check (double SHA first 4 bytes)"],
  },
  {
    id: "2-1", ch: "work", n: 1, title: "Avalanche", input: "text", widget: "hashpad",
    idea: "One flipped bit scrambles the whole digest.",
    briefing: "SHA-256 avalanches: a tiny input change flips about half the output bits. Type abc in the hash pad. Note the digest. Change it to abd. Count how many of the 64 hex chars differ. Type the count.",
    prompt: "abc versus abd. How many of 64 hex chars differ?",
    check(a) {
      const ok = a.trim() === "58";
      return { ok, ...cost(answerBytes(a)), message: ok ? "58 of 64. Mining leans on this: every nonce is a fresh lottery ticket." : "Hash abc, hash abd, compare char by char." };
    },
    reference: "58", wrong: ["6", "64"], hints: ["The pad shows both digests. Line them up.", "Only a few chars survive. Count the rest."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["FIPS 180-4 (SHA-256)", "Whitepaper section 4 (proof of work scans nonces)"],
  },
  {
    id: "2-2", ch: "work", n: 2, title: "Mine it", input: "text", widget: "mine",
    idea: "Mining scans nonces until the hash sits under target.",
    briefing: "A toy header waits: version 1, empty prev hash, toy merkle root, time 1700000000, bits 1f00ffff. Press Mine. The worker tries nonces from 0 and shows each miss. When a hash lands under target, type the winning nonce.",
    prompt: "Bits 1f00ffff. Type the winning nonce.",
    check(a) {
      const t = a.trim();
      if (!/^\d+$/.test(t)) return { ok: false, ...cost(answerBytes(t)), message: "Type digits only." };
      const h = { version: 1, prevHash: "00".repeat(32), merkleRoot: "22".repeat(32), time: 1700000000, bits: 0x1f00ffff, nonce: Number(t) >>> 0 };
      const hash = blockHashOf(h);
      const ok = hashMeetsBits(hash, h.bits);
      return { ok, ...cost(answerBytes(t)), message: ok ? `Nonce ${t} wins. Hash ${hash.slice(0, 16)} sits under target.` : "That hash is over target. Keep scanning." };
    },
    reference: "282853", wrong: ["0", "282854"], hints: ["Press Mine and watch the counter.", "The first win sits near nonce 282853."],
    par: { bytes: 3, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Whitepaper section 4 (proof of work)", "Core src/pow.cpp CheckProofOfWork", "Core src/primitives/block.h CBlockHeader"],
  },
  {
    id: "2-3", ch: "work", n: 3, title: "Retarget", input: "text", widget: "none",
    idea: "Difficulty follows the clock: fast blocks make it harder.",
    briefing: "Every 2016 blocks Bitcoin retargets. Target timespan is 2 weeks. If blocks came faster, the target shrinks (harder). Span is clamped to 1/4x to 4x. Prev bits are 1d00ffff. The last 2016 blocks took 7 days. Type the next bits as 8 hex chars.",
    prompt: "2016 blocks in 7 days. Type the next bits.",
    check(a) {
      const ok = a.trim().toLowerCase() === "1c7fff80";
      return { ok, ...cost(answerBytes(a)), message: ok ? "1c7fff80. Half the time, about twice as hard." : "New target is old times span over 2 weeks. Then back to bits." };
    },
    reference: "1c7fff80", wrong: ["1d00ffff", "1c00ffff"], hints: ["7 days over 14 days is one half.", "Halve the max target, then encode compact."],
    par: { bytes: 4, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/pow.cpp CalculateNextWorkRequired", "Whitepaper section 4 (difficulty adjustment)"],
  },
  {
    id: "2-4", ch: "work", n: 4, title: "Heavyweight", input: "choice", widget: "none",
    idea: "Nodes follow the most work, not the most blocks.",
    briefing: "Two forks. Fork A has 3 blocks at bits 1d00ffff. Fork B has 2 blocks at bits 1c00ffff. Each block adds 2^256 over (target plus 1). Which fork carries more total work?",
    prompt: "A: 3 blocks easy. B: 2 blocks harder. Which holds more work?",
    choices: ["Fork B: harder targets outweigh one extra block", "Fork A: more blocks always win", "Tie: work equals block count"],
    check(a) {
      const ok = a === "Fork B: harder targets outweigh one extra block";
      return { ok, ...cost(1), message: ok ? "Right. Work sums difficulty, not height." : "Weight each block by its target, then sum." };
    },
    reference: "Fork B: harder targets outweigh one extra block", wrong: ["Fork A: more blocks always win", "Tie: work equals block count"],
    hints: ["1c00ffff is about 256 times harder than 1d00ffff.", "Two B blocks beat three A blocks by far."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/chain.cpp GetBlockProof", "Whitepaper section 4 (longest chain means most work)"],
  },
  {
    id: "2-5", ch: "work", n: 5, title: "Order the chain", input: "text", widget: "none",
    idea: "Each header points at its parent hash.",
    briefing: "Three toy blocks, shuffled. Hashes are shortened for the puzzle. Block A: hash a1, prev 00. Block B: hash b2, prev a1. Block C: hash c3, prev b2. Shown in order C, A, B. Type the chain order oldest first, like A,B,C.",
    prompt: "Blocks: C(hash c3, prev b2). A(hash a1, prev 00). B(hash b2, prev a1). Type oldest first.",
    check(a) {
      const ok = a.replace(/\s+/g, "").toUpperCase() === "A,B,C";
      return { ok, ...cost(answerBytes(a)), message: ok ? "A points at genesis, B at A, C at B. One chain." : "Find the block whose prev no other hash matches. That is oldest." };
    },
    reference: "A,B,C", wrong: ["C,B,A", "B,A,C"], hints: ["Only A has a prev (00) that no block hashes to.", "Then follow prev links forward."],
    par: { bytes: 5, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Whitepaper section 3 (timestamp server links hashes)", "Core src/primitives/block.h (hashPrevBlock)"],
  },
  {
    id: "3-1", ch: "merkle", n: 1, title: "Build the root", input: "text", widget: "pairhash",
    idea: "Pairs hash up, level by level, to one root.",
    briefing: "Four leaves. Hash each pair with double SHA-256, then hash the two results. The pair tool hashes left plus right. Leaves: A 8102aa5c6c285c306ae4cbb89c5467a9b9166ca7795ce70f4bc33b0dcefcd8b7. B 190cbcec62fcf5edf85e2e39f32e00673aeca69e65d5f7d9d2a96a87fabbf71d. C ec18d2aa48661aaf6263afd3be0f76d7a2bac183c7aaca0bd19c47ada8c6a45c. D fc476d1224822ad61f80b1c433cfcbb3af96d1e604f5ae7d9668a1948557a2fa. Type the root.",
    prompt: "Type the 4 leaf root (64 hex chars).",
    check(a) {
      const ok = a.trim().toLowerCase() === "7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9";
      return { ok, ...cost(answerBytes(a)), message: ok ? "Root built. Every tx in the block folds into those 32 bytes." : "Hash A+B, hash C+D, then hash the two results." };
    },
    reference: "7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9", wrong: ["5d32bae6c2390d15a78a02a0b1e27d7b691a32c5d95fbda9e7753572d4bd6c06", "00".repeat(32)],
    hints: ["Double SHA each pair, left first.", "Two level one hashes, then one root hash. Three hashes total."],
    par: { bytes: 32, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/consensus/merkle.cpp BlockMerkleRoot", "Whitepaper section 7 (merkle trees)"],
  },
  {
    id: "3-2", ch: "merkle", n: 2, title: "Odd one out", input: "text", widget: "pairhash",
    idea: "An odd level duplicates its last leaf.",
    briefing: "Three leaves: the same A, B, C as before. A level with an odd count duplicates its last leaf before pairing. So the level hashes A+B, then C+C. Type the 3 leaf root.",
    prompt: "Leaves A, B, C. Type the root (64 hex chars).",
    check(a) {
      const ok = a.trim().toLowerCase() === "5d32bae6c2390d15a78a02a0b1e27d7b691a32c5d95fbda9e7753572d4bd6c06";
      return { ok, ...cost(answerBytes(a)), message: ok ? "Root built. C paired with itself. This rule matters in puzzle 3-5." : "Hash A+B, hash C+C, then hash the pair." };
    },
    reference: "5d32bae6c2390d15a78a02a0b1e27d7b691a32c5d95fbda9e7753572d4bd6c06", wrong: ["7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9", "00".repeat(32)],
    hints: ["Odd count: C pairs with C.", "Same three hashes as 3-1, new shape."],
    par: { bytes: 32, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/consensus/merkle.cpp (duplicate last on odd levels)", "Whitepaper section 7"],
  },
  {
    id: "3-3", ch: "merkle", n: 3, title: "SPV check", input: "text", widget: "pairhash",
    idea: "A branch plus an index recomputes the root.",
    briefing: "An SPV wallet holds headers, not txs. To check leaf B it asks for a branch: the siblings up the tree plus the leaf index. Leaf B is index 1. Branch: 8102aa5c6c285c306ae4cbb89c5467a9b9166ca7795ce70f4bc33b0dcefcd8b7, then e8f8083b02b364e79d7880481ae15fb46b62d8cb0e3bbaa7f9f71017c96b7fee. Odd index hashes on the right first. Recompute and type the root.",
    prompt: "Leaf B, index 1, two siblings. Type the root they prove.",
    check(a) {
      const ok = a.trim().toLowerCase() === "7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9";
      return { ok, ...cost(answerBytes(a)), message: ok ? "Proven. Two hashes stand in for the whole block." : "Index 1 is odd: hash sibling plus leaf. Then hash result plus second sibling." };
    },
    reference: "7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9", wrong: ["5d32bae6c2390d15a78a02a0b1e27d7b691a32c5d95fbda9e7753572d4bd6c06", "00".repeat(32)],
    hints: ["First: H(sibling A plus leaf B). Index 1 goes right.", "Second: H(that plus sibling CD). Index halves to 0, so result goes left."],
    par: { bytes: 32, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Whitepaper section 8 (simplified payment verification)", "Core src/merkleblock.cpp (partial proofs)"],
  },
  {
    id: "3-4", ch: "merkle", n: 4, title: "Tamper", input: "text", widget: "pairhash",
    idea: "One changed leaf changes the root.",
    briefing: "Same 4 leaves, but B is now the hash of tx-B (capital B) instead of tx-b: a216d2903c3f45c8ec7324ff4575e87cbf0864a754d252a86044625dd5404ab0. One capital letter. Rebuild the root with the pair tool and type it.",
    prompt: "Type the tampered root (64 hex chars).",
    check(a) {
      const ok = a.trim().toLowerCase() === "e19905a1b4b04e87df854d609291984af04ddc1fc1d5cf46fa42924ef13ff294";
      return { ok, ...cost(answerBytes(a)), message: ok ? "New root. Nothing in common with the old one. That is tamper evidence." : "Rebuild A+B, C+D, then the pair, with the new B." };
    },
    reference: "e19905a1b4b04e87df854d609291984af04ddc1fc1d5cf46fa42924ef13ff294", wrong: ["7879b7935145ee5613a8bceb75205f2949f702d724aa1423d42d5e9b7807dca9", "00".repeat(32)],
    hints: ["Only the B leaf changed. A, C, D stay.", "The level one hash A+B changes, so the root changes."],
    par: { bytes: 32, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Whitepaper section 7 (any change breaks the chain of hashes)"],
  },
  {
    id: "3-5", ch: "merkle", n: 5, title: "The duplicate trick", input: "choice", widget: "none",
    idea: "Duplicating the last leaf lets two tx counts share one root.",
    briefing: "Block X lists 3 txs: A, B, C. Block Y lists 4 txs: A, B, C, C (C repeated). Both build the same root, because the 3 leaf tree duplicates C anyway. In 2012 this trick fooled SPV wallets about tx counts. What went wrong?",
    prompt: "Same root, 3 txs versus 4 txs. What happened?",
    choices: ["Same leaves either way, so the count is ambiguous", "SHA-256 collided on two txs", "The roots differ, recompute", "Nothing: counts never matter"],
    check(a) {
      const ok = a === "Same leaves either way, so the count is ambiguous";
      return { ok, ...cost(1), message: ok ? "Right. The fix rejects blocks whose root could come from fewer txs." : "Think about what the odd rule does to C." };
    },
    reference: "Same leaves either way, so the count is ambiguous", wrong: ["SHA-256 collided on two txs", "Nothing: counts never matter"],
    hints: ["3 leaves hash as A+B, C+C.", "4 leaves A,B,C,C hash exactly the same way."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["CVE-2012-2459 disclosure", "Core src/consensus/merkle.cpp (mutated root check)"],
  },
  {
    id: "4-1", ch: "script", n: 1, title: "Unlock P2PKH", input: "script", widget: "debugger",
    idea: "The unlock pushes sig first, then pubkey.",
    briefing: "The lock is OP_DUP OP_HASH160 <5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69> OP_EQUALVERIFY OP_CHECKSIG. It pays to key 025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc. The sig for toy hash 1ee4dd291cec0b0a904550d3759af9bb1f11659523cd531892ccce3ba5fc110b is 30440220774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb022008e761e79824132b8f5bd8b4af8c5067c100b961da059cf1966f7c4db4cb0c9f01. Write the unlocking script: two pushes in angle brackets. Run it in the debugger first.",
    prompt: "Lock: OP_DUP OP_HASH160 <5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69> OP_EQUALVERIFY OP_CHECKSIG. Write the unlock.",
    lock: "OP_DUP OP_HASH160 <5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69> OP_EQUALVERIFY OP_CHECKSIG",
    ctx: { msgHash: "1ee4dd291cec0b0a904550d3759af9bb1f11659523cd531892ccce3ba5fc110b" },
    check(a) {
      let pushes;
      try {
        const raw = parseAsm(a);
        const items = disassemble(raw);
        if (!items.every((o) => o.push !== undefined) || items.length !== 2) {
          return { ok: false, ...cost(raw.length), message: "The unlock must be exactly two pushes." };
        }
        pushes = items.map((o) => o.push);
      } catch (e) { return { ok: false, ...cost(answerBytes(a)), message: e.message }; }
      const lock = parseAsm("OP_DUP OP_HASH160 <5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69> OP_EQUALVERIFY OP_CHECKSIG");
      const r = execute(lock, pushes, { msgHash: hexToBytes("1ee4dd291cec0b0a904550d3759af9bb1f11659523cd531892ccce3ba5fc110b") });
      return { ok: r.ok, ...cost(pushes.reduce((s, b) => s + b.length + 1, 0), r.ops), message: r.ok ? "Unlocked. Sig first, pubkey second, every time." : `Locked: ${r.error}` };
    },
    reference: "<30440220774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb022008e761e79824132b8f5bd8b4af8c5067c100b961da059cf1966f7c4db4cb0c9f01> <025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc>",
    wrong: ["<025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc> <30440220774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb022008e761e79824132b8f5bd8b4af8c5067c100b961da059cf1966f7c4db4cb0c9f01>", "<00>"],
    hints: ["Two pushes: <sig> then <pubkey>.", "Order matters. The lock dups the top item first."],
    par: { bytes: 110, ops: 4, sats: 0 }, scored: ["bytes", "ops"],
    debrief: ["Core src/script/interpreter.cpp EvalScript", "Whitepaper section 2 (owner signs the hash)"],
  },
  {
    id: "4-2", ch: "script", n: 2, title: "Open the vault", input: "script", widget: "debugger",
    idea: "P2SH checks the redeem hash, then runs the redeem script.",
    briefing: "The program is OP_HASH160 <15fc0754e73eb85d1cbce08786fadb7320ecb8dc> OP_EQUAL. The redeem script is 2 <0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798> <02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5> <02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9> 3 OP_CHECKMULTISIG. Toy hash 795e6013e25d122f539685331821c5b19e4ea7d89450a28bffc82e3605c1b8a2. Sig A 30440220352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5022065672313e55ec14ef83aedbe2d79ab00e588f7400ddeb60d8905013a941d580a01. Sig C 30440220421f5fc9a21065445c96fdb91c0c1e2f2431741c72713b4b99ddcb316f31e9fc02203748e2ef3cb3b72eb5649187582b5b9fb26b306b5f4684f3fc6f1ee306738c6801. Write the scriptSig: dummy, two sigs, redeem script as one hex push.",
    prompt: "Program: OP_HASH160 <15fc0754e73eb85d1cbce08786fadb7320ecb8dc> OP_EQUAL. Write the scriptSig.",
    lock: "OP_HASH160 <15fc0754e73eb85d1cbce08786fadb7320ecb8dc> OP_EQUAL",
    ctx: { msgHash: "795e6013e25d122f539685331821c5b19e4ea7d89450a28bffc82e3605c1b8a2" },
    check(a) {
      let raw;
      try { raw = parseAsm(a); }
      catch (e) { return { ok: false, ...cost(answerBytes(a)), message: e.message }; }
      const prog = parseAsm("OP_HASH160 <15fc0754e73eb85d1cbce08786fadb7320ecb8dc> OP_EQUAL");
      const r = executeP2SH(raw, prog, { msgHash: hexToBytes("795e6013e25d122f539685331821c5b19e4ea7d89450a28bffc82e3605c1b8a2") });
      return { ok: r.ok, ...cost(raw.length, r.ops), message: r.ok ? "Vault open. Hash matched, then 2 of 3 verified." : `Locked: ${r.error}` };
    },
    reference: "<> <30440220352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5022065672313e55ec14ef83aedbe2d79ab00e588f7400ddeb60d8905013a941d580a01> <30440220421f5fc9a21065445c96fdb91c0c1e2f2431741c72713b4b99ddcb316f31e9fc02203748e2ef3cb3b72eb5649187582b5b9fb26b306b5f4684f3fc6f1ee306738c6801> <52210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817982102c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee52102f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f953ae>",
    wrong: ["<30440220352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5022065672313e55ec14ef83aedbe2d79ab00e588f7400ddeb60d8905013a941d580a01> <00>", "<> <00>"],
    hints: ["Four pushes: empty dummy, sig, sig, redeem script bytes.", "The redeem script push is the long hex at the end of the briefing."],
    par: { bytes: 260, ops: 25, sats: 0 }, scored: ["bytes", "ops"],
    debrief: ["BIP16 (pay to script hash)", "Core src/script/interpreter.cpp VerifyScript P2SH path"],
  },
  {
    id: "4-3", ch: "script", n: 3, title: "Too early", input: "text", widget: "cltv",
    idea: "CLTV freezes coins until a height or time.",
    briefing: "The lock is 1000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE. It spends only when the tx locktime reaches 1000. Set heights in the runner and watch it fail, then pass. Type the smallest height that spends.",
    prompt: "Lock: 1000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE. Smallest spending height?",
    lock: "1000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE",
    check(a) {
      const ok = a.trim() === "1000";
      return { ok, ...cost(answerBytes(a)), message: ok ? "1000. At 999 the timelock holds." : "Run heights in the widget. Find where fail turns to pass." };
    },
    reference: "1000", wrong: ["999", "1001"], hints: ["999 fails, 1000 passes.", "Smallest means the exact boundary."],
    par: { bytes: 2, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP65 (CHECKLOCKTIMEVERIFY)", "Core src/script/interpreter.cpp EvalScript CLTV branch"],
  },
  {
    id: "4-4", ch: "script", n: 4, title: "Two of three", input: "script", widget: "signer",
    idea: "Multisig pops a dummy, then m sigs for n keys.",
    briefing: "The lock is 2 <0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798> <02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5> <02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9> 3 OP_CHECKMULTISIG. Toy hash 68e08e4e16253c2cf209b1e0b50c9594e7ada600a9171da5f35b751b3320dfb6. Press the signer buttons to mint sigs, then write the unlock: dummy first.",
    prompt: "2 of 3 lock. Write the unlock with any two sigs.",
    lock: "2 <0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798> <02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5> <02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9> 3 OP_CHECKMULTISIG",
    ctx: { msgHash: "68e08e4e16253c2cf209b1e0b50c9594e7ada600a9171da5f35b751b3320dfb6" },
    check(a) {
      let raw;
      try { raw = parseAsm(a); }
      catch (e) { return { ok: false, ...cost(answerBytes(a)), message: e.message }; }
      const lock = parseAsm("2 <0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798> <02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5> <02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9> 3 OP_CHECKMULTISIG");
      const items = disassemble(raw);
      const r = execute(lock, items.map((o) => o.push || new Uint8Array(0)), { msgHash: hexToBytes("68e08e4e16253c2cf209b1e0b50c9594e7ada600a9171da5f35b751b3320dfb6") });
      return { ok: r.ok, ...cost(raw.length, r.ops), message: r.ok ? "Two valid sigs in key order. The dummy is a historic quirk." : `Locked: ${r.error}` };
    },
    reference: "<> <304402206a245bf6dc698504c89a20cfded60853152b695336c28063b61c65cbd269e6b4022048df2054ce049ae0926861a2996a683072239c99136c57bd2673f62bca8e594e01> <304402202fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f022023d1e222650492283811aa43ad8f7d91ec4acc576670ab58944a9f46d85a8bb001>",
    wrong: ["<304402206a245bf6dc698504c89a20cfded60853152b695336c28063b61c65cbd269e6b4022048df2054ce049ae0926861a2996a683072239c99136c57bd2673f62bca8e594e01> <304402202fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f022023d1e222650492283811aa43ad8f7d91ec4acc576670ab58944a9f46d85a8bb001>", "<> <00> <00>"],
    hints: ["Start with an empty push <>. The old bug eats one item.", "Sigs must follow key order: A before B before C."],
    par: { bytes: 150, ops: 20, sats: 0 }, scored: ["bytes", "ops"],
    debrief: ["Core src/script/interpreter.cpp EvalScript CHECKMULTISIG", "BIP147 (dummy must be empty)"],
  },
  {
    id: "4-5", ch: "script", n: 5, title: "Find the bug", input: "text", widget: "debugger",
    idea: "The debugger shows the exact failing op.",
    briefing: "Someone unlocked the 4-1 lock with the pushes swapped: pubkey first, sig second. Step through in the debugger and watch the stack die. Type the name of the op that fails.",
    prompt: "Swapped unlock on the 4-1 lock. Which op fails?",
    lock: "OP_DUP OP_HASH160 <5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69> OP_EQUALVERIFY OP_CHECKSIG",
    preset: "<025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc> <30440220774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb022008e761e79824132b8f5bd8b4af8c5067c100b961da059cf1966f7c4db4cb0c9f01>",
    ctx: { msgHash: "1ee4dd291cec0b0a904550d3759af9bb1f11659523cd531892ccce3ba5fc110b" },
    check(a) {
      const t = a.trim().toUpperCase().replace(/^OP_/, "");
      const ok = t === "EQUALVERIFY" || t === "OP_EQUALVERIFY";
      return { ok, ...cost(answerBytes(a)), message: ok ? "EQUALVERIFY. The hashed sig never equals the pubkey hash." : "Step op by op. The trace stops at the killer." };
    },
    reference: "OP_EQUALVERIFY", wrong: ["OP_CHECKSIG", "OP_DUP"], hints: ["OP_DUP copies the sig, not the key.", "HASH160 of a sig matches nothing."],
    par: { bytes: 14, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/script/interpreter.cpp (error paths)", "BIP16 test habits (vectors for failure)"],
  },
  {
    id: "4-6", ch: "script", n: 6, title: "Hashlock", input: "script", widget: "hexpad",
    idea: "A secret preimage opens a hash lock.",
    briefing: "The lock is OP_SHA256 <47cc47352d962126b43cad56da4c42739a45f6e6600ac36fb81731575f96a536> OP_EQUAL. The secret is the text bravo-seven-secret. Hashlocks power HTLCs in chapter 8. Turn the secret into hex in the pad, then write the one push unlock.",
    prompt: "Lock: OP_SHA256 <47cc47352d962126b43cad56da4c42739a45f6e6600ac36fb81731575f96a536> OP_EQUAL. Write the unlock.",
    lock: "OP_SHA256 <47cc47352d962126b43cad56da4c42739a45f6e6600ac36fb81731575f96a536> OP_EQUAL",
    check(a) {
      let raw;
      try { raw = parseAsm(a); }
      catch (e) { return { ok: false, ...cost(answerBytes(a)), message: e.message }; }
      const items = disassemble(raw);
      if (items.length !== 1 || items[0].push === undefined) return { ok: false, ...cost(raw.length), message: "One push: the secret bytes." };
      const lock = parseAsm("OP_SHA256 <47cc47352d962126b43cad56da4c42739a45f6e6600ac36fb81731575f96a536> OP_EQUAL");
      const r = execute(lock, [items[0].push], {});
      return { ok: r.ok, ...cost(raw.length, r.ops), message: r.ok ? "The preimage hashes to the lock. Same trick as Lightning HTLCs." : `Locked: ${r.error}` };
    },
    reference: "<627261766f2d736576656e2d736563726574>", wrong: ["<627261766f2d736576656e2d736563726575>", "<>"],
    hints: ["Text to hex: each letter is one byte.", "bravo-seven-secret is 18 bytes."],
    par: { bytes: 20, ops: 2, sats: 0 }, scored: ["bytes", "ops"],
    debrief: ["Core src/script/interpreter.cpp (crypto ops)", "BOLT3 HTLC scripts (preview of chapter 8)"],
  },
];
