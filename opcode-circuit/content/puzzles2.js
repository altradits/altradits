// Opcode Circuit puzzles, chapters 5 to 8. Same contract as puzzles1.js:
// check() is pure, reference passes within par, wrong fails.
import { hexToBytes, bytesToHex, sha256, taggedHash, concat, equalBytes, bytesToBig, bigToBytes, pointMult, schnorrVerify, segwitDecode, base58CheckDecode } from "../sim/primitives.js";
import { parseAsm, execute, disassemble } from "../sim/interpreter.js";
import { txWeight, txVsize, serializeTx, packageRate, pickForBlock, checkRBF, checkCarveout, vulnerableSum, patchedSum, patchedInputs, MAX_MONEY, taprootOutputKey, tapLeafHash, tapBranchHash, verifyControlPath, SIGHASH } from "../sim/toychain.js";
import { fundingWitnessScript, p2wshScript, paymentHash, htlcClaim, htlcRefund, invoiceDecode, findRoute, toyOnionPeel, channelOpen, channelAddHTLC, channelCommit, channelRevoke, channelSettle, jammingBlocked } from "../sim/lightning.js";
const cost = (bytes, ops = 0, sats = 0) => ({ bytes, ops, sats });
export const PUZZLES2 = [
  {
    id: "5-1", ch: "segwit", n: 1, title: "Weight math", input: "text", widget: "none",
    idea: "Witness bytes count 1 unit, base bytes count 4.",
    briefing: "SegWit weighs a tx: base bytes count 4 weight units, witness bytes count 1. vsize is weight divided by 4, rounded up. A P2WPKH spend has 110 base bytes and 108 witness bytes. Type the weight, a comma, then the vsize.",
    prompt: "110 base bytes, 108 witness bytes. Type weight,vsize.",
    check(a) {
      const ok = a.replace(/\s+/g, "") === "548,137";
      return { ok, ...cost(a.trim().length), message: ok ? "548 WU, 137 vB. The witness rides at quarter price." : "Weight is base times 4 plus witness. vsize rounds up." };
    },
    reference: "548,137", wrong: ["656,164", "548,138"], hints: ["110 times 4 is 440, plus 108 is 548.", "548 over 4 is exactly 137."],
    par: { bytes: 7, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP141 (weight and vsize)", "Core src/consensus/validation.h GetBlockWeight"],
  },
  {
    id: "5-2", ch: "segwit", n: 2, title: "Address forensics", input: "choice", widget: "segwit",
    idea: "Version 0 uses bech32, version 1 and up use bech32m.",
    briefing: "Two addresses. A: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4. B: bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0. Paste each into the decoder. Then pick the true statement.",
    prompt: "A is bc1q..., B is bc1p.... Which is true?",
    choices: ["A is v0 bech32, B is v1 bech32m", "Both are bech32", "A is v1, B is v0", "B fails its checksum"],
    check(a) {
      const ok = a === "A is v0 bech32, B is v1 bech32m";
      return { ok, ...cost(1), message: ok ? "Right. The version byte picks the checksum." : "Decode both and read version plus encoding." };
    },
    reference: "A is v0 bech32, B is v1 bech32m", wrong: ["Both are bech32", "B fails its checksum"],
    hints: ["The decoder prints version and encoding.", "bc1q is v0. bc1p is v1."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP173 (bech32, v0)", "BIP350 (bech32m, v1 plus)"],
  },
  {
    id: "5-3", ch: "segwit", n: 3, title: "Schnorr verify", input: "choice", widget: "schnorr",
    idea: "One flipped sig bit fails verification.",
    briefing: "BIP340 test vector 0. Pubkey F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9. Message 32 zero bytes. Four candidate sigs; one is the official vector, three have one flipped bit. Paste each into the checker. Pick the one that verifies.",
    prompt: "Which 64 byte sig verifies?",
    choices: [
      "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
      "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C1",
      "E807831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
      "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0 with pubkey bit flipped",
    ],
    check(a) {
      const ok = a.startsWith("E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0") && a.length === 128;
      return { ok, ...cost(1), message: ok ? "That is BIP340 vector 0. Every tampered copy fails." : "Paste each sig with the given pubkey and message." };
    },
    reference: "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
    wrong: ["E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C1", "E807831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0"],
    hints: ["Only the exact vector verifies.", "The second choice flips the last nibble."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP340 test-vectors.csv vector 0", "BIP340 reference.py verify path"],
  },
  {
    id: "5-4", ch: "segwit", n: 4, title: "Key path spend", input: "text", widget: "taptweak",
    idea: "The output key is the internal key plus the TapTweak.",
    briefing: "Taproot key path: Q equals P plus H_TapTweak(P) times G, with no script. Internal key F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9. Use the tweak tool with an empty root. Type the output x (64 hex).",
    prompt: "Internal F9308A01...360F9, no script. Type output x.",
    check(a) {
      const ok = a.trim().toLowerCase() === "418c46636d9e1a683f58e35b42336e776fdcc3b2d4e39e7a0bf1ab0716e3c5fa";
      return { ok, ...cost(a.trim().length), message: ok ? "Key path derived. A sig for Q spends with no script shown." : "Tweak with an empty merkle root, then read x." };
    },
    reference: "418c46636d9e1a683f58e35b42336e776fdcc3b2d4e39e7a0bf1ab0716e3c5fa", wrong: ["f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9", "00".repeat(32)],
    hints: ["Empty root means the tweak commits to key path only.", "Read the x of P plus t times G."],
    par: { bytes: 64, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP341 (key path spending)", "BIP340 tagged hash TapTweak"],
  },
  {
    id: "5-5", ch: "segwit", n: 5, title: "Script path spend", input: "choice", widget: "controlblock",
    idea: "A control block proves the leaf sits under the output key.",
    briefing: "Same internal key. Leaf hash a85b2107f791b26a84e7586c28cec7cb61202ed3d01944d832500f363782d675. Output x 679489af0cbf6c97bc15fc3ca5f6b4f264cc0a903715bbdf3fabadaece3405c8. Two candidate siblings. Run each through the control tool. Which sibling completes a valid path?",
    prompt: "Which sibling verifies against the output key?",
    choices: ["c91e40cb06ad90f0a4556fcc54d9489f7f59cca27494ae05ffe411ee9fdaaed7", "c91e40cb06ad90f0a4556fcc54d9489f7f59cca27494ae05ffe411ee9fdaaed8", "Neither verifies"],
    check(a) {
      const ok = a === "c91e40cb06ad90f0a4556fcc54d9489f7f59cca27494ae05ffe411ee9fdaaed7";
      return { ok, ...cost(1), message: ok ? "Valid path. The leaf, the sibling, and the tweak meet at Q." : "Hash leaf with each sibling, tweak, compare x." };
    },
    reference: "c91e40cb06ad90f0a4556fcc54d9489f7f59cca27494ae05ffe411ee9fdaaed7", wrong: ["c91e40cb06ad90f0a4556fcc54d9489f7f59cca27494ae05ffe411ee9fdaaed8", "Neither verifies"],
    hints: ["One sibling is flipped in the last nibble.", "TapBranch sorts the pair, then TapTweak commits."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP341 (control block verification)", "BIP342 (TapBranch and TapLeaf tags)"],
  },
  {
    id: "5-6", ch: "segwit", n: 6, title: "Tapscript add", input: "script", widget: "debugger",
    idea: "CHECKSIGADD accumulates sigs where multisig popped them.",
    briefing: "The tapscript is 0 OP_CHECKSIGADD OP_CHECKSIGADD 2 OP_NUMEQUAL. It starts the counter at 0, adds one per valid Schnorr sig, and wants 2. Tap message 63aca20e231fdb00082ae0da33704fd89f3f6b7de5ad3529a3ab145dc2937825. Sig A a029735b4d8157b2bf8123281163fd029a3bc0924cfdd16786819c455ebad9ff48e77985819eb7605f2ede7458192a4bcef3710dd7869cbd553e3414ef42b528 for key f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9. Sig B 54e3b7976e988fa6f120f1e720d63f7bb675ef7d3e1e492adcf2df1e98290fc4df67cec4ec545d73324bd3a08273e6abcefa5ba8b802eafef4db66ea130fc0f1 for key 2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4. Write the witness: sig, key, sig, key.",
    prompt: "Tapscript: 0 OP_CHECKSIGADD OP_CHECKSIGADD 2 OP_NUMEQUAL. Write the witness.",
    lock: "0 OP_CHECKSIGADD OP_CHECKSIGADD 2 OP_NUMEQUAL",
    ctx: { tapMsg: "63aca20e231fdb00082ae0da33704fd89f3f6b7de5ad3529a3ab145dc2937825" },
    check(a) {
      let raw;
      try { raw = parseAsm(a); }
      catch (e) { return { ok: false, ...cost(a.length), message: e.message }; }
      const items = disassemble(raw);
      if (!items.every((o) => o.push !== undefined) || items.length !== 4) return { ok: false, ...cost(raw.length), message: "Four pushes: sig, key, sig, key." };
      const r = execute(parseAsm("0 OP_CHECKSIGADD OP_CHECKSIGADD 2 OP_NUMEQUAL"), items.map((o) => o.push), { tapMsg: hexToBytes("63aca20e231fdb00082ae0da33704fd89f3f6b7de5ad3529a3ab145dc2937825") });
      return { ok: r.ok, ...cost(raw.length, r.ops), message: r.ok ? "Counter reached 2. Batch friendly, unlike CHECKMULTISIG." : `Locked: ${r.error}` };
    },
    reference: "<a029735b4d8157b2bf8123281163fd029a3bc0924cfdd16786819c455ebad9ff48e77985819eb7605f2ede7458192a4bcef3710dd7869cbd553e3414ef42b528> <f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9> <54e3b7976e988fa6f120f1e720d63f7bb675ef7d3e1e492adcf2df1e98290fc4df67cec4ec545d73324bd3a08273e6abcefa5ba8b802eafef4db66ea130fc0f1> <2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4>",
    wrong: ["<a029735b4d8157b2bf8123281163fd029a3bc0924cfdd16786819c455ebad9ff48e77985819eb7605f2ede7458192a4bcef3710dd7869cbd553e3414ef42b528> <f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9>", "<00> <00> <00> <00>"],
    hints: ["Order: sig A, key A, sig B, key B.", "The counter starts at 0 and each valid pair adds 1."],
    par: { bytes: 200, ops: 4, sats: 0 }, scored: ["bytes", "ops"],
    debrief: ["BIP342 (OP_CHECKSIGADD)", "BIP340 (Schnorr in Tapscript)"],
  },
  {
    id: "6-1", ch: "fees", n: 1, title: "Pick the block", input: "text", widget: "feerate",
    idea: "Miners order by package rate, ancestors included.",
    briefing: "Five candidates. A: fee 2000, vsize 200, no ancestors. B: fee 500, vsize 200, one ancestor fee 100 vsize 200. C: fee 3000, vsize 250, no ancestors. D: fee 100, vsize 100, one ancestor fee 5000 vsize 400. E: fee 900, vsize 100, no ancestors. Rate is package fee over package vsize. Type the five ids best first, like A,B,C,D,E.",
    prompt: "Type the ids best package rate first.",
    check(a) {
      const ok = a.replace(/\s+/g, "").toUpperCase() === "C,D,A,E,B";
      return { ok, ...cost(a.trim().length), message: ok ? "C 12, D 10.2, A 10, E 9, B 1.5. D rides its rich ancestor." : "Add each ancestor fee and size before dividing." };
    },
    reference: "C,D,A,E,B", wrong: ["C,A,E,D,B", "A,B,C,D,E"], hints: ["D package is 5100 over 500: 10.2.", "B package is 600 over 400: 1.5, last."],
    par: { bytes: 9, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core PR 7600 (ancestor feerate mining)", "Core src/policy/packages.h"],
  },
  {
    id: "6-2", ch: "fees", n: 2, title: "RBF bump", input: "choice", widget: "rbf",
    idea: "A replacement must pay more, absolutely and by rate.",
    briefing: "Mempool holds M: fee 1000, vsize 200, signals BIP125. Incremental relay fee is 1 sat per vB. Three replacements, none adding parents. R1: fee 1200, vsize 200. R2: fee 1100, vsize 300. R3: fee 2000, vsize 200, but spends a new unconfirmed parent. Run each in the rule checker. Which passes BIP125?",
    prompt: "Which replacement passes?",
    choices: ["R1: higher fee, higher rate, no new parents", "R2: higher fee, bigger size", "R3: highest fee, new parent"],
    check(a) {
      const ok = a === "R1: higher fee, higher rate, no new parents";
      return { ok, ...cost(1), message: ok ? "R1 passes every rule. R2 fails the rate, R3 fails the parent rule." : "Check absolute fee, then rate, then parents." };
    },
    reference: "R1: higher fee, higher rate, no new parents", wrong: ["R2: higher fee, bigger size", "R3: highest fee, new parent"],
    hints: ["R2 rate is 3.7, below M rate 5.", "R3 drags in an unconfirmed parent."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BIP125 (opt in RBF rules)", "Core doc/policy/mempool-replacements.md"],
  },
  {
    id: "6-3", ch: "fees", n: 3, title: "CPFP rescue", input: "choice", widget: "feerate",
    idea: "A rich child can drag a poor parent into a block.",
    briefing: "Parent P is stuck: fee 100, vsize 200, no children yet. Carveout allows one extra child up to 1000 vB. Target package rate is 5 sat per vB. C1: fee 1900, vsize 200. C2: fee 1900, vsize 2000. C3: fee 5000, vsize 200, but P already has an extra child in this scenario. Which child rescues P?",
    prompt: "Which child reaches rate 5 within carveout?",
    choices: ["C1: package 2000 over 400", "C2: big fee, big size", "C3: huge fee, second child"],
    check(a) {
      const ok = a === "C1: package 2000 over 400";
      return { ok, ...cost(1), message: ok ? "C1 lands exactly 5. C2 is too fat, C3 breaks carveout." : "Package rate first, then carveout size and count." };
    },
    reference: "C1: package 2000 over 400", wrong: ["C2: big fee, big size", "C3: huge fee, second child"],
    hints: ["C1 package: 2000 over 400 is 5.", "C2 package is under 1. C3 is a second child."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/policy/packages.h (package CPFP)", "Optech CPFP carveout topic"],
  },
  {
    id: "6-4", ch: "fees", n: 4, title: "Eviction", input: "choice", widget: "none",
    idea: "Policy rejects what consensus would allow.",
    briefing: "A tx pays 100 sats at vsize 500: 0.2 sat per vB. Min relay feerate is 1 sat per vB. Its sigs are valid and its coins exist. What does a default node do?",
    prompt: "Valid sigs, 0.2 sat per vB. What happens?",
    choices: ["Rejected from relay and mempool, still consensus valid", "Mined anyway, policy is advisory", "Invalid: the chain would fork it off"],
    check(a) {
      const ok = a === "Rejected from relay and mempool, still consensus valid";
      return { ok, ...cost(1), message: ok ? "Right. Policy guards relay. Consensus guards blocks." : "Fees are policy, not consensus." };
    },
    reference: "Rejected from relay and mempool, still consensus valid", wrong: ["Mined anyway, policy is advisory", "Invalid: the chain would fork it off"],
    hints: ["Below min relay means no relay.", "A miner could still mine it. Nobody will send it."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/validation.cpp mempool checks (policy)", "Core minrelaytxfee default"],
  },
  {
    id: "6-5", ch: "fees", n: 5, title: "Pinning demo", input: "choice", widget: "none",
    idea: "A fat low fee child makes naive RBF dear.",
    briefing: "An attacker glued a 9000 byte OP_RETURN child to your unconfirmed tx. Naive RBF must now outbid the whole package, costing 50000 sats extra. CPFP carveout still allows one small child. What is the cheapest honest response?",
    prompt: "Pinned by a fat child. Cheapest honest move?",
    choices: ["Attach a small high rate CPFP child to confirm the package", "Pay the inflated RBF price at once", "Double spend with a conflicting fat package"],
    check(a) {
      const ok = a === "Attach a small high rate CPFP child to confirm the package";
      return { ok, ...cost(1), message: ok ? "Right. Confirm the package instead of feeding the pin." : "Replacing a fat package pays for the attacker bytes." };
    },
    reference: "Attach a small high rate CPFP child to confirm the package", wrong: ["Pay the inflated RBF price at once", "Double spend with a conflicting fat package"],
    hints: ["RBF prices the attacker bytes. CPFP prices your own.", "Real defenses: package limits and TRUC. See debrief."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    simplified: "Sizes and prices are staged. Real pinning spans packages, v3 TRUC rules per BIP431, and relay topology.",
    debrief: ["BIP431 (TRUC, v3 rules)", "Optech pinning topic"],
  },
  {
    id: "7-1", ch: "bugs", n: 1, title: "The 92 billion bug", input: "text", widget: "moneyrange",
    idea: "An unchecked int64 sum wrapped negative.",
    briefing: "August 2010, block 74638. Old code checked each output was at least 0, then summed with no overflow check. The block paid 9222000000000000000 sats twice. int64 wraps at 2^63. Add both in the range tool. Type the wrapped sum, negative number, no commas.",
    prompt: "Two outputs of 9222000000000000000 sats. Type the wrapped int64 sum.",
    check(a) {
      const ok = a.trim() === "-2744073709551616";
      return { ok, ...cost(a.trim().length), message: ok ? "Negative. The chain briefly held billions it never minted." : "Add in the tool. Watch the wrap past 2^63 minus 1." };
    },
    reference: "-2744073709551616", wrong: ["18444000000000000000", "0"], hints: ["2^63 minus 1 is 9223372036854775807.", "Twice 9.222e18 wraps deep negative."],
    par: { bytes: 17, ops: 0, sats: 0 }, scored: ["bytes"],
    simplified: "Control flow trimmed to the sum. Overflow math is exact int64.",
    debrief: ["CVE-2010-5139 disclosure (block 74638)", "Core src/consensus/tx_check.cpp (today)", "NVD CVE-2010-5139"],
  },
  {
    id: "7-2", ch: "bugs", n: 2, title: "Patch the printer", input: "choice", widget: "moneyrange",
    idea: "Range check every output and the running sum.",
    briefing: "Same block, fixed code. Which patch closes the 2010 hole without breaking valid txs?",
    prompt: "Which patch is correct?",
    choices: ["Reject any output outside 0..21M BTC, and any running sum outside it", "Check the total at the end only", "Switch the sum to unsigned and ship it", "Cap every output at 50 BTC"],
    check(a) {
      const ok = a === "Reject any output outside 0..21M BTC, and any running sum outside it";
      return { ok, ...cost(1), message: ok ? "MoneyRange on outputs and on the running sum. Still the rule today." : "Try each idea against the 92B outputs in the tool." };
    },
    reference: "Reject any output outside 0..21M BTC, and any running sum outside it", wrong: ["Check the total at the end only", "Cap every output at 50 BTC"],
    hints: ["End only still sums first, so it still wraps.", "Unsigned wraps at 2^64 instead. Still wraps."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core src/consensus/amount.h MoneyRange", "Core 0.3.11 soft fork notes"],
  },
  {
    id: "7-3", ch: "bugs", n: 3, title: "Double input", input: "text", widget: "none",
    idea: "One input may spend each outpoint once.",
    briefing: "September 2018. Versions 0.14 to 0.16.2 missed a duplicate input check, so one coin could be spent twice inside a single tx. That meant inflation plus a crash path. This toy tx spends tx7:0, then tx9:1, then tx7:0 again. Type the duplicated outpoint.",
    prompt: "Inputs tx7:0, tx9:1, tx7:0. Type the duplicate.",
    check(a) {
      const ok = a.replace(/\s+/g, "").toLowerCase() === "tx7:0";
      return { ok, ...cost(a.trim().length), message: ok ? "tx7:0 twice. One line of checking would have caught it." : "Which outpoint appears twice?" };
    },
    reference: "tx7:0", wrong: ["tx9:1", "tx7:1"], hints: ["List each input and count.", "tx7:0 opens and closes the tx."],
    par: { bytes: 5, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["CVE-2018-17144 bitcoincore.org notice 2018-09-20", "Core PR 14247 (the fix)"],
  },
  {
    id: "7-4", ch: "bugs", n: 4, title: "Patch the double", input: "choice", widget: "none",
    idea: "Reject any tx that repeats an outpoint.",
    briefing: "Same bug, fixed code. Which rule did Core add?",
    prompt: "Which check fixes CVE-2018-17144?",
    choices: ["Reject a tx that spends the same outpoint twice", "Count duplicates once and continue", "Check the first input only", "Allow one input per tx"],
    check(a) {
      const ok = a === "Reject a tx that spends the same outpoint twice";
      return { ok, ...cost(1), message: ok ? "HaveInputs plus the duplicate guard. Cheap and total." : "The fix names the exact sin: a repeated outpoint." };
    },
    reference: "Reject a tx that spends the same outpoint twice", wrong: ["Count duplicates once and continue", "Allow one input per tx"],
    hints: ["Counting once still lets the inflation attempt relay.", "Bitcoin txs carry many inputs. One is no fix."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["Core PR 14247", "Core src/consensus/tx_check.cpp CheckTransaction"],
  },
  {
    id: "7-5", ch: "bugs", n: 5, title: "Reorg response", input: "choice", widget: "none",
    idea: "Bad work still counts until nodes reject it.",
    briefing: "After block 74638, devs shipped 0.3.11 within hours and the network reorged past the bad block. Why both steps?",
    prompt: "Why a patch plus a reorg?",
    choices: ["The bad chain had the most work, so nodes needed a reject rule plus a heavier honest chain", "Miners voted the block away", "One dev deleted the block from every disk", "Nothing was needed, it expired"],
    check(a) {
      const ok = a === "The bad chain had the most work, so nodes needed a reject rule plus a heavier honest chain";
      return { ok, ...cost(1), message: ok ? "Rule first, then work. The honest chain overtook within hours." : "Work rules until a rule says otherwise." };
    },
    reference: "The bad chain had the most work, so nodes needed a reject rule plus a heavier honest chain", wrong: ["Miners voted the block away", "Nothing was needed, it expired"],
    hints: ["Nodes follow most work by default.", "A soft fork reject rule plus honest mining sheds the bad branch."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["CVE-2010-5139 timeline (en.bitcoin.it)", "Whitepaper section 4 (most work wins)"],
  },
  {
    id: "8-1", ch: "lightning", n: 1, title: "Fund it", input: "text", widget: "funding",
    idea: "A channel opens on a 2 of 2 P2WSH.",
    briefing: "Two funding keys. A: 022f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4. B: 03acd484e2f0c7f65309ad178a9f559abde09796974c57e714c35f110dfc27ccbe. The witness script is 2, key, key, 2, CHECKMULTISIG. The output is 0 plus SHA256 of that script. Build it in the tool. Type the P2WSH script hex.",
    prompt: "Type the funding P2WSH script (70 hex chars).",
    check(a) {
      const ok = a.trim().toLowerCase() === "0020543c151bd3a12091e870478b9428a2df588999b037f31545dbd7e1f7492150f1";
      return { ok, ...cost(a.trim().length), message: ok ? "Channel funded. Neither side can move coins alone." : "Assemble 2 key key 2 CHECKMULTISIG, hash it, prefix 0." };
    },
    reference: "0020543c151bd3a12091e870478b9428a2df588999b037f31545dbd7e1f7492150f1", wrong: ["0020543c151bd3a12091e870478b9428a2df588999b037f31545dbd7e1f7492150f2", "00".repeat(35)],
    hints: ["Witness script first, then SHA256.", "Output is 0020 plus the 32 byte hash."],
    par: { bytes: 70, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BOLT3 (funding tx, P2WSH 2 of 2)", "BOLT2 (funding_created and locked)"],
  },
  {
    id: "8-2", ch: "lightning", n: 2, title: "Lock and claim", input: "text", widget: "htlc",
    idea: "The payment hash locks, the preimage unlocks, the clock refunds.",
    briefing: "Preimage R b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfee. Expiry T 800000. Current height 799000. Hash R in the tool to lock the HTLC. Then check claim at 799000 and refund at 800000. Type H, the payment hash.",
    prompt: "Type H equals SHA256(R) (64 hex chars).",
    check(a) {
      const ok = a.trim().toLowerCase() === "07fb9f060cc128b18836129aa71e5725e3411c25f3801960fdaa2d04d5c4a15b";
      return { ok, ...cost(a.trim().length), message: ok ? "Locked. Claim wins before T, refund wins at T." : "SHA256 the 32 preimage bytes, no flip." };
    },
    reference: "07fb9f060cc128b18836129aa71e5725e3411c25f3801960fdaa2d04d5c4a15b", wrong: ["b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfee", "00".repeat(32)],
    hints: ["H is the hash, not R itself.", "Try claim at both heights in the tool."],
    par: { bytes: 64, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BOLT2 (update_add_htlc: payment_hash, cltv_expiry)", "BOLT3 (HTLC scripts, core paths)"],
  },
  {
    id: "8-3", ch: "lightning", n: 3, title: "Peel the onion", input: "text", widget: "onion",
    idea: "Each hop learns only the next hop.",
    briefing: "A 3 hop toy onion for route B, C, D. Peel as hop 1, then peel the remainder as hop 2. Each layer is XOR with a stream, NOT the real Sphinx cipher. Type what hop 2 sees as next, a single letter.",
    prompt: "Peel twice. What next hop does hop 2 see?",
    check(a) {
      const ok = a.trim().toUpperCase() === "C";
      return { ok, ...cost(a.trim().length), message: ok ? "C. Hop 2 never met the sender or the payload." : "Peel once for B, peel the remainder for the next." };
    },
    reference: "C", wrong: ["B", "D"], hints: ["First peel reveals B plus a remainder blob.", "Feed the remainder to the second peel."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    simplified: "Toy XOR cipher for teaching layers. Real onions per BOLT4 use ChaCha20-Poly1305 with ephemeral keys (Sphinx).",
    debrief: ["BOLT4 (onion routing)", "Sphinx paper (reference, via BOLT4)"],
  },
  {
    id: "8-4", ch: "lightning", n: 4, title: "Route it", input: "text", widget: "routecalc",
    idea: "Cheapest valid path wins: fees, CLTV, minimums.",
    briefing: "Pay 100000 msat from A to E. Edges (base msat, rate ppm, cltv, min msat, cap msat). A-B: 1000, 500, 40, 1000, 1M. A-C: 5000, 100, 144, 1000, 1M. A-D: 1000, 100, 40, 500000, 1M. B-E: 1000, 500, 40, 1000, 1M. C-E: 1000, 100, 40, 1000, 1M. D-E: 500, 50, 18, 1000, 1M. Fee is base plus amount times ppm over 1M. Try paths in the tool. Type the cheapest valid path like A,B,E.",
    prompt: "Type the cheapest valid path.",
    check(a) {
      const ok = a.replace(/\s+/g, "").toUpperCase() === "A,B,E";
      return { ok, ...cost(a.trim().length), message: ok ? "A,B,E at 2100 msat, cltv 80. A-D-E is barred by its minimum." : "Price each path, skip edges whose minimum exceeds 100000." };
    },
    reference: "A,B,E", wrong: ["A,D,E", "A,C,E"], hints: ["A-D needs 500000 minimum. The payment is 100000.", "A,B,E costs 1050 plus 1050."],
    par: { bytes: 5, ops: 0, sats: 0 }, scored: ["bytes"],
    debrief: ["BOLT7 (fee and CLTV gossip)", "BOLT4 (pathfinding over the graph)"],
  },
  {
    id: "8-5", ch: "lightning", n: 5, title: "Decode the invoice", input: "text", widget: "invoice",
    idea: "An invoice names amount, time, hash, and expiry.",
    briefing: "A toy invoice plus its node key 02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27. Paste both into the decoder. It checks the bech32 checksum and the ECDSA sig, then lists tags. Recovery flag skipped: the key is given. Type the payment hash from the p tag.",
    prompt: "Invoice: lnbc10n1pj48ugqpp55vghu0pys4k7dvftwuv8u76zre3f6kmz6kkdrq60ztenrd7p4p3qdqsw3hhjgrrdanxvet9l6x3avdukdpjk8d4svlltu3zdkwttejuaeps2kxp3mf68jrvuxhng7at4za978yvgtex7ywjv4dzntkq0aarddzgqeng90pthhav4wqxh6z2g. Type the p tag hash.",
    check(a) {
      const ok = a.trim().toLowerCase() === "a3117e3c24856de6b12b77187e7b421e629d5b62d5acd1834f12f331b7c1a862";
      return { ok, ...cost(a.trim().length), message: ok ? "That hash is what the payer HTLC will lock to." : "Decode, find tag p, read its 32 bytes as hex." };
    },
    reference: "a3117e3c24856de6b12b77187e7b421e629d5b62d5acd1834f12f331b7c1a862", wrong: ["00".repeat(32), "07fb9f060cc128b18836129aa71e5725e3411c25f3801960fdaa2d04d5c4a15b"],
    hints: ["Tag p holds 52 five bit words: 32 bytes.", "The decoder prints each tag as hex."],
    par: { bytes: 64, ops: 0, sats: 0 }, scored: ["bytes"],
    simplified: "Recovery flag skipped and node key given. Real decoders recover the key from the sig.",
    debrief: ["BOLT11 (invoice format, p tag is the payment hash)"],
  },
  {
    id: "8-6", ch: "lightning", n: 6, title: "Survive the jam", input: "choice", widget: "none",
    idea: "Cheap held slots block honest payments.",
    briefing: "A channel holds 10 HTLC slots. An attacker parks 9 HTLCs at 100 msat fee each. Min honest fee is 1000 msat. Five honest payments wait. One slot stays free, so 4 honest payments block. What clears honest flow?",
    prompt: "9 of 10 slots held cheaply. What clears flow?",
    choices: ["Charge at least the min fee per held slot and cap attacker slots", "Add unlimited slots for everyone", "Ban small HTLCs forever", "Do nothing, jams clear alone"],
    check(a) {
      const ok = a === "Charge at least the min fee per held slot and cap attacker slots";
      return { ok, ...cost(1), message: ok ? "Fees price the grief, caps bound it. Full fixes are still research." : "Holding must cost more than the harm it causes." };
    },
    reference: "Charge at least the min fee per held slot and cap attacker slots", wrong: ["Add unlimited slots for everyone", "Do nothing, jams clear alone"],
    hints: ["9 held plus 1 free leaves 4 honest blocked.", "Price and bound the held slots."],
    par: { bytes: 1, ops: 0, sats: 0 }, scored: ["bytes"],
    simplified: "Single channel toy numbers. Real jamming spans routes, reputation, and fee proposals with no stable BOLT.",
    debrief: ["BOLT2 (max HTLC limits per channel)", "lnd htlcswitch (forwarding policy)"],
  },
];