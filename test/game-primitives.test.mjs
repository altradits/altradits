// Opcode Circuit primitives against official vectors. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
const p = await import("../opcode-circuit/sim/primitives.js");
const v = await import("../opcode-circuit/sim/vectors.js");
const enc = new TextEncoder();
const hx = (s) => s.toLowerCase();
test("SHA-256 matches FIPS 180-4 vectors", () => {
  for (const t of v.SHA256_VECTORS) {
    assert.equal(p.bytesToHex(p.sha256(enc.encode(t.msg))), hx(t.hex), t.msg.slice(0, 20));
  }
  assert.equal(p.bytesToHex(p.sha256(enc.encode("a".repeat(1000000)))), v.SHA256_MILLION_A);
});
test("SHA-256 edge inputs", () => {
  assert.equal(p.sha256(new Uint8Array(0)).length, 32);
  assert.equal(p.sha256(new Uint8Array(55)).length, 32);
  assert.equal(p.sha256(new Uint8Array(56)).length, 32);
  assert.equal(p.sha256(new Uint8Array(64)).length, 32);
});
test("RIPEMD-160 matches reference vectors", () => {
  for (const t of v.RIPEMD160_VECTORS) {
    assert.equal(p.bytesToHex(p.ripemd160(enc.encode(t.msg))), hx(t.hex), t.msg.slice(0, 20));
  }
});
test("hash160 and double SHA of empty are known", () => {
  assert.equal(p.bytesToHex(p.doubleSha256(new Uint8Array(0))), "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456");
  assert.equal(p.bytesToHex(p.hash160(new Uint8Array(0))), "b472a266d0bd89c13706a4132ccfb16f7c3b9fcb");
});
test("secp256k1 known answers and group law", () => {
  for (const t of v.SECP_KNOWN) {
    const pt = p.pointMult(BigInt(`0x${t.k}`));
    assert.equal(pt.x.toString(16).padStart(64, "0").toUpperCase(), t.x);
    assert.equal(p.bytesToHex(p.pointCompress(pt)).slice(0, 2), t.prefix);
  }
  assert.equal(p.pointMult(p.SECP_N), null);
  const g2 = p.pointMult(2n);
  assert.deepEqual(p.pointAdd(p.SECP_G, p.SECP_G), g2);
  const back = p.pointDecompress(p.pointCompress(g2));
  assert.deepEqual(back, g2);
});
test("BIP340 verify matches test-vectors.csv", () => {
  for (const t of v.BIP340_VECTORS) {
    const ok = p.schnorrVerify(p.hexToBytes(hx(t.pub)), p.hexToBytes(hx(t.msg)), p.hexToBytes(hx(t.sig)));
    assert.equal(ok, t.ok, `vector ${t.index} ${t.why || ""}`);
  }
});
test("BIP340 sign reproduces official signatures", () => {
  for (const t of v.BIP340_SIGN_VECTORS) {
    const sig = p.schnorrSign(p.hexToBytes(hx(t.sec)), p.hexToBytes(hx(t.msg)), p.hexToBytes(hx(t.aux)));
    assert.equal(p.bytesToHex(sig).toUpperCase(), t.sig, `vector ${t.index}`);
  }
});
test("ECDSA round trip signs and verifies, tampering fails", () => {
  const priv = p.hexToBytes("11".repeat(32));
  const pub = p.pointMult(p.bytesToBig(priv));
  const msg = p.sha256(enc.encode("toy message"));
  let { r, s } = p.ecdsaSign(priv, msg, 42n);
  if (s > p.SECP_N / 2n) s = p.SECP_N - s;
  assert.equal(p.ecdsaVerify(pub, msg, r, s), true);
  assert.equal(p.ecdsaVerify(pub, msg, r, (s + 1n) % p.SECP_N), false);
  assert.equal(p.ecdsaVerify(pub, p.sha256(enc.encode("other")), r, s), false);
  const { r: r2, s: s2 } = p.derDecode(p.derEncode(r, s));
  assert.equal(r2, r);
  assert.equal(s2, s);
});
test("BIP173 bech32 valid strings decode", () => {
  for (const s of v.BECH32_VALID) {
    const { hrp, data } = p.bech32Decode(s);
    assert.ok(hrp.length >= 1 && data.length >= 0, s);
  }
  for (const t of v.SEGWIT_VALID) {
    const seg = p.segwitDecode(t.addr);
    assert.equal(seg.version, t.version, t.addr);
    assert.equal(p.bytesToHex(seg.program), t.program, t.addr);
  }
  for (const s of v.SEGWIT_INVALID) assert.throws(() => p.segwitDecode(s), s);
});
test("BIP350 bech32m valid strings decode, v0 rule enforced", () => {
  for (const s of v.BECH32M_VALID) {
    const { hrp } = p.bech32mDecode(s);
    assert.ok(hrp.length >= 1, s);
  }
  for (const s of v.BECH32_INVALID) {
    assert.throws(() => p.bech32Decode(s), s);
    assert.throws(() => p.bech32mDecode(s), s);
  }
  assert.throws(() => p.bech32Decode("A1LQFN3A"));
  assert.throws(() => p.bech32mDecode("A12UEL5L"));
});
test("segwit round trip and version rules", () => {
  const prog20 = p.hexToBytes("751e76e8199196d454941c45d1b3a323f1433bd6");
  const addr = p.segwitEncode("bc", 0, prog20);
  assert.equal(addr, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  const prog32 = p.sha256(enc.encode("taproot program"));
  const addr1 = p.segwitEncode("bc", 1, prog32);
  const back = p.segwitDecode(addr1);
  assert.equal(back.version, 1);
  assert.equal(back.encoding, "bech32m");
  assert.deepEqual(back.program, prog32);
});
test("base58check decodes known addresses, rejects typos", () => {
  for (const t of v.BASE58_VALID) {
    assert.equal(p.bytesToHex(p.base58CheckDecode(t.addr)), t.body, t.addr);
  }
  assert.throws(() => p.base58CheckDecode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"));
  assert.throws(() => p.base58CheckDecode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0"));
});
test("varint boundaries per serialize.h", () => {
  assert.deepEqual(p.readVarInt(Uint8Array.of(0xfc), 0), [252, 1]);
  assert.deepEqual(p.readVarInt(Uint8Array.of(0xfd, 0xfd, 0x00), 0), [253, 3]);
  assert.deepEqual(p.readVarInt(Uint8Array.of(0xfe, 0x01, 0x00, 0x00, 0x00), 0), [1, 5]);
  assert.deepEqual(p.writeVarInt(252), Uint8Array.of(0xfc));
  assert.deepEqual(p.writeVarInt(253), Uint8Array.of(0xfd, 0xfd, 0x00));
  assert.deepEqual(p.writeVarInt(65536), p.hexToBytes("fe00000100"));
});
test("little endian u32 and u64 round trip", () => {
  assert.equal(p.readU32LE(p.writeU32LE(0xdeadbeef), 0), 0xdeadbeef);
  assert.equal(p.readU64LE(p.writeU64LE(9222000000000000000n), 0), 9222000000000000000n);
});
