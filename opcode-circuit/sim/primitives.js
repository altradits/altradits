// Opcode Circuit sim primitives: hashes, secp256k1, bech32. No DOM. No network.
// SHA-256 per FIPS 180-4. RIPEMD-160 per the reference spec. secp256k1 group
// law per SEC 2. Schnorr per BIP340. bech32 per BIP173, bech32m per BIP350.
// Test vectors live in sim/vectors.js with source cites.
const HEX = "0123456789abcdef";
export function bytesToHex(b) {
  let s = "";
  for (let i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
  return s;
}
export function hexToBytes(s) {
  if (typeof s !== "string" || s.length % 2 !== 0) throw new Error("Bad hex length.");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) throw new Error("Bad hex char.");
    out[i] = v;
  }
  return out;
}
export function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
// Little endian unsigned int helpers for tx and header parsing.
export function readU16LE(b, o) { return b[o] | (b[o + 1] << 8); }
export function readU32LE(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
export function readU64LE(b, o) {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i]);
  return v;
}
export function writeU32LE(v) {
  v >>>= 0;
  return Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255);
}
export function writeU64LE(v) {
  let x = BigInt(v);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { out[i] = Number(x & 255n); x >>= 8n; }
  return out;
}
// Bitcoin compact size (VarInt) per src/serialize.h. Returns [value, bytesUsed].
export function readVarInt(b, o) {
  const first = b[o];
  if (first < 0xfd) return [first, 1];
  if (first === 0xfd) return [readU16LE(b, o + 1), 3];
  if (first === 0xfe) return [readU32LE(b, o + 1), 5];
  const v = readU64LE(b, o + 1);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("VarInt too large.");
  return [Number(v), 9];
}
export function writeVarInt(n) {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return concat(Uint8Array.of(0xfd), Uint8Array.of(n & 255, (n >> 8) & 255));
  if (n <= 0xffffffff) return concat(Uint8Array.of(0xfe), writeU32LE(n));
  return concat(Uint8Array.of(0xff), writeU64LE(n));
}
// SHA-256 per FIPS 180-4 section 6.2. Pure JS. Takes Uint8Array, returns 32 bytes.
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
export function sha256(msg) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const padZeros = (64 - ((withOne + 8) % 64)) % 64;
  const total = withOne + padZeros + 8;
  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(total - 4, bitLen >>> 0, false);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0, false); od.setUint32(4, h1, false); od.setUint32(8, h2, false); od.setUint32(12, h3, false);
  od.setUint32(16, h4, false); od.setUint32(20, h5, false); od.setUint32(24, h6, false); od.setUint32(28, h7, false);
  return out;
}
export function doubleSha256(b) { return sha256(sha256(b)); }
// BIP340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg).
export function taggedHash(tag, msg) {
  const tagHash = sha256(new TextEncoder().encode(tag));
  return sha256(concat(tagHash, tagHash, msg));
}
// RIPEMD-160 per the reference spec. Takes Uint8Array, returns 20 bytes.
export function ripemd160(msg) {
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) | 0;
  const f1 = (x, y, z) => x ^ y ^ z;
  const f2 = (x, y, z) => (x & y) | (~x & z);
  const f3 = (x, y, z) => (x | ~y) ^ z;
  const f4 = (x, y, z) => (x & z) | (y & ~z);
  const f5 = (x, y, z) => x ^ (y | ~z);
  const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
  const RL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
  const RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
  const SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
  const SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const padZeros = (64 - ((withOne + 8) % 64)) % 64;
  const total = withOne + padZeros + 8;
  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLen >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bitLen / 0x100000000), true);
  const X = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) X[i] = dv.getUint32(off + i * 4, true);
    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;
    for (let i = 0; i < 80; i++) {
      const round = (i / 16) | 0;
      const fl = [f1, f2, f3, f4, f5][round];
      const t = (al + fl(bl, cl, dl) + X[RL[i]] + KL[round]) | 0;
      const tl = (rol(t, SL[i]) + el) | 0;
      al = el; el = dl; dl = rol(cl, 10); cl = bl; bl = tl;
      const fr = [f5, f4, f3, f2, f1][round];
      const u = (ar + fr(br, cr, dr) + X[RR[i]] + KR[round]) | 0;
      const tr = (rol(u, SR[i]) + er) | 0;
      ar = er; er = dr; dr = rol(cr, 10); cr = br; br = tr;
    }
    const t = (h1 + cl + dr) | 0;
    h1 = (h2 + dl + er) | 0;
    h2 = (h3 + el + ar) | 0;
    h3 = (h4 + al + br) | 0;
    h4 = (h0 + bl + cr) | 0;
    h0 = t;
  }
  const out = new Uint8Array(20);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0, true); od.setUint32(4, h1, true); od.setUint32(8, h2, true);
  od.setUint32(12, h3, true); od.setUint32(16, h4, true);
  return out;
}
export function hash160(b) { return ripemd160(sha256(b)); }
export function hash256(b) { return doubleSha256(b); }
// secp256k1 per SEC 2: y^2 = x^3 + 7 over Fp. BigInt math. Points as {x, y}
// or null for infinity. All values are BigInt.
export const SECP_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
export const SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
export const SECP_G = {
  x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
};
export function modPow(base, exp, mod) {
  let b = ((base % mod) + mod) % mod, e = exp, out = 1n;
  while (e > 0n) {
    if (e & 1n) out = (out * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return out;
}
export function modInv(a, mod) { return modPow(a, mod - 2n, mod); }
export function pointAdd(p, q) {
  if (p === null) return q;
  if (q === null) return p;
  const P = SECP_P;
  if (p.x === q.x) {
    if (p.y !== q.y) return null;
    if (p.y === 0n) return null;
    const s = ((3n * p.x * p.x) * modInv(2n * p.y, P)) % P;
    const x = (((s * s) % P - p.x - p.x) % P + P) % P;
    const y = ((s * ((p.x - x + P) % P) - p.y) % P + P) % P;
    return { x, y };
  }
  const s = ((q.y - p.y + P) % P * modInv((q.x - p.x + P) % P, P)) % P;
  const x = (((s * s) % P - p.x - q.x) % P + P) % P;
  const y = ((s * ((p.x - x + P) % P) - p.y) % P + P) % P;
  return { x, y };
}
export function pointMult(k, point = SECP_G) {
  let n = ((k % SECP_N) + SECP_N) % SECP_N;
  let out = null, add = point;
  while (n > 0n) {
    if (n & 1n) out = pointAdd(out, add);
    add = pointAdd(add, add);
    n >>= 1n;
  }
  return out;
}
export function bytesToBig(b) {
  let v = 0n;
  for (let i = 0; i < b.length; i++) v = (v << 8n) | BigInt(b[i]);
  return v;
}
export function bigToBytes(v, len) {
  let x = ((v % (1n << (BigInt(len) * 8n))) + (1n << (BigInt(len) * 8n))) % (1n << (BigInt(len) * 8n));
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & 255n); x >>= 8n; }
  return out;
}
export function isOnCurve(p) {
  if (p === null) return false;
  const P = SECP_P;
  return (((p.y * p.y) % P) + P) % P === (((((p.x * p.x) % P) * p.x) % P + 7n) % P);
}
// Compressed encoding: prefix 02 for even y, 03 for odd y, then 32 byte x.
export function pointCompress(p) {
  return concat(Uint8Array.of(p.y % 2n === 0n ? 0x02 : 0x03), bigToBytes(p.x, 32));
}
export function pointDecompress(b) {
  if (b.length !== 33 || (b[0] !== 0x02 && b[0] !== 0x03)) throw new Error("Bad compressed key.");
  const x = bytesToBig(b.slice(1));
  if (x >= SECP_P) throw new Error("Key x out of range.");
  const y2 = (((((x * x) % SECP_P) * x) % SECP_P + 7n) % SECP_P);
  let y = modPow(y2, (SECP_P + 1n) / 4n, SECP_P);
  if ((y * y) % SECP_P !== y2) throw new Error("Key not on curve.");
  const odd = (y % 2n) === 1n;
  if ((b[0] === 0x03) !== odd) y = SECP_P - y;
  return { x, y };
}
// BIP340 lift_x: y is the even root for x, or null when x is not on the curve.
export function liftX(x) {
  if (x >= SECP_P) return null;
  const y2 = ((((x * x) % SECP_P) * x) % SECP_P + 7n) % SECP_P;
  let y = modPow(y2, (SECP_P + 1n) / 4n, SECP_P);
  if ((y * y) % SECP_P !== y2) return null;
  if (y % 2n === 1n) y = SECP_P - y;
  return { x, y };
}
// ECDSA on secp256k1. The nonce k is explicit so puzzles stay deterministic.
// Real wallets derive k per RFC6979. Never reuse k with two messages.
export function ecdsaSign(privBytes, hashBytes, kBig) {
  const d = bytesToBig(privBytes), z = bytesToBig(hashBytes), k = kBig % SECP_N;
  if (d <= 0n || d >= SECP_N) throw new Error("Bad private key.");
  if (k <= 0n || k >= SECP_N) throw new Error("Bad nonce.");
  const rPoint = pointMult(k);
  const r = rPoint.x % SECP_N;
  if (r === 0n) throw new Error("Bad r.");
  const s = (modInv(k, SECP_N) * ((z + r * d) % SECP_N)) % SECP_N;
  if (s === 0n) throw new Error("Bad s.");
  return { r, s };
}
export function ecdsaVerify(pubPoint, hashBytes, r, s) {
  if (pubPoint === null || !isOnCurve(pubPoint)) return false;
  if (r <= 0n || r >= SECP_N || s <= 0n || s >= SECP_N) return false;
  const z = bytesToBig(hashBytes) % SECP_N;
  const w = modInv(s, SECP_N);
  const u1 = (z * w) % SECP_N, u2 = (r * w) % SECP_N;
  const p = pointAdd(pointMult(u1), pointMult(u2, pubPoint));
  if (p === null) return false;
  return (p.x % SECP_N) === r;
}
// DER encode for script sigs (without sighash byte). Minimal ints per BIP66.
function derInt(v) {
  let b = bigToBytes(v, 32);
  let i = 0;
  while (i < 31 && b[i] === 0) i++;
  b = b.slice(i);
  if (b[0] & 0x80) b = concat(Uint8Array.of(0x00), b);
  return concat(Uint8Array.of(0x02, b.length), b);
}
export function derEncode(r, s) {
  const body = concat(derInt(r), derInt(s));
  return concat(Uint8Array.of(0x30, body.length), body);
}
export function derDecode(b) {
  if (b.length < 8 || b[0] !== 0x30) throw new Error("Bad DER prefix.");
  if (b[1] !== b.length - 2) throw new Error("Bad DER length.");
  if (b[2] !== 0x02) throw new Error("Bad DER r.");
  const rLen = b[3], r = bytesToBig(b.slice(4, 4 + rLen));
  const sPos = 4 + rLen;
  if (b[sPos] !== 0x02) throw new Error("Bad DER s.");
  const sLen = b[sPos + 1], s = bytesToBig(b.slice(sPos + 2, sPos + 2 + sLen));
  if (sPos + 2 + sLen !== b.length) throw new Error("Bad DER tail.");
  return { r, s };
}
// BIP340 Schnorr sign. aux is 32 bytes of fresh randomness in production.
// Puzzles pass fixed aux so vectors match the official file byte for byte.
export function schnorrSign(privBytes, msgBytes, auxBytes) {
  const d0 = bytesToBig(privBytes);
  if (d0 <= 0n || d0 >= SECP_N) throw new Error("Bad private key.");
  let d = d0;
  const P = pointMult(d);
  if (P.y % 2n === 1n) d = SECP_N - d;
  const t = (bytesToBig(taggedHash("BIP0340/aux", auxBytes)) ^ d0) % SECP_N;
  const rand = taggedHash("BIP0340/nonce", concat(bigToBytes(t, 32), bigToBytes(P.x, 32), msgBytes));
  let k0 = bytesToBig(rand) % SECP_N;
  if (k0 === 0n) throw new Error("Bad nonce.");
  let R = pointMult(k0);
  let k = k0;
  if (R.y % 2n === 1n) k = SECP_N - k;
  const e = bytesToBig(taggedHash("BIP0340/challenge", concat(bigToBytes(R.x, 32), bigToBytes(P.x, 32), msgBytes))) % SECP_N;
  const sig = concat(bigToBytes(R.x, 32), bigToBytes((k + e * d) % SECP_N, 32));
  if (!schnorrVerify(bigToBytes(P.x, 32), msgBytes, sig)) throw new Error("Signer produced a bad sig.");
  return sig;
}
export function schnorrVerify(pubXBytes, msgBytes, sigBytes) {
  if (pubXBytes.length !== 32 || sigBytes.length !== 64) return false;
  const px = bytesToBig(pubXBytes), r = bytesToBig(sigBytes.slice(0, 32)), s = bytesToBig(sigBytes.slice(32));
  if (r >= SECP_P || s >= SECP_N) return false;
  const P = liftX(px);
  if (P === null) return false;
  const e = bytesToBig(taggedHash("BIP0340/challenge", concat(sigBytes.slice(0, 32), pubXBytes, msgBytes))) % SECP_N;
  const R = pointAdd(pointMult(s), pointMult((SECP_N - e) % SECP_N, P));
  if (R === null || R.y % 2n === 1n || R.x !== r) return false;
  return true;
}
// bech32 per BIP173 and bech32m per BIP350. Lowercase output. Throws on bad input.
const BECH_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH_MAP = {};
for (let i = 0; i < BECH_ALPHABET.length; i++) BECH_MAP[BECH_ALPHABET[i]] = i;
function bechHrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function bechPolymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
function bechChecksum(hrp, data, constant) {
  const pm = bechPolymod(bechHrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0])) ^ constant;
  const out = [];
  for (let i = 0; i < 6; i++) out.push((pm >> (5 * (5 - i))) & 31);
  return out;
}
function bechDecode(str, constant, maxLen = 90) {
  if (str.length < 8 || str.length > maxLen) throw new Error("Bad bech length.");
  let hasLower = false, hasUpper = false;
  for (const c of str) {
    if (c >= "a" && c <= "z") hasLower = true;
    if (c >= "A" && c <= "Z") hasUpper = true;
    const code = c.charCodeAt(0);
    if (code < 33 || code > 126) throw new Error("Bad bech char range.");
  }
  if (hasLower && hasUpper) throw new Error("Mixed case.");
  const s = str.toLowerCase();
  const pos = s.lastIndexOf("1");
  if (pos < 1 || pos + 7 > s.length) throw new Error("Bad bech separator.");
  const hrp = s.slice(0, pos);
  const data = [];
  for (let i = pos + 1; i < s.length; i++) {
    const v = BECH_MAP[s[i]];
    if (v === undefined) throw new Error("Bad bech charset.");
    data.push(v);
  }
  if (bechPolymod(bechHrpExpand(hrp).concat(data)) !== constant) throw new Error("Bad bech checksum.");
  return { hrp, data: data.slice(0, -6) };
}
function bechEncode(hrp, data, constant, maxLen = 90) {
  const h = hrp.toLowerCase();
  if (h.length < 1) throw new Error("Empty HRP.");
  const combined = data.concat(bechChecksum(h, data, constant));
  let s = `${h}1`;
  for (const v of combined) s += BECH_ALPHABET[v];
  if (s.length > maxLen) throw new Error("Bech too long.");
  return s;
}
// Long form for invoices: BOLT11 waives the 90 char address limit.
export function bech32DecodeLong(s) { return bechDecode(s, 1, 2000); }
export function bech32EncodeLong(hrp, data) { return bechEncode(hrp, data, 1, 2000); }
export function bech32Decode(s) { return bechDecode(s, 1); }
export function bech32Encode(hrp, data) { return bechEncode(hrp, data, 1); }
export function bech32mDecode(s) { return bechDecode(s, 0x2bc830a3); }
export function bech32mEncode(hrp, data) { return bechEncode(hrp, data, 0x2bc830a3); }
// Convert between 8 bit bytes and 5 bit words for segwit addresses.
export function convertBits(data, fromBits, toBits, pad) {
  let acc = 0, bits = 0;
  const out = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error("Bad padding.");
  }
  return out;
}
// Segwit address decode per BIP173/BIP350: v0 uses bech32, v1+ uses bech32m.
export function segwitDecode(addr) {
  let out;
  try { out = { ...bechDecode(addr, 1), encoding: "bech32" }; }
  catch { out = { ...bechDecode(addr, 0x2bc830a3), encoding: "bech32m" }; }
  if (out.data.length < 1) throw new Error("Empty program.");
  const version = out.data[0];
  if (version > 16) throw new Error("Bad version.");
  const program = convertBits(out.data.slice(1), 5, 8, false);
  if (program.length < 2 || program.length > 40) throw new Error("Bad program length.");
  if (version === 0 && !(program.length === 20 || program.length === 32)) throw new Error("Bad v0 length.");
  if (version === 0 && out.encoding !== "bech32") throw new Error("v0 must use bech32.");
  if (version !== 0 && out.encoding !== "bech32m") throw new Error("v1+ must use bech32m.");
  return { hrp: out.hrp, version, program: Uint8Array.from(program), encoding: out.encoding };
}
export function segwitEncode(hrp, version, program) {
  if (version < 0 || version > 16) throw new Error("Bad version.");
  const data = [version].concat(convertBits([...program], 8, 5, true));
  return version === 0 ? bechEncode(hrp, data, 1) : bechEncode(hrp, data, 0x2bc830a3);
}
// Base58check per the original client. Alphabet excludes 0 O I l.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58Decode(s) {
  let v = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("Bad base58 char.");
    v = v * 58n + BigInt(i);
  }
  let hex = v.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let body = hex === "00" && v === 0n ? new Uint8Array(0) : hexToBytes(hex);
  let zeros = 0;
  for (const c of s) { if (c !== "1") break; zeros++; }
  return concat(new Uint8Array(zeros), body);
}
export function base58CheckDecode(s) {
  const full = base58Decode(s);
  if (full.length < 5) throw new Error("Too short.");
  const body = full.slice(0, -4), check = full.slice(-4);
  if (!equalBytes(doubleSha256(body).slice(0, 4), check)) throw new Error("Bad base58 checksum.");
  return body;
}
