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
function lndRequest(method, path, body) {
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
      headers: { "Grpc-Metadata-macaroon": process.env.LND_INVOICE_MACAROON.trim(), "Content-Type": "application/json", "ngrok-skip-browser-warning": "1", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(data); } catch { return reject(new Error(`LND ${res.statusCode}: ${data.slice(0, 200)}`)); }
        if (res.statusCode >= 400) return reject(new Error(`LND ${res.statusCode}: ${json.message || json.error || data.slice(0, 200)}`));
        resolve(json);
      });
    });
    req.on("timeout", () => req.destroy(new Error("LND request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
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
export async function createInvoice({ usd, sats: fixedSats, memo, expiry = 3600, descriptionHash }) {
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
      if (descriptionHash || !PAYMENTS.lightningAddress) throw err;
      console.error("LND unavailable, using the Lightning address:", err.message);
    }
  }
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
