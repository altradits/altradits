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
export async function createInvoice({ usd, memo }) {
  const mode = lightningMode();
  if (!mode) throw new Error("Lightning is not configured");
  const btc = await btcUsd();
  const sats = Math.ceil((usd / btc) * 1e8);
  const base = { usd, sats, rate: Math.round(btc), createdAt: new Date().toISOString() };
  if (mode === "lnd") {
    const expiry = 3600;
    const r = await lndRequest("POST", "/v1/invoices", { value: String(sats), memo: memo.slice(0, 600), expiry: String(expiry) });
    return { ...base, provider: "lnd", bolt11: r.payment_request, paymentHash: Buffer.from(r.r_hash, "base64").toString("hex"),
      expiresAt: new Date(Date.now() + expiry * 1000).toISOString(), autoConfirm: true };
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
