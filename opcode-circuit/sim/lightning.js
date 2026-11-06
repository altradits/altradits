// Opcode Circuit Lightning sim: funding scripts, HTLC lock and claim, a toy
// invoice codec, routing over a small graph, a toy onion, a channel state
// machine, and a jamming scenario. Real crypto where stated. Anything marked
// TOY differs from the BOLTs on purpose and says so on screen.
import { sha256, hash160, bytesToHex, hexToBytes, concat, equalBytes, bytesToBig, bigToBytes, pointMult, pointCompress, pointDecompress, ecdsaSign, ecdsaVerify, derEncode, SECP_N, convertBits, bech32EncodeLong, bech32DecodeLong } from "./primitives.js";
// BOLT3 funding witness script: 2 <key1> <key2> 2 CHECKMULTISIG. Keys as given.
export function fundingWitnessScript(pub1, pub2) {
  return concat(Uint8Array.of(0x52, 0x21), pub1, Uint8Array.of(0x21), pub2, Uint8Array.of(0x52, 0xae));
}
// P2WSH output script: 0 <sha256(witnessScript)>.
export function p2wshScript(witnessScript) {
  return concat(Uint8Array.of(0x00, 0x20), sha256(witnessScript));
}
export function paymentHash(preimage) { return sha256(preimage); }
// Teaching HTLC script. Core paths only: success needs the preimage plus the
// recipient sig, timeout needs the sender sig after T. Full BOLT3 scripts add
// revocation keys and delayed outputs. See the puzzle debrief.
export function htlcScript(paymentH, recipientPub, senderPub, locktimeT) {
  const t = new Uint8Array(4);
  new DataView(t.buffer).setUint32(0, locktimeT, true);
  let trim = 4;
  while (trim > 1 && t[trim - 1] === 0) trim--;
  const tMin = t.slice(0, trim);
  return concat(
    Uint8Array.of(0x63), // IF
    Uint8Array.of(0xa8, 0x20), paymentH, // SHA256 <H> EQUALVERIFY
    Uint8Array.of(0x88),
    Uint8Array.of(0x21), recipientPub, Uint8Array.of(0xac), // <recipient> CHECKSIG
    Uint8Array.of(0x67), // ELSE
    Uint8Array.of(tMin.length), tMin, Uint8Array.of(0xb1, 0x75), // <T> CLTV DROP
    Uint8Array.of(0x21), senderPub, Uint8Array.of(0xac), // <sender> CHECKSIG
    Uint8Array.of(0x68), // ENDIF
  );
}
// Claim check: preimage hashes to H and height is before T. Refund: at/after T.
export function htlcClaim(preimage, paymentH, height, expiryT) {
  if (!equalBytes(sha256(preimage), paymentH)) return { ok: false, reason: "Preimage does not hash to H." };
  if (height >= expiryT) return { ok: false, reason: "Expiry passed. The sender refunds." };
  return { ok: true, reason: "Preimage valid, before expiry." };
}
export function htlcRefund(height, expiryT) {
  if (height < expiryT) return { ok: false, reason: "Too early. Wait for T." };
  return { ok: true, reason: "Expired. The sender refunds." };
}
// Toy BOLT11: real bech32 checksum, real timestamp and tags, real ECDSA sig.
// Recovery flag skipped: the node key is given. hrp like "lnbc100n".
export function invoiceEncode(hrp, timestamp, tags, privKey) {
  const timeWords = [];
  let t = timestamp;
  for (let i = 0; i < 7; i++) { timeWords.unshift(t & 31); t = Math.floor(t / 32); }
  const tagWords = [];
  for (const { tag, data } of tags) {
    const len = data.length;
    tagWords.push(tag, (len >> 5) & 31, len & 31, ...data);
  }
  const body = timeWords.concat(tagWords);
  const sigHash = sha256(new TextEncoder().encode(hrp + body.map((w) => "qpzry9x8gf2tvdw0s3jn54khce6mua7l"[w]).join("")));
  let { r, s } = ecdsaSign(privKey, sigHash, 42n);
  if (s > SECP_N / 2n) s = SECP_N - s;
  const sigWords = convertBits([...bigToBytes(r, 32), ...bigToBytes(s, 32)], 8, 5, true);
  return bech32EncodeLong(hrp, body.concat(sigWords));
}
export function invoiceDecode(invoice, nodePub) {
  const { hrp, data } = bech32DecodeLong(invoice);
  if (data.length < 7 + 103) throw new Error("Invoice too short.");
  const body = data.slice(0, -103), sigWords = data.slice(-103);
  let timestamp = 0;
  for (let i = 0; i < 7; i++) timestamp = timestamp * 32 + body[i];
  const tags = [];
  let i = 7;
  while (i + 3 <= body.length) {
    const tag = body[i], len = (body[i + 1] << 5) | body[i + 2];
    const words = body.slice(i + 3, i + 3 + len);
    if (words.length !== len) throw new Error("Bad tag length.");
    tags.push({ tag, data: words });
    i += 3 + len;
  }
  const sigBytes = Uint8Array.from(convertBits(sigWords, 5, 8, false));
  const sigHash = sha256(new TextEncoder().encode(hrp + body.map((w) => "qpzry9x8gf2tvdw0s3jn54khce6mua7l"[w]).join("")));
  const r = bytesToBig(sigBytes.slice(0, 32)), s = bytesToBig(sigBytes.slice(32, 64));
  const ok = ecdsaVerify(pointDecompress(nodePub), sigHash, r, s);
  return { hrp, timestamp, tags, sigOk: ok };
}
// Tag letters per BOLT11: p = payment hash, d = description, x = expiry.
export const INVOICE_TAGS = { p: 1, d: 13, x: 6 };
// Route a payment. Edges: { from, to, baseMsat, ratePpm, cltvDelta, minMsat,
// capacityMsat }. Returns { path, feeMsat, cltv } or null.
export function findRoute(edges, from, to, amountMsat, maxCltv = 2016) {
  const best = new Map();
  const prev = new Map();
  const queue = [{ node: from, fee: 0, cltv: 0 }];
  best.set(from, 0);
  while (queue.length) {
    queue.sort((a, b) => a.fee - b.fee);
    const cur = queue.shift();
    if (cur.node === to) break;
    for (const e of edges.filter((x) => x.from === cur.node)) {
      if (amountMsat < e.minMsat || amountMsat > e.capacityMsat) continue;
      const hopFee = e.baseMsat + Math.floor((amountMsat * e.ratePpm) / 1000000);
      const fee = cur.fee + hopFee, cltv = cur.cltv + e.cltvDelta;
      if (cltv > maxCltv) continue;
      if (best.has(e.to) && best.get(e.to) <= fee) continue;
      best.set(e.to, fee);
      prev.set(e.to, { e, from: cur.node });
      queue.push({ node: e.to, fee, cltv });
    }
  }
  if (!best.has(to)) return null;
  const path = [];
  let node = to, cltv = 0;
  while (node !== from) {
    const p = prev.get(node);
    path.unshift(p.e);
    cltv += p.e.cltvDelta;
    node = p.from;
  }
  return { path, feeMsat: best.get(to), cltv };
}
// TOY onion: XOR layers with SHA256(secret || hop). NOT Sphinx. Real onions
// per BOLT4 use ChaCha20-Poly1305 with ephemeral keys. Labelled on screen.
export function toyOnionWrap(hops, payload) {
  let inner = new TextEncoder().encode(payload);
  const layers = [];
  for (let i = hops.length - 1; i >= 0; i--) {
    const secret = sha256(new TextEncoder().encode(`hop-secret-${i}`));
    const head = new TextEncoder().encode(`${hops[i]}|`);
    const body = concat(head, inner);
    const stream = sha256(concat(secret, bigToBytes(BigInt(body.length), 4)));
    const out = new Uint8Array(body.length);
    for (let j = 0; j < body.length; j++) out[j] = body[j] ^ stream[j % stream.length];
    layers.unshift({ forHop: hops[i], secret });
    inner = out;
  }
  return { blob: inner, layers };
}
export function toyOnionPeel(blob, hopIndex) {
  const secret = sha256(new TextEncoder().encode(`hop-secret-${hopIndex}`));
  const stream = sha256(concat(secret, bigToBytes(BigInt(blob.length), 4)));
  const out = new Uint8Array(blob.length);
  for (let j = 0; j < blob.length; j++) out[j] = blob[j] ^ stream[j % stream.length];
  const text = new TextDecoder().decode(out);
  const bar = text.indexOf("|");
  return { nextHop: text.slice(0, bar), remainder: out.slice(bar + 1) };
}
// Two party channel state machine. Simplified: no commitment tx bytes, no
// anchor outputs, no fee negotiation. Revocation is modelled with secrets.
export function channelOpen(balanceA, balanceB) {
  return { state: "OPEN", balanceA, balanceB, pending: [], revoked: [], number: 0 };
}
export function channelAddHTLC(ch, from, amount, paymentH, expiry) {
  if (ch.state !== "OPEN" && ch.state !== "COMMITTED") return { ...ch, error: "Channel not open." };
  const bal = from === "A" ? ch.balanceA : ch.balanceB;
  if (amount > bal) return { ...ch, error: "Insufficient balance." };
  const htlc = { id: ch.pending.length + ch.revoked.length, from, amount, paymentH, expiry, state: "ADDED" };
  return { ...ch, pending: [...ch.pending, htlc], error: null };
}
export function channelCommit(ch) {
  if (!ch.pending.some((h) => h.state === "ADDED")) return { ...ch, error: "Nothing to commit." };
  const pending = ch.pending.map((h) => (h.state === "ADDED" ? { ...h, state: "COMMITTED" } : h));
  return { ...ch, state: "COMMITTED", pending, number: ch.number + 1, error: null };
}
export function channelRevoke(ch, secret) {
  if (ch.state !== "COMMITTED") return { ...ch, error: "Nothing to revoke." };
  return { ...ch, revoked: [...ch.revoked, { number: ch.number - 1, secret }], state: "OPEN", error: null };
}
export function channelSettle(ch, htlcId, preimage, to) {
  const h = ch.pending.find((x) => x.id === htlcId);
  if (!h || h.state !== "COMMITTED") return { ...ch, error: "HTLC not committed." };
  if (!equalBytes(sha256(preimage), hexToBytes(h.paymentH))) return { ...ch, error: "Bad preimage." };
  const pending = ch.pending.filter((x) => x.id !== htlcId);
  const dA = h.from === "A" ? -h.amount : 0, dB = h.from === "B" ? -h.amount : 0;
  const cA = to === "A" ? h.amount : 0, cB = to === "B" ? h.amount : 0;
  return { ...ch, pending, balanceA: ch.balanceA + dA + cA, balanceB: ch.balanceB + dB + cB, error: null };
}
// Jamming scenario (simplified): attacker fills slots with cheap HTLCs.
// Returns how many honest payments are blocked under slot and fee limits.
export function jammingBlocked({ slots, attackerHtlcs, honestNeed, minFeeMsat, attackerFeeMsat }) {
  const free = Math.max(0, slots - attackerHtlcs);
  const feeOk = attackerFeeMsat >= minFeeMsat;
  const blocked = Math.max(0, honestNeed - free);
  return { free, feeOk, blocked, heldCheaply: !feeOk && attackerHtlcs > 0 };
}
