// Opcode Circuit interpreter: accept, reject, limits, determinism. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
const p = await import("../opcode-circuit/sim/primitives.js");
const s = await import("../opcode-circuit/sim/interpreter.js");
const enc = new TextEncoder();
function keyPair(k) {
  const priv = p.bigToBytes(BigInt(k), 32);
  const pub = p.pointMult(BigInt(k));
  return { priv, pubC: p.pointCompress(pub) };
}
function ecdsaSig(priv, msg, k) {
  let { r, s: ss } = p.ecdsaSign(priv, msg, BigInt(k));
  if (ss > p.SECP_N / 2n) ss = p.SECP_N - ss;
  return p.concat(p.derEncode(r, ss), Uint8Array.of(0x01));
}
test("P2PKH locks and unlocks with real ECDSA", () => {
  const { priv, pubC } = keyPair(7);
  const msg = p.sha256(enc.encode("toy sighash"));
  const sig = ecdsaSig(priv, msg, 11);
  const lock = s.parseAsm(`OP_DUP OP_HASH160 <${p.bytesToHex(p.hash160(pubC))}> OP_EQUALVERIFY OP_CHECKSIG`);
  const good = s.execute(lock, [sig, pubC], { msgHash: msg });
  assert.equal(good.ok, true);
  const badSig = s.execute(lock, [sig, keyPair(8).pubC], { msgHash: msg });
  assert.equal(badSig.ok, false);
  const badMsg = s.execute(lock, [sig, pubC], { msgHash: p.sha256(enc.encode("other")) });
  assert.equal(badMsg.ok, false);
});
test("multisig needs m of n in order, dummy must be empty", () => {
  const a = keyPair(1), b = keyPair(2), c = keyPair(3);
  const msg = p.sha256(enc.encode("multi"));
  const lock = s.parseAsm(`2 <${p.bytesToHex(a.pubC)}> <${p.bytesToHex(b.pubC)}> <${p.bytesToHex(c.pubC)}> 3 OP_CHECKMULTISIG`);
  const good = s.execute(lock, [new Uint8Array(0), ecdsaSig(a.priv, msg, 5), ecdsaSig(c.priv, msg, 6)], { msgHash: msg });
  assert.equal(good.ok, true);
  const badDummy = s.execute(lock, [Uint8Array.of(1), ecdsaSig(a.priv, msg, 5), ecdsaSig(c.priv, msg, 6)], { msgHash: msg });
  assert.equal(badDummy.ok, false);
  const oneSig = s.execute(lock, [new Uint8Array(0), ecdsaSig(a.priv, msg, 5)], { msgHash: msg });
  assert.equal(oneSig.ok, false);
});
test("CLTV passes after locktime, fails before", () => {
  const lock = s.parseAsm("500 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE");
  assert.equal(s.execute(lock, [], { txLocktime: 500, inputSequence: 1 }).ok, true);
  assert.equal(s.execute(lock, [], { txLocktime: 499, inputSequence: 1 }).ok, false);
  assert.equal(s.execute(lock, [], { txLocktime: 500, inputSequence: 0xffffffff }).ok, false);
  assert.equal(s.execute(lock, [], { txLocktime: 600000000, inputSequence: 1 }).ok, false);
});
test("CSV enforces relative locks and version", () => {
  const lock = s.parseAsm("10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE");
  assert.equal(s.execute(lock, [], { txVersion: 2, inputSequence: 10 }).ok, true);
  assert.equal(s.execute(lock, [], { txVersion: 2, inputSequence: 9 }).ok, false);
  assert.equal(s.execute(lock, [], { txVersion: 1, inputSequence: 10 }).ok, false);
});
test("hashlock opens with the preimage only", () => {
  const pre = enc.encode("correct horse");
  const lock = s.parseAsm(`OP_SHA256 <${p.bytesToHex(p.sha256(pre))}> OP_EQUAL`);
  assert.equal(s.execute(lock, [pre], {}).ok, true);
  assert.equal(s.execute(lock, [enc.encode("wrong")], {}).ok, false);
});
test("P2SH runs the redeem script after the hash matches", () => {
  const redeem = s.parseAsm("OP_TRUE");
  const prog = s.parseAsm(`OP_HASH160 <${p.bytesToHex(p.hash160(redeem))}> OP_EQUAL`);
  assert.equal(s.executeP2SH(s.parseAsm(`<${p.bytesToHex(redeem)}>`), prog, {}).ok, true);
  const wrong = s.parseAsm(`OP_HASH160 <${"00".repeat(20)}> OP_EQUAL`);
  assert.equal(s.executeP2SH(s.parseAsm(`<${p.bytesToHex(redeem)}>`), wrong, {}).ok, false);
});
test("CHECKSIGADD accumulates Schnorr sigs", () => {
  const msg = p.sha256(enc.encode("tap"));
  const sigA = p.schnorrSign(p.bigToBytes(3n, 32), msg, new Uint8Array(32));
  const pubA = p.bigToBytes(p.pointMult(3n).x, 32);
  const lock = s.parseAsm(`<${p.bytesToHex(sigA)}> <${p.bytesToHex(pubA)}> 0 OP_CHECKSIGADD 1 OP_NUMEQUAL`);
  assert.equal(s.execute(lock, [], { tapMsg: msg }).ok, true);
  const bad = s.execute(lock, [], { tapMsg: p.sha256(enc.encode("other")) });
  assert.equal(bad.ok, false);
});
test("limits: ops, stack, script size, push size", () => {
  const many = s.parseAsm(Array(202).fill("OP_NOP").join(" "));
  assert.match(s.execute(many, [], {}).error, /201 ops/);
  const big = new Uint8Array(10001);
  assert.match(s.execute(big, [], {}).error, /10000/);
  assert.throws(() => s.parseAsm(`<${"00".repeat(521)}>`), /520/);
  const deep = s.parseAsm(Array(1001).fill("OP_1").join(" "));
  assert.match(s.execute(deep, [], {}).error, /1000/);
});
test("same input gives the same trace", () => {
  const lock = s.parseAsm("OP_1 OP_2 OP_ADD 3 OP_NUMEQUAL");
  const a = s.execute(lock, [], {}), b = s.execute(lock, [], {});
  assert.equal(a.ok, true);
  assert.deepEqual(a.trace, b.trace);
  assert.ok(a.trace.length >= 5 && a.trace[0].stack.length === 1);
});
test("hostile input finishes fast", () => {
  const t0 = Date.now();
  const evil = s.parseAsm("OP_1 " + Array(300).fill("OP_DUP OP_HASH160").join(" "));
  s.execute(evil, [], {});
  s.execute(s.parseAsm("OP_RETURN"), [], {});
  assert.ok(Date.now() - t0 < 2000, "interpreter bounds runaway scripts");
});
test("asm parser rejects unknown tokens and odd hex", () => {
  assert.throws(() => s.parseAsm("OP_FROBNICATE"), /Unknown token/);
  assert.throws(() => s.parseAsm("<abc>"), /Odd hex/);
});
