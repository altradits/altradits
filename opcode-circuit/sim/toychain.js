// Opcode Circuit toy chain: tx codec, block header, mining, work, retarget,
// median time past, merkle trees with proofs, mempool and fee rules, and the
// two consensus bug demos. All math matches Bitcoin Core. Anything reduced
// for teaching is marked SIMPLIFIED in the puzzle that uses it.
import { sha256, doubleSha256, hash160, taggedHash, bytesToHex, hexToBytes, concat, equalBytes, readU16LE, readU32LE, readU64LE, writeU32LE, writeU64LE, readVarInt, writeVarInt, bytesToBig, bigToBytes, pointMult, pointAdd, SECP_N, liftX } from "./primitives.js";
// Reverse bytes for display: txids show in reverse of hash order.
export function flip(b) { return Uint8Array.from(b).reverse(); }
// Legacy tx: { version, inputs: [{ prevTxid, vout, scriptSig, sequence }],
// outputs: [{ value, scriptPubKey }], locktime }. Values are BigInt sats.
export function serializeTx(tx, withWitness = false) {
  const parts = [writeU32LE(tx.version)];
  const wit = withWitness && tx.inputs.some((i) => i.witness && i.witness.length);
  if (wit) parts.push(Uint8Array.of(0x00, 0x01));
  parts.push(writeVarInt(tx.inputs.length));
  for (const i of tx.inputs) {
    parts.push(flip(hexToBytes(i.prevTxid)), writeU32LE(i.vout));
    parts.push(writeVarInt(i.scriptSig.length), i.scriptSig, writeU32LE(i.sequence));
  }
  parts.push(writeVarInt(tx.outputs.length));
  for (const o of tx.outputs) {
    parts.push(writeU64LE(o.value), writeVarInt(o.scriptPubKey.length), o.scriptPubKey);
  }
  if (wit) {
    for (const i of tx.inputs) {
      const w = i.witness || [];
      parts.push(writeVarInt(w.length));
      for (const item of w) parts.push(writeVarInt(item.length), item);
    }
  }
  parts.push(writeU32LE(tx.locktime));
  return concat(...parts);
}
export function parseTx(raw) {
  let o = 0;
  const version = readU32LE(raw, o); o += 4;
  let withWitness = false;
  if (raw[o] === 0x00 && raw[o + 1] === 0x01) { withWitness = true; o += 2; }
  const [nIn, u1] = readVarInt(raw, o); o += u1;
  const inputs = [];
  for (let i = 0; i < nIn; i++) {
    const prevTxid = bytesToHex(flip(raw.slice(o, o + 32))); o += 32;
    const vout = readU32LE(raw, o); o += 4;
    const [sLen, u2] = readVarInt(raw, o); o += u2;
    const scriptSig = raw.slice(o, o + sLen); o += sLen;
    const sequence = readU32LE(raw, o); o += 4;
    inputs.push({ prevTxid, vout, scriptSig, sequence });
  }
  const [nOut, u3] = readVarInt(raw, o); o += u3;
  const outputs = [];
  for (let i = 0; i < nOut; i++) {
    const value = readU64LE(raw, o); o += 8;
    const [pLen, u4] = readVarInt(raw, o); o += u4;
    const scriptPubKey = raw.slice(o, o + pLen); o += pLen;
    outputs.push({ value, scriptPubKey });
  }
  if (withWitness) {
    for (const i of inputs) {
      const [nW, u5] = readVarInt(raw, o); o += u5;
      i.witness = [];
      for (let k = 0; k < nW; k++) {
        const [wLen, u6] = readVarInt(raw, o); o += u6;
        i.witness.push(raw.slice(o, o + wLen)); o += wLen;
      }
    }
  }
  const locktime = readU32LE(raw, o); o += 4;
  return { tx: { version, inputs, outputs, locktime }, bytesUsed: o, withWitness };
}
export function txidOf(tx) { return bytesToHex(flip(doubleSha256(serializeTx(tx, false)))); }
export function wtxidOf(tx) {
  const hasWit = tx.inputs.some((i) => i.witness && i.witness.length);
  if (!hasWit) return txidOf(tx);
  return bytesToHex(flip(doubleSha256(serializeTx(tx, true))));
}
// Weight per BIP141: base bytes count 4, witness bytes count 1. vsize rounds up.
export function txWeight(tx) {
  const base = serializeTx(tx, false).length;
  const total = serializeTx(tx, true).length;
  return base * 3 + total;
}
export function txVsize(tx) { return Math.ceil(txWeight(tx) / 4); }
// Block header: 80 bytes. Bits use compact target format per pow.cpp.
export function serializeHeader(h) {
  return concat(writeU32LE(h.version), flip(hexToBytes(h.prevHash)), flip(hexToBytes(h.merkleRoot)),
    writeU32LE(h.time), writeU32LE(h.bits), writeU32LE(h.nonce));
}
export function blockHashOf(h) { return bytesToHex(flip(doubleSha256(serializeHeader(h)))); }
export function bitsToTarget(bits) {
  const exp = bits >> 24, mant = bits & 0xffffff;
  if (mant > 0x7fffff) return null;
  let target = BigInt(mant);
  if (exp <= 3) target >>= BigInt(8 * (3 - exp));
  else target <<= BigInt(8 * (exp - 3));
  return target;
}
export function targetToBits(target) {
  let hex = target.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = hexToBytes(hex);
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  bytes = bytes.slice(i);
  let exp = bytes.length;
  let mant;
  if (bytes[0] & 0x80) { mant = concat(Uint8Array.of(0x00), bytes.slice(0, 2)); exp += 1; }
  else mant = bytes.slice(0, 3);
  while (mant.length < 3) mant = concat(mant, Uint8Array.of(0x00));
  return (exp << 24) | (mant[0] << 16) | (mant[1] << 8) | mant[2];
}
export function hashMeetsBits(hashHex, bits) {
  const target = bitsToTarget(bits);
  if (target === null) return false;
  return bytesToBig(flip(hexToBytes(hashHex))) <= target;
}
// Mine by trying nonces from a start value. Returns { nonce, hash, tries }.
export function mineHeader(h, maxTries = 5000000) {
  const target = bitsToTarget(h.bits);
  for (let n = 0; n < maxTries; n++) {
    const cand = { ...h, nonce: (h.nonce + n) >>> 0 };
    const hash = blockHashOf(cand);
    if (bytesToBig(flip(hexToBytes(hash))) <= target) return { nonce: cand.nonce, hash, tries: n + 1 };
  }
  return null;
}
// Chain work of one block: 2^256 / (target + 1), per chain.cpp GetBlockProof.
export function blockWork(bits) {
  const target = bitsToTarget(bits);
  return ((1n << 256n) / (target + 1n));
}
export function chainWork(bitsList) {
  return bitsList.reduce((sum, b) => sum + blockWork(b), 0n);
}
// Retarget per pow.cpp CalculateNextWorkRequired: 2016 blocks, 2 week target,
// timespan clamped to 1/4..4x. Returns next bits.
export function retarget(prevBits, firstTime, lastTime) {
  const TARGET_TIMESPAN = 14 * 24 * 3600;
  let span = lastTime - firstTime;
  if (span < TARGET_TIMESPAN / 4) span = TARGET_TIMESPAN / 4;
  if (span > TARGET_TIMESPAN * 4) span = TARGET_TIMESPAN * 4;
  const oldTarget = bitsToTarget(prevBits);
  let next = (oldTarget * BigInt(span)) / BigInt(TARGET_TIMESPAN);
  const max = bitsToTarget(0x1d00ffff);
  if (next > max) next = max;
  return targetToBits(next);
}
// Median time past: median of the last 11 block times, per validation.cpp.
export function medianTimePast(times) {
  const last = times.slice(-11).slice().sort((a, b) => a - b);
  return last[Math.floor(last.length / 2)];
}
// Merkle root per consensus/merkle.cpp BlockMerkleRoot: pairwise double SHA,
// the last leaf is duplicated when a level is odd.
export function merkleRoot(leaves) {
  if (!leaves.length) return new Uint8Array(32);
  let level = leaves.map((l) => Uint8Array.from(l));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[Math.min(i + 1, level.length - 1)];
      next.push(doubleSha256(concat(a, b)));
    }
    level = next;
  }
  return level[0];
}
// Inclusion proof: siblings from leaf to root plus the leaf index.
export function merkleProof(leaves, index) {
  const branch = [];
  let idx = index;
  let level = leaves.map((l) => Uint8Array.from(l));
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]);
    branch.push(level[idx ^ 1]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(doubleSha256(concat(level[i], level[i + 1])));
    level = next;
    idx = Math.floor(idx / 2);
  }
  return branch;
}
export function merkleVerify(leaf, branch, index, root) {
  let h = Uint8Array.from(leaf);
  let idx = index;
  for (const sib of branch) {
    h = idx % 2 === 0 ? doubleSha256(concat(h, sib)) : doubleSha256(concat(sib, h));
    idx = Math.floor(idx / 2);
  }
  return equalBytes(h, root);
}
// CVE-2012-2459 demo: [A,B,C] duplicates C to [A,B,C,C], so a 3 tx block and
// a 4 tx block with a repeated last tx share one root. Returns both roots.
export function cve20122459Demo(a, b, c) {
  return { three: merkleRoot([a, b, c]), fourDup: merkleRoot([a, b, c, c]) };
}
// Fee rate in sats per vbyte. Fee and vsize are plain numbers here.
export function feeRate(feeSats, vsize) { return feeSats / vsize; }
// Ancestor package rate per miner policy (PR #7600): fee and size include the
// tx plus every unconfirmed ancestor. ancestors is [{ fee, vsize }].
export function packageRate(tx, ancestors) {
  const fee = tx.fee + ancestors.reduce((s, a) => s + a.fee, 0);
  const size = tx.vsize + ancestors.reduce((s, a) => s + a.vsize, 0);
  return { fee, vsize: size, rate: fee / size };
}
// Order candidates for one toy block by package rate, highest first.
export function pickForBlock(cands) {
  return cands.map((c) => ({ ...c, pkg: packageRate(c, c.ancestors || []) }))
    .sort((a, b) => b.pkg.rate - a.pkg.rate || b.pkg.fee - a.pkg.fee);
}
// BIP125 opt in RBF checks for a replacement. mempool maps txid to { fee,
// vsize, parents: [txid], signalled }. Returns { ok, reason }.
export function checkRBF(replacement, replacedIds, mempool, incrementalRate = 1) {
  const replaced = replacedIds.map((id) => mempool[id]);
  if (replaced.some((t) => !t)) return { ok: false, reason: "Unknown replaced tx." };
  if (!replaced.some((t) => t.signalled)) return { ok: false, reason: "No replaced tx signals BIP125." };
  const oldFee = replaced.reduce((s, t) => s + t.fee, 0);
  const oldSize = replaced.reduce((s, t) => s + t.vsize, 0);
  if (replacement.fee <= oldFee) return { ok: false, reason: "Replacement pays no higher absolute fee." };
  if (replacement.fee / replacement.vsize <= oldFee / oldSize) return { ok: false, reason: "Replacement feerate is no higher." };
  if (replacement.fee - oldFee < replacement.vsize * incrementalRate) return { ok: false, reason: "Incremental relay fee not met." };
  const inMempool = new Set(Object.keys(mempool));
  for (const p of replacement.parents || []) {
    if (inMempool.has(p) && !replacedIds.includes(p)) return { ok: false, reason: "Replacement adds an unconfirmed parent." };
  }
  return { ok: true, reason: "All BIP125 rules pass." };
}
// CPFP carveout: one extra unconfirmed child, small enough to relay.
export function checkCarveout(childVsize, parentHasChild, maxVsize = 1000) {
  if (parentHasChild) return { ok: false, reason: "Parent already has an extra child." };
  if (childVsize > maxVsize) return { ok: false, reason: "Child is over the carveout size." };
  return { ok: true, reason: "Carveout accepts one small child." };
}
// CVE-2010-5139: the pre patch code summed outputs without an overflow check.
// ints are simulated int64: sums wrap at 2^63. Block 74638 paid 92.2B twice.
const INT64 = 1n << 63n;
function wrap64(v) { const m = v % (INT64 * 2n); return m >= INT64 ? m - INT64 * 2n : m; }
export function vulnerableSum(outputs) {
  let sum = 0n;
  for (const v of outputs) sum = wrap64(sum + v); // BUG: no range check
  return sum;
}
export const MAX_MONEY = 21000000n * 100000000n;
export function moneyRange(v) { return v >= 0n && v <= MAX_MONEY; }
export function patchedSum(outputs) {
  let sum = 0n;
  for (const v of outputs) {
    if (!moneyRange(v)) return { ok: false, reason: "Output out of range." };
    sum += v;
    if (!moneyRange(sum)) return { ok: false, reason: "Running sum out of range." };
  }
  return { ok: true, sum };
}
// CVE-2018-17144: 0.14 to 0.16.2 missed a duplicate input check, so one coin
// could be spent twice in one tx (inflation) and crash the node. inputs holds
// "txid:vout" strings.
export function vulnerableInputs(inputs) {
  return { spentTwice: null, note: "No duplicate check. Both spends pass." };
}
export function patchedInputs(inputs) {
  const seen = new Set();
  for (const i of inputs) {
    if (seen.has(i)) return { ok: false, reason: `Duplicate input ${i}.` };
    seen.add(i);
  }
  return { ok: true, reason: "No duplicate input." };
}
// Taproot key tweak per BIP341: Q = P + H_TapTweak(P || m) * G, x-only.
export function tapTweak(internalX, merkleRootBytes) {
  const m = merkleRootBytes || new Uint8Array(0);
  const t = bytesToBig(taggedHash("TapTweak", concat(internalX, m))) % SECP_N;
  return t;
}
export function taprootOutputKey(internalX, merkleRootBytes) {
  const P = liftX(bytesToBig(internalX));
  if (!P) throw new Error("Bad internal key.");
  const t = tapTweak(internalX, merkleRootBytes);
  return pointAdd(P, pointMult(t));
}
// TapLeaf hash per BIP341: H_TapLeaf(version || compactsize(len) || script).
export function tapLeafHash(version, script) {
  return taggedHash("TapLeaf", concat(Uint8Array.of(version), writeVarInt(script.length), script));
}
// TapBranch hash per BIP341: H_TapBranch(min(a,b) || max(a,b)).
export function tapBranchHash(a, b) {
  const [x, y] = bytesToHex(a) < bytesToHex(b) ? [a, b] : [b, a];
  return taggedHash("TapBranch", concat(x, y));
}
// Verify a control block path: leafHash plus branch siblings up to the tweak.
export function verifyControlPath(internalX, leafHash, branch, outputX) {
  let k = leafHash;
  for (const sib of branch) k = tapBranchHash(k, sib);
  const t = tapTweak(internalX, k);
  const P = liftX(bytesToBig(internalX));
  const Q = pointAdd(P, pointMult(t));
  return Q && Q.x === bytesToBig(outputX);
}
// Sighash types taught in chapter 5. Byte values per script/interpreter.h.
export const SIGHASH = { ALL: 0x01, NONE: 0x02, SINGLE: 0x03, DEFAULT: 0x00, ANYONECANPAY: 0x80 };
