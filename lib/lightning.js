// Lightning invoices for "scan to pay".
// - LND (preferred): set LND_REST_URL + LND_INVOICE_MACAROON (hex, an
//   invoice-only macaroon: it can create and read invoices, never spend).
//   Optional LND_TLS_CERT (PEM, or base64 of it) for a self-signed node.
//   Settlement is checked against the node, so payments confirm themselves.
// - Fallback: the Lightning address in data/catalog.js (LNURL-pay). Invoices
//   are exact-amount, but settlement can't be verified, so Stanley confirms.
import https from "node:https";
import { PAYMENTS } from "../data/catalog.js";

export const lightningMode = () =>
  process.env.LND_REST_URL && process.env.LND_INVOICE_MACAROON ? "lnd" : PAYMENTS.lightningAddress ? "address" : null;

// ------------------------------------------------------------- BTC price
let priceCache = { usd: 0, at: 0 };
export async function btcUsd() {
  if (priceCache.usd && Date.now() - priceCache.at < 5 * 60e3) return priceCache.usd;
  const sources = [
    ["https://api.coinbase.com/v2/prices/BTC-USD/spot", (j) => Number(j.data.amount)],
    ["https://api.kraken.com/0/public/Ticker?pair=XBTUSD", (j) => Number(Object.values(j.result)[0].c[0])],
  ];
  for (const [url, pick] of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const usd = pick(await res.json());
      if (usd > 1000) { priceCache = { usd, at: Date.now() }; return usd; }
    } catch { /* try the next source */ }
  }
  if (priceCache.usd) return priceCache.usd; // stale beats nothing
  throw new Error("BTC price unavailable");
}

export async function usdToSats(usd) {
  return Math.ceil((usd / (await btcUsd())) * 1e8);
}

// ------------------------------------------------------------- LND REST
// Read and invoice calls use LND_INVOICE_MACAROON. Paying uses its own,
// narrower macaroon (YEBENTE_LND_PAY_MACAROON), never the admin one.
function lndRequest(method, path, body, { macaroon = process.env.LND_INVOICE_MACAROON, timeout = 10000 } = {}) {
  const base = new URL(process.env.LND_REST_URL);
  let ca;
  if (process.env.LND_TLS_CERT) {
    const raw = process.env.LND_TLS_CERT.trim();
    ca = raw.includes("BEGIN CERTIFICATE") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  }
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: base.hostname, port: base.port || 443, method, path: base.pathname.replace(/\/$/, "") + path, ca,
      headers: { "Grpc-Metadata-macaroon": String(macaroon || "").trim(), "Content-Type": "application/json", "ngrok-skip-browser-warning": "1", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(data); } catch { return reject(new Error(`LND ${res.statusCode}: ${data.slice(0, 200)}`)); }
        if (res.statusCode >= 400) return reject(new Error(`LND ${res.statusCode}: ${json.message || json.error?.message || json.error || data.slice(0, 200)}`));
        resolve(json);
      });
    });
    req.on("timeout", () => req.destroy(new Error("LND request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ------------------------------------------------------------- paying (Ye₿ente wallets)
export const canPay = () => Boolean(process.env.LND_REST_URL && process.env.YEBENTE_LND_PAY_MACAROON);

// Pays a BOLT11 invoice from the node, routing fees capped at feeLimit sats.
// Returns { status: "succeeded", feeSats, preimage } | { status: "failed", error }
// | { status: "unknown" } (timed out: check later with paymentStatus).
export async function payInvoice(pr, feeLimit) {
  if (!canPay()) return { status: "failed", error: "Sending is not switched on." };
  try {
    const r = await lndRequest("POST", "/v1/channels/transactions", { payment_request: pr, fee_limit: { fixed: String(feeLimit) }, allow_self_payment: false },
      { macaroon: process.env.YEBENTE_LND_PAY_MACAROON, timeout: 65000 });
    if (r.payment_error) return { status: "failed", error: String(r.payment_error).slice(0, 200) };
    return { status: "succeeded", feeSats: Number(r.payment_route?.total_fees || 0), preimage: r.payment_preimage ? Buffer.from(r.payment_preimage, "base64").toString("hex") : null };
  } catch (e) {
    if (/timed out|socket hang up|ECONNRESET/i.test(e.message)) return { status: "unknown" };
    return { status: "failed", error: e.message.replace(/^LND \d+: /, "").slice(0, 200) };
  }
}

// What the node can send right now (local channel balance), read with the pay
// macaroon (offchain:read). null when it can't be read.
export async function outboundSats() {
  if (!canPay()) return null;
  try {
    const r = await lndRequest("GET", "/v1/balance/channels", null, { macaroon: process.env.YEBENTE_LND_PAY_MACAROON });
    return Number(r.local_balance?.sat ?? r.balance ?? 0);
  } catch { return null; }
}

// Kenyan shillings per bitcoin: the BTC/USD price above times USD/KES (cached an hour).
let kesCache = { rate: null, at: 0 };
export async function btcKes() {
  if (!kesCache.rate || Date.now() - kesCache.at > 3600e3) {
    try {
      const j = await (await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(6000) })).json();
      const kes = Number(j?.rates?.KES);
      if (kes > 50 && kes < 1000) kesCache = { rate: kes, at: Date.now() };
    } catch { /* keep the last rate */ }
  }
  if (!kesCache.rate) throw new Error("KES rate unavailable");
  return (await btcUsd()) * kesCache.rate;
}

// What happened to an earlier payment: "succeeded" (with feeSats), "failed" or "in_flight".
export async function paymentStatus(hash) {
  const r = await lndRequest("GET", "/v1/payments?include_incomplete=true&reversed=true&max_payments=500", null, { macaroon: process.env.YEBENTE_LND_PAY_MACAROON });
  const p = (r.payments || []).find((x) => x.payment_hash === hash);
  if (!p) return { status: "failed" }; // never left the node
  if (p.status === "SUCCEEDED") return { status: "succeeded", feeSats: Number(p.fee_sat || 0) };
  if (p.status === "FAILED") return { status: "failed" };
  return { status: "in_flight" };
}

// ------------------------------------------------------------- LNURL-pay
// Amount in a BOLT11 human-readable part, in millisats (null if amountless).
export function bolt11Msats(pr) {
  const m = /^ln(?:bc|tb|bcrt)(\d+)([munp]?)1/i.exec(pr);
  if (!m) return null;
  const n = BigInt(m[1]);
  const per = { "": 100_000_000_000n, m: 100_000_000n, u: 100_000n, n: 100n, p: 0n };
  return m[2].toLowerCase() === "p" ? Number(n / 10n) : Number(n * per[m[2].toLowerCase()]);
}

// The payment hash inside a BOLT11 invoice (tagged field "p"), so a payment
// confirmed by hand still has its real reference. null if it can't be read.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export function bolt11PaymentHash(pr) {
  const s = String(pr || "").toLowerCase(), sep = s.lastIndexOf("1");
  if (!s.startsWith("ln") || sep < 0) return null;
  const words = [...s.slice(sep + 1, -6)].map((c) => BECH32.indexOf(c));
  if (words.some((w) => w < 0)) return null;
  for (let i = 7; i + 3 <= words.length;) { // after the 35-bit timestamp: type (5 bits), length (10 bits), data
    const type = words[i], len = words[i + 1] * 32 + words[i + 2], data = words.slice(i + 3, i + 3 + len);
    if (type === 1 && len === 52) { // payment hash: 52 five-bit words = 32 bytes
      let acc = 0, bits = 0, hex = "";
      for (const w of data) { acc = (acc << 5) | w; bits += 5; while (bits >= 8) { bits -= 8; hex += ((acc >> bits) & 255).toString(16).padStart(2, "0"); } }
      return hex.slice(0, 64);
    }
    i += 3 + len;
  }
  return null;
}
// The custodial wallet behind the fallback Lightning address, for the books.
export const fallbackWallet = () => ({ "walletofsatoshi.com": "Wallet of Satoshi" })[String(PAYMENTS.lightningAddress || "").split("@")[1]] || PAYMENTS.lightningAddress || "Lightning address";

async function lnurlInvoice(msats, comment) {
  const [user, domain] = PAYMENTS.lightningAddress.split("@");
  const meta = await (await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, { signal: AbortSignal.timeout(8000) })).json();
  if (meta.tag !== "payRequest") throw new Error("Lightning address is not an LNURL-pay endpoint");
  if (msats < meta.minSendable || msats > meta.maxSendable) throw new Error("Amount outside what the Lightning address accepts");
  const u = new URL(meta.callback);
  u.searchParams.set("amount", String(msats));
  if (meta.commentAllowed > 0 && comment) u.searchParams.set("comment", comment.slice(0, meta.commentAllowed));
  const inv = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
  if (!inv.pr) throw new Error(inv.reason || "Lightning address returned no invoice");
  // Never show an invoice for a different amount than we asked for.
  if (bolt11Msats(inv.pr) !== msats) throw new Error("Invoice amount mismatch");
  return { pr: inv.pr, verify: inv.verify || null };
}

// ------------------------------------------------------------- public API
// Pass `usd` (converted at the live rate) or an exact `sats` amount.
// nodeOnly: never fall back to the Lightning address (money must land on the node).
export async function createInvoice({ usd, sats: fixedSats, memo, expiry = 3600, descriptionHash, nodeOnly = false }) {
  const mode = lightningMode();
  if (!mode) throw new Error("Lightning is not configured");
  const btc = fixedSats ? null : await btcUsd();
  const sats = fixedSats ? Math.ceil(fixedSats) : Math.ceil((usd / btc) * 1e8);
  const base = { usd: usd ?? null, sats, rate: btc ? Math.round(btc) : null, createdAt: new Date().toISOString() };
  if (mode === "lnd") {
    try {
      // More than the channel can receive would fail over Lightning: use the
      // Lightning address instead (custodial, no capacity limit).
      const inbound = descriptionHash ? null : await inboundSats();
      if (inbound !== null && sats > inbound * 0.9) throw new Error(`Amount above inbound capacity (${inbound} sats)`);
      // private: include route hints, so payers can reach a node whose channels
      // are unannounced (the usual setup for a shop node).
      // LNURL-pay invoices commit to the metadata via description_hash (LUD-06).
      const r = await lndRequest("POST", "/v1/invoices", { value: String(sats), expiry: String(expiry), private: true,
        ...(descriptionHash ? { description_hash: Buffer.from(descriptionHash, "hex").toString("base64") } : { memo: memo.slice(0, 600) }) });
      return { ...base, provider: "lnd", bolt11: r.payment_request, paymentHash: Buffer.from(r.r_hash, "base64").toString("hex"),
        expiresAt: new Date(Date.now() + expiry * 1000).toISOString(), autoConfirm: true };
    } catch (err) {
      // Node offline (Mac asleep, tunnel down): still give the client a payable
      // QR from the Lightning address; Stanley confirms that payment manually.
      if (descriptionHash || nodeOnly || !PAYMENTS.lightningAddress) throw err;
      console.error("LND unavailable, using the Lightning address:", err.message);
    }
  }
  if (nodeOnly) throw new Error("The node isn't connected.");
  const { pr, verify } = await lnurlInvoice(sats * 1000, memo);
  return { ...base, provider: "address", bolt11: pr, verifyUrl: verify,
    expiresAt: new Date(Date.now() + 10 * 60e3).toISOString(), autoConfirm: Boolean(verify) };
}

// true = paid, false = not yet, null = can't tell (Stanley confirms).
export async function invoicePaid(inv) {
  if (inv.provider === "lnd" && lightningMode() === "lnd") {
    const r = await lndRequest("GET", `/v1/invoice/${inv.paymentHash}`);
    return r.state === "SETTLED";
  }
  if (inv.verifyUrl) {
    const r = await (await fetch(inv.verifyUrl, { signal: AbortSignal.timeout(8000) })).json();
    return r.settled === true;
  }
  return null;
}

export async function qrPng(text) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toBuffer(text, { type: "png", margin: 2, width: 360, errorCorrectionLevel: "M" });
}

export async function qrSvg(text) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F1B2D", light: "#FFFFFF" } });
}

// ---------------------------------------------------------------- any wallet
// On-chain payments go straight to the node's wallet (no channel capacity
// needed). Needs a macaroon with address:write; inbound capacity checks need
// offchain:read. Both degrade gracefully when the permission is missing.
let capacity = { at: 0, inbound: null };
export async function inboundSats() {
  if (lightningMode() !== "lnd") return null;
  if (Date.now() - capacity.at < 60e3) return capacity.inbound;
  try {
    const r = await lndRequest("GET", "/v1/balance/channels");
    capacity = { at: Date.now(), inbound: Number(r.remote_balance?.sat ?? 0) };
  } catch {
    capacity = { at: Date.now(), inbound: null }; // no permission or node offline
  }
  return capacity.inbound;
}
// What the node itself has recorded for a payment: a settled node invoice
// (with the sats actually received) or a confirmed on-chain payment to the
// node's own address. null when the node shows nothing (or isn't reachable).
// Receipts are issued only from this (lib/finance.js).
export async function nodeSettlement({ invoices = [], address = null, need = 0 } = {}) {
  if (lightningMode() !== "lnd") return null;
  for (const inv of invoices.filter((i) => i?.provider === "lnd" && i.paymentHash)) {
    const r = await lndRequest("GET", `/v1/invoice/${inv.paymentHash}`);
    if (r.state === "SETTLED") return { sats: Number(r.amt_paid_sat) || Number(r.value) || 0, reference: inv.paymentHash, at: r.settle_date ? new Date(Number(r.settle_date) * 1000).toISOString() : new Date().toISOString(), onchain: false };
  }
  if (address) {
    const r = await lndRequest("GET", "/v1/transactions");
    let sats = 0;
    const txids = [];
    for (const tx of r.transactions || []) {
      if (!(Number(tx.num_confirmations) >= 1)) continue;
      const got = (tx.output_details || []).filter((o) => o.address === address).reduce((t, o) => t + Number(o.amount || 0), 0);
      if (got > 0) { sats += got; txids.push(tx.tx_hash); }
    }
    if (sats > 0 && sats >= need) return { sats, reference: `onchain:${address}`, txids, at: new Date().toISOString(), onchain: true };
  }
  return null;
}

// Receive-only check: can the website's node key send money? Asks LND to send
// to nothing (an empty payment request, an empty address), which can never
// move funds. LND checks the key's permissions first: "permission denied" means
// it can't send; a validation error means it could. null = can't tell (node
// not reachable, or an unexpected answer).
export async function spendCheck() {
  if (lightningMode() !== "lnd") return null;
  const verdict = (message) => (/permission denied/i.test(message) ? false : /invalid|decode|must|required|address|amount|payment/i.test(message) ? true : null);
  const probe = async (path, body) => {
    try { const r = await lndRequest("POST", path, body); return r?.error ? verdict(r.error.message || "") : true; } // streamed calls answer 200 with {error}
    catch (err) { return /^LND \d{3}/.test(err.message) ? verdict(err.message) : null; }
  };
  const [lightning, onchain] = await Promise.all([probe("/v2/router/send", { payment_request: "" }), probe("/v1/transactions", { addr: "", amount: "0" })]);
  return lightning === null && onchain === null ? null : { lightning, onchain };
}

// Every channel and every channel still opening (offchain:read, the same
// permission the inbound check above uses). Throws when the node can't be read.
export async function lndChannels() {
  if (!process.env.LND_REST_URL || !process.env.LND_INVOICE_MACAROON) throw new Error("The node isn't connected (LND_REST_URL and LND_INVOICE_MACAROON).");
  const [open, pending] = await Promise.all([lndRequest("GET", "/v1/channels?peer_alias_lookup=true"), lndRequest("GET", "/v1/channels/pending").catch(() => ({}))]);
  const ch = (c) => ({ id: c.chan_id || c.channel_point, point: c.channel_point, peer: c.remote_pubkey || c.remote_node_pub || "", alias: c.peer_alias || "", capacity: Number(c.capacity) || 0,
    local: Number(c.local_balance) || 0, remote: Number(c.remote_balance) || 0, active: Boolean(c.active), private: Boolean(c.private),
    // The peer must keep its reserve, so that much of its side can never come to us.
    reserve: Number(c.remote_constraints?.chan_reserve_sat ?? c.remote_chan_reserve_sat) || 0, uptime: Number(c.uptime) || 0, lifetime: Number(c.lifetime) || 0 });
  return {
    channels: (open.channels || []).map(ch),
    pending: (pending.pending_open_channels || []).map((p) => ({ ...ch(p.channel || {}), status: "opening" }))
      .concat((pending.waiting_close_channels || []).map((p) => ({ ...ch(p.channel || {}), status: "closing" }))),
  };
}
export function resetCapacityCache() { capacity = { at: 0, inbound: null }; } // tests

export async function newOnchainAddress() {
  // Native segwit (bc1q…): accepted by practically every wallet and exchange.
  const r = await lndRequest("GET", "/v1/newaddress?type=WITNESS_PUBKEY_HASH");
  if (!/^(bc1|tb1|bcrt1)/.test(r.address || "")) throw new Error("No address returned");
  return r.address;
}

const CHAIN = process.env.CHAIN_APIS ? process.env.CHAIN_APIS.split(",") : ["https://mempool.space/api", "https://blockstream.info/api"];

// sat/vB for fast (~10 min), normal (~30 min) and slow (~1 h) confirmation.
export async function onchainFeeRates() {
  for (const base of CHAIN) {
    try {
      if (base.includes("blockstream")) {
        const e = await (await fetch(`${base}/fee-estimates`, { signal: AbortSignal.timeout(6000) })).json();
        return { fast: Math.ceil(e["1"] || e["2"]), normal: Math.ceil(e["3"] || e["2"]), slow: Math.ceil(e["6"] || e["3"]) };
      }
      const f = await (await fetch(`${base}/v1/fees/recommended`, { signal: AbortSignal.timeout(6000) })).json();
      if (f.fastestFee) return { fast: f.fastestFee, normal: f.halfHourFee, slow: f.hourFee };
    } catch { /* next source */ }
  }
  return null;
}

// Sats received at an address: confirmed and still in the mempool.
export async function addressReceived(address) {
  for (const base of CHAIN) {
    try {
      const a = await (await fetch(`${base}/address/${address}`, { signal: AbortSignal.timeout(8000) })).json();
      if (a.chain_stats) return { confirmed: a.chain_stats.funded_txo_sum, unconfirmed: a.mempool_stats.funded_txo_sum };
    } catch { /* next source */ }
  }
  throw new Error("Block explorers unavailable");
}
