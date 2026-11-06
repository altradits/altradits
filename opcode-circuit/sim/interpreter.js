// Opcode Circuit script interpreter: a stack machine for locking scripts.
// Follows src/script/interpreter.cpp EvalScript semantics for the ops taught
// here. Limits per src/script/script.h: 10000 byte script, 201 ops, 1000 stack
// items, 520 byte push. CHECKSIG checks real ECDSA. CHECKSIGADD checks real
// BIP340 Schnorr. Sighash bytes are parsed, not computed: each puzzle hands
// the interpreter the toy message hash, and says so on screen.
import { sha256, ripemd160, hash160, hash256, bytesToHex, hexToBytes, concat, equalBytes, bytesToBig, pointDecompress, ecdsaVerify, derDecode, schnorrVerify, SECP_N, SECP_P, isOnCurve } from "./primitives.js";
export const OP = {
  OP_0: 0x00, OP_FALSE: 0x00, OP_PUSHDATA1: 0x4c, OP_PUSHDATA2: 0x4d, OP_PUSHDATA4: 0x4e,
  OP_1NEGATE: 0x4f, OP_1: 0x51, OP_TRUE: 0x51, OP_2: 0x52, OP_3: 0x53, OP_4: 0x54,
  OP_5: 0x55, OP_6: 0x56, OP_7: 0x57, OP_8: 0x58, OP_9: 0x59, OP_10: 0x5a,
  OP_11: 0x5b, OP_12: 0x5c, OP_13: 0x5d, OP_14: 0x5e, OP_15: 0x5f, OP_16: 0x60,
  OP_NOP: 0x61, OP_IF: 0x63, OP_NOTIF: 0x64, OP_ELSE: 0x67, OP_ENDIF: 0x68,
  OP_VERIFY: 0x69, OP_RETURN: 0x6a, OP_TOALTSTACK: 0x6b, OP_FROMALTSTACK: 0x6c,
  OP_IFDUP: 0x73, OP_DEPTH: 0x74, OP_DROP: 0x75, OP_DUP: 0x76, OP_NIP: 0x77,
  OP_OVER: 0x78, OP_PICK: 0x79, OP_ROLL: 0x7a, OP_ROT: 0x7b, OP_SWAP: 0x7c,
  OP_TUCK: 0x7d, OP_2DROP: 0x6d, OP_2DUP: 0x6e, OP_3DUP: 0x6f, OP_2OVER: 0x70, OP_2ROT: 0x71, OP_2SWAP: 0x72,
  OP_SIZE: 0x82, OP_EQUAL: 0x87, OP_EQUALVERIFY: 0x88,
  OP_1ADD: 0x8b, OP_1SUB: 0x8c, OP_NEGATE: 0x8f, OP_ABS: 0x90, OP_NOT: 0x91, OP_0NOTEQUAL: 0x92,
  OP_ADD: 0x93, OP_SUB: 0x94, OP_BOOLAND: 0x9a, OP_BOOLOR: 0x9b, OP_NUMEQUAL: 0x9c,
  OP_NUMEQUALVERIFY: 0x9d, OP_NUMNOTEQUAL: 0x9e, OP_LESSTHAN: 0x9f, OP_GREATERTHAN: 0xa0,
  OP_LESSTHANOREQUAL: 0xa1, OP_GREATERTHANOREQUAL: 0xa2, OP_MIN: 0xa3, OP_MAX: 0xa4,
  OP_WITHIN: 0xa5, OP_RIPEMD160: 0xa6, OP_SHA1: 0xa7, OP_SHA256: 0xa8, OP_HASH160: 0xa9,
  OP_HASH256: 0xaa, OP_CODESEPARATOR: 0xab, OP_CHECKSIG: 0xac, OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKMULTISIG: 0xae, OP_CHECKMULTISIGVERIFY: 0xaf, OP_CHECKLOCKTIMEVERIFY: 0xb1,
  OP_CHECKSEQUENCEVERIFY: 0xb2, OP_CHECKSIGADD: 0xba,
};
export const OP_NAME = {};
for (const [k, v] of Object.entries(OP)) if (OP_NAME[v] === undefined) OP_NAME[v] = k;
export const LIMITS = { maxScript: 10000, maxOps: 201, maxStack: 1000, maxPush: 520, maxNumSize: 4 };
// Parse player asm. Tokens: OP_NAME, <hex> push, decimal -1..16. Spaces or lines.
export function parseAsm(text) {
  const out = [];
  const toks = String(text).split(/\s+/).filter(Boolean);
  for (const t of toks) {
    if (OP[t] !== undefined) { out.push(OP[t]); continue; }
    let m = t.match(/^<([0-9a-fA-F]*)>$/);
    if (m) {
      if (m[1].length % 2) throw new Error(`Odd hex push ${t}.`);
      const b = hexToBytes(m[1].toLowerCase());
      if (b.length > LIMITS.maxPush) throw new Error("Push over 520 bytes.");
      pushBytes(out, b);
      continue;
    }
    m = t.match(/^(-?\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n === -1) { out.push(OP.OP_1NEGATE); continue; }
      if (n >= 0 && n <= 16) { out.push(n === 0 ? OP.OP_0 : OP.OP_1 + n - 1); continue; }
      pushBytes(out, numEncode(n));
      continue;
    }
    throw new Error(`Unknown token ${t}. Use OP_NAME, <hex>, or -1..16.`);
  }
  return Uint8Array.from(out);
}
function pushBytes(out, b) {
  if (b.length < OP.OP_PUSHDATA1) out.push(b.length);
  else if (b.length <= 0xff) { out.push(OP.OP_PUSHDATA1, b.length); }
  else if (b.length <= 0xffff) { out.push(OP.OP_PUSHDATA2, b.length & 255, (b.length >> 8) & 255); }
  else { out.push(OP.OP_PUSHDATA4, b.length & 255, (b.length >> 8) & 255, (b.length >> 16) & 255, (b.length >> 24) & 255); }
  for (const x of b) out.push(x);
}
// CScriptNum minimal encoding, 4 byte cap, like Core.
export function numEncode(n) {
  if (n === 0) return new Uint8Array(0);
  const neg = n < 0;
  let v = Math.abs(n);
  const b = [];
  while (v > 0) { b.push(v & 255); v = Math.floor(v / 256); }
  if (b[b.length - 1] & 0x80) b.push(neg ? 0x80 : 0x00);
  else if (neg) b[b.length - 1] |= 0x80;
  return Uint8Array.from(b);
}
export function numDecode(b) {
  if (b.length > LIMITS.maxNumSize) throw new Error("Number over 4 bytes.");
  if (b.length === 0) return 0;
  let v = 0;
  for (let i = 0; i < b.length; i++) v |= (b[i] & (i === b.length - 1 ? 0x7f : 0xff)) << (8 * i);
  if (b[b.length - 1] & 0x80) v = -v;
  return v;
}
function castBool(b) {
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 0) {
      if (i === b.length - 1 && b[i] === 0x80) return false;
      return true;
    }
  }
  return false;
}
const TRUE = Uint8Array.of(0x01), FALSE = new Uint8Array(0);
// Split raw script into ops: { code, push? }.
export function disassemble(script) {
  const ops = [];
  let i = 0;
  while (i < script.length) {
    const code = script[i++];
    if (code === OP.OP_0) { ops.push({ code, push: new Uint8Array(0) }); continue; }
    if (code < OP.OP_PUSHDATA1) {
      const push = script.slice(i, i + code);
      if (push.length !== code) throw new Error("Push past end.");
      i += code;
      ops.push({ code, push });
      continue;
    }
    if (code <= OP.OP_PUSHDATA4) {
      let len;
      if (code === OP.OP_PUSHDATA1) len = script[i++];
      else if (code === OP.OP_PUSHDATA2) { len = script[i] | (script[i + 1] << 8); i += 2; }
      else { len = script[i] | (script[i + 1] << 8) | (script[i + 2] << 16) | (script[i + 3] << 24); i += 4; }
      const push = script.slice(i, i + len);
      if (push.length !== len) throw new Error("Push past end.");
      i += len;
      ops.push({ code, push });
      continue;
    }
    ops.push({ code });
  }
  return ops;
}
// Run a script. stack starts with the unlocking pushes. ctx holds toy values:
// { msgHash, tapMsg, txLocktime, txVersion, inputSequence }.
// Returns { ok, stack, trace, ops, error }. Trace has one row per executed op.
export function execute(scriptBytes, stack = [], ctx = {}) {
  const trace = [];
  const st = stack.map((b) => Uint8Array.from(b));
  const alt = [];
  if (scriptBytes.length > LIMITS.maxScript) return { ok: false, stack: st, trace, ops: 0, error: "Script over 10000 bytes." };
  let ops;
  try { ops = disassemble(scriptBytes); }
  catch (e) { return { ok: false, stack: st, trace, ops: 0, error: e.message }; }
  let opCount = 0;
  const cond = [];
  const active = () => cond.every(Boolean);
  const need = (n, name) => {
    if (st.length < n) throw new Error(`${name} needs ${n} items.`);
    if (st.length + alt.length > LIMITS.maxStack) throw new Error("Stack over 1000 items.");
  };
  try {
    for (let pc = 0; pc < ops.length; pc++) {
      const { code, push } = ops[pc];
      const name = push !== undefined ? `PUSH(${push.length})` : (OP_NAME[code] || `OP_UNKNOWN_${code}`);
      const isCond = code === OP.OP_IF || code === OP.OP_NOTIF || code === OP.OP_ELSE || code === OP.OP_ENDIF;
      if (push === undefined && code > OP.OP_16 && !isCond) {
        opCount += (code === OP.OP_CHECKMULTISIG || code === OP.OP_CHECKMULTISIGVERIFY) ? 20 : 1;
        if (opCount > LIMITS.maxOps) throw new Error("Over 201 ops.");
      }
      if (push !== undefined) {
        if (active()) {
          if (push.length > LIMITS.maxPush) throw new Error("Push over 520 bytes.");
          st.push(push);
        }
        trace.push({ op: name, stack: st.map(bytesToHex) });
        continue;
      }
      if (!active() && !isCond) { trace.push({ op: name, stack: st.map(bytesToHex), skipped: true }); continue; }
      switch (code) {
        case OP.OP_1NEGATE: st.push(numEncode(-1)); break;
        case OP.OP_1: case OP.OP_2: case OP.OP_3: case OP.OP_4: case OP.OP_5: case OP.OP_6:
        case OP.OP_7: case OP.OP_8: case OP.OP_9: case OP.OP_10: case OP.OP_11: case OP.OP_12:
        case OP.OP_13: case OP.OP_14: case OP.OP_15: case OP.OP_16:
          st.push(numEncode(code - OP.OP_1 + 1)); break;
        case OP.OP_NOP: break;
        case OP.OP_IF: case OP.OP_NOTIF: {
          let v = false;
          if (active()) { need(1, name); v = castBool(st.pop()); if (code === OP.OP_NOTIF) v = !v; }
          cond.push(v);
          break;
        }
        case OP.OP_ELSE: {
          if (!cond.length) throw new Error("ELSE without IF.");
          cond[cond.length - 1] = !cond[cond.length - 1];
          break;
        }
        case OP.OP_ENDIF: {
          if (!cond.length) throw new Error("ENDIF without IF.");
          cond.pop();
          break;
        }
        case OP.OP_VERIFY: { need(1, name); if (!castBool(st.pop())) throw new Error("VERIFY failed."); break; }
        case OP.OP_RETURN: throw new Error("OP_RETURN stops the script.");
        case OP.OP_TOALTSTACK: { need(1, name); alt.push(st.pop()); break; }
        case OP.OP_FROMALTSTACK: { if (!alt.length) throw new Error("Alt stack empty."); st.push(alt.pop()); break; }
        case OP.OP_IFDUP: { need(1, name); if (castBool(st[st.length - 1])) st.push(st[st.length - 1]); break; }
        case OP.OP_DEPTH: st.push(numEncode(st.length)); break;
        case OP.OP_DROP: { need(1, name); st.pop(); break; }
        case OP.OP_DUP: { need(1, name); st.push(st[st.length - 1]); break; }
        case OP.OP_NIP: { need(2, name); st.splice(st.length - 2, 1); break; }
        case OP.OP_OVER: { need(2, name); st.push(st[st.length - 2]); break; }
        case OP.OP_PICK: case OP.OP_ROLL: {
          need(1, name);
          const n = numDecode(st.pop());
          if (n < 0 || n >= st.length) throw new Error("PICK out of range.");
          const v = st.splice(st.length - 1 - n, 1)[0];
          st.push(v);
          if (code === OP.OP_PICK) st.splice(st.length - 2, 0, v.slice());
          break;
        }
        case OP.OP_ROT: { need(3, name); const a = st.splice(st.length - 3, 1)[0]; st.push(a); break; }
        case OP.OP_SWAP: { need(2, name); const a = st.pop(), b = st.pop(); st.push(a, b); break; }
        case OP.OP_TUCK: { need(2, name); st.splice(st.length - 2, 0, st[st.length - 1]); break; }
        case OP.OP_2DROP: { need(2, name); st.pop(); st.pop(); break; }
        case OP.OP_2DUP: { need(2, name); st.push(st[st.length - 2], st[st.length - 1]); break; }
        case OP.OP_3DUP: { need(3, name); st.push(st[st.length - 3], st[st.length - 2], st[st.length - 1]); break; }
        case OP.OP_2OVER: { need(4, name); st.push(st[st.length - 4], st[st.length - 3]); break; }
        case OP.OP_2ROT: { need(6, name); const a = st.splice(st.length - 6, 2); st.push(...a); break; }
        case OP.OP_2SWAP: { need(4, name); const a = st.splice(st.length - 4, 2); st.push(...a); break; }
        case OP.OP_SIZE: { need(1, name); st.push(numEncode(st[st.length - 1].length)); break; }
        case OP.OP_EQUAL: case OP.OP_EQUALVERIFY: {
          need(2, name);
          const a = st.pop(), b = st.pop();
          const eq = equalBytes(a, b);
          if (code === OP.OP_EQUALVERIFY && !eq) throw new Error("EQUALVERIFY failed.");
          if (code === OP.OP_EQUAL) st.push(eq ? TRUE.slice() : FALSE.slice());
          break;
        }
        case OP.OP_1ADD: case OP.OP_1SUB: case OP.OP_NEGATE: case OP.OP_ABS: case OP.OP_NOT: case OP.OP_0NOTEQUAL: {
          need(1, name);
          const a = numDecode(st.pop());
          const r = code === OP.OP_1ADD ? a + 1 : code === OP.OP_1SUB ? a - 1 : code === OP.OP_NEGATE ? -a
            : code === OP.OP_ABS ? Math.abs(a) : code === OP.OP_NOT ? (a === 0 ? 1 : 0) : (a !== 0 ? 1 : 0);
          st.push(numEncode(r));
          break;
        }
        case OP.OP_ADD: case OP.OP_SUB: case OP.OP_BOOLAND: case OP.OP_BOOLOR: case OP.OP_NUMEQUAL:
        case OP.OP_NUMNOTEQUAL: case OP.OP_LESSTHAN: case OP.OP_GREATERTHAN: case OP.OP_LESSTHANOREQUAL:
        case OP.OP_GREATERTHANOREQUAL: case OP.OP_MIN: case OP.OP_MAX: {
          need(2, name);
          const b = numDecode(st.pop()), a = numDecode(st.pop());
          let r;
          if (code === OP.OP_ADD) r = a + b;
          else if (code === OP.OP_SUB) r = a - b;
          else if (code === OP.OP_BOOLAND) r = (a !== 0 && b !== 0) ? 1 : 0;
          else if (code === OP.OP_BOOLOR) r = (a !== 0 || b !== 0) ? 1 : 0;
          else if (code === OP.OP_NUMEQUAL) r = a === b ? 1 : 0;
          else if (code === OP.OP_NUMNOTEQUAL) r = a !== b ? 1 : 0;
          else if (code === OP.OP_LESSTHAN) r = a < b ? 1 : 0;
          else if (code === OP.OP_GREATERTHAN) r = a > b ? 1 : 0;
          else if (code === OP.OP_LESSTHANOREQUAL) r = a <= b ? 1 : 0;
          else if (code === OP.OP_GREATERTHANOREQUAL) r = a >= b ? 1 : 0;
          else if (code === OP.OP_MIN) r = Math.min(a, b);
          else r = Math.max(a, b);
          st.push(numEncode(r));
          break;
        }
        case OP.OP_NUMEQUALVERIFY: {
          need(2, name);
          const b = numDecode(st.pop()), a = numDecode(st.pop());
          if (a !== b) throw new Error("NUMEQUALVERIFY failed.");
          break;
        }
        case OP.OP_WITHIN: {
          need(3, name);
          const max = numDecode(st.pop()), min = numDecode(st.pop()), x = numDecode(st.pop());
          st.push(min <= x && x < max ? TRUE.slice() : FALSE.slice());
          break;
        }
        case OP.OP_RIPEMD160: { need(1, name); st.push(ripemd160(st.pop())); break; }
        case OP.OP_SHA256: { need(1, name); st.push(sha256(st.pop())); break; }
        case OP.OP_HASH160: { need(1, name); st.push(hash160(st.pop())); break; }
        case OP.OP_HASH256: { need(1, name); st.push(hash256(st.pop())); break; }
        case OP.OP_CODESEPARATOR: case OP.OP_SHA1: throw new Error(`${name} is not taught here.`);
        case OP.OP_CHECKSIG: case OP.OP_CHECKSIGVERIFY: {
          need(2, name);
          const pub = st.pop(), sig = st.pop();
          const ok = checkSig(sig, pub, ctx.msgHash);
          if ((code === OP.OP_CHECKSIGVERIFY) && !ok) throw new Error("CHECKSIGVERIFY failed.");
          if (code === OP.OP_CHECKSIG) st.push(ok ? TRUE.slice() : FALSE.slice());
          break;
        }
        case OP.OP_CHECKMULTISIG: case OP.OP_CHECKMULTISIGVERIFY: {
          const ok = checkMulti(st, ctx.msgHash);
          if ((code === OP.OP_CHECKMULTISIGVERIFY) && !ok) throw new Error("CHECKMULTISIGVERIFY failed.");
          if (code === OP.OP_CHECKMULTISIG) st.push(ok ? TRUE.slice() : FALSE.slice());
          break;
        }
        case OP.OP_CHECKLOCKTIMEVERIFY: {
          need(1, name);
          checkCLTV(st[st.length - 1], ctx);
          break;
        }
        case OP.OP_CHECKSEQUENCEVERIFY: {
          need(1, name);
          checkCSV(st[st.length - 1], ctx);
          break;
        }
        case OP.OP_CHECKSIGADD: {
          need(3, name);
          const n = numDecode(st.pop()), pub = st.pop(), sig = st.pop();
          const ok = sig.length === 0 ? false : checkSchnorr(sig, pub, ctx.tapMsg);
          st.push(numEncode(n + (ok ? 1 : 0)));
          break;
        }
        default: throw new Error(`Disabled or unknown opcode ${code}.`);
      }
      if (st.length + alt.length > LIMITS.maxStack) throw new Error("Stack over 1000 items.");
      trace.push({ op: name, stack: st.map(bytesToHex) });
    }
    if (cond.length) throw new Error("Unclosed IF.");
    if (!st.length) return { ok: false, stack: st, trace, ops: opCount, error: "Empty stack at end." };
    if (!castBool(st[st.length - 1])) return { ok: false, stack: st, trace, ops: opCount, error: "Top item is false." };
    return { ok: true, stack: st, trace, ops: opCount, error: null };
  } catch (e) {
    return { ok: false, stack: st, trace, ops: opCount, error: e.message };
  }
}
// Legacy CHECKSIG: DER sig plus one sighash byte, compressed or full pubkey.
function checkSig(sig, pub, msgHash) {
  if (!msgHash || sig.length < 2) return false;
  const sighash = sig[sig.length - 1];
  if (![0x01, 0x02, 0x03, 0x81, 0x82, 0x83].includes(sighash)) return false;
  let r, s;
  try { ({ r, s } = derDecode(sig.slice(0, -1))); }
  catch { return false; }
  if (s > SECP_N / 2n) return false; // low S per BIP62, enforced since 0.11.1
  let point;
  try {
    if (pub.length === 33) point = pointDecompress(pub);
    else if (pub.length === 65 && pub[0] === 0x04) {
      point = { x: bytesToBig(pub.slice(1, 33)), y: bytesToBig(pub.slice(33)) };
      if (point.x >= SECP_P || point.y >= SECP_P || !isOnCurve(point)) return false;
    } else return false;
  } catch { return false; }
  return ecdsaVerify(point, msgHash, r, s);
}
// Multisig: stack holds dummy, sigs..., m, pubkeys..., n (n on top).
function checkMulti(st, msgHash) {
  try {
    if (st.length < 1) return false;
    const n = numDecode(st.pop());
    if (n < 0 || n > 20 || st.length < n) return false;
    const pubs = [];
    for (let i = 0; i < n; i++) pubs.unshift(st.pop());
    if (st.length < 1) return false;
    const m = numDecode(st.pop());
    if (m < 0 || m > n || st.length < m) return false;
    const sigs = [];
    for (let i = 0; i < m; i++) sigs.unshift(st.pop());
    if (st.length < 1) return false;
    const dummy = st.pop();
    if (dummy.length !== 0) return false; // NULLDUMMY per BIP147
    let sigIdx = 0, keyIdx = 0;
    while (sigIdx < sigs.length && keyIdx < pubs.length) {
      if (checkSig(sigs[sigIdx], pubs[keyIdx], msgHash)) sigIdx++;
      keyIdx++;
    }
    return sigIdx === sigs.length;
  } catch { return false; }
}
// CLTV per BIP65: locktime on stack must be met by the spending tx.
function checkCLTV(top, ctx) {
  const need = numDecode(top);
  if (need < 0) throw new Error("CLTV needs a positive locktime.");
  if (ctx.txLocktime === undefined || ctx.inputSequence === undefined) throw new Error("CLTV needs tx context.");
  if ((need >= 500000000) !== (ctx.txLocktime >= 500000000)) throw new Error("CLTV height and time do not mix.");
  if (need > ctx.txLocktime) throw new Error("CLTV locktime not met.");
  if (ctx.inputSequence === 0xffffffff) throw new Error("CLTV needs a non final sequence.");
}
// CSV per BIP112 script rules: sequence on stack must be met by the input.
function checkCSV(top, ctx) {
  const need = numDecode(top);
  if (need < 0) throw new Error("CSV needs a positive sequence.");
  if (ctx.txVersion === undefined || ctx.inputSequence === undefined) throw new Error("CSV needs tx context.");
  if (ctx.txVersion < 2) throw new Error("CSV needs version 2.");
  if (ctx.inputSequence === 0xffffffff) throw new Error("CSV needs a non final sequence.");
  if (need & 0x80000000) throw new Error("CSV sequence is disabled.");
  if ((need & 0x00400000) !== (ctx.inputSequence & 0x00400000)) throw new Error("CSV height and time do not mix.");
  if ((need & 0x0000ffff) > (ctx.inputSequence & 0x0000ffff)) throw new Error("CSV relative lock not met.");
}
// Tapscript CHECKSIGADD: 64 byte Schnorr sig, 32 byte x-only key.
function checkSchnorr(sig, pub, tapMsg) {
  if (!tapMsg) return false;
  let body = sig;
  if (sig.length === 65) {
    if (![0x00, 0x01, 0x02, 0x03, 0x81, 0x82, 0x83].includes(sig[64])) return false;
    body = sig.slice(0, 64);
  }
  if (body.length !== 64 || pub.length !== 32) return false;
  return schnorrVerify(pub, tapMsg, body);
}
// P2SH per BIP16: run scriptSig, match the template, run the redeem script.
export function executeP2SH(scriptSigBytes, scriptPubKeyBytes, ctx = {}) {
  const first = execute(scriptSigBytes, [], ctx);
  if (!first.ok) return { ...first, error: `scriptSig: ${first.error}` };
  const template = disassemble(scriptPubKeyBytes);
  const okTemplate = template.length === 3 && template[0].code === OP.OP_HASH160
    && template[1].push?.length === 20 && template[2].code === OP.OP_EQUAL;
  if (!okTemplate) return { ok: false, stack: first.stack, trace: first.trace, ops: first.ops, error: "Not a P2SH template." };
  const redeem = first.stack.pop();
  if (!equalBytes(hash160(redeem), template[1].push)) {
    return { ok: false, stack: first.stack, trace: first.trace, ops: first.ops, error: "Redeem hash does not match." };
  }
  const second = execute(redeem, first.stack, ctx);
  return { ...second, trace: first.trace.concat(second.trace), ops: first.ops + second.ops };
}
