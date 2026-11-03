// Lightning invoices for "scan to pay".
// - LND (preferred): set LND_REST_URL + LND_INVOICE_MACAROON (hex, an
//   invoice-only macaroon: it can create and read invoices, never spend).
//   Optional LND_TLS_CERT (PEM, or base64 of it) for a self-signed node.
//   Settlement is checked against the node, so payments confirm themselves.
// - Fallback: the Lightning address below (LNURL-pay). Invoices
//   are exact-amount, but settlement can't be verified, so Stanley confirms.
import { publicFetch } from "./netsafe.js";
import https from "node:https";
// The public Lightning address: the fallback when the node is offline.
export const PAYMENTS = { lightningAddress: "potablesignal21@walletofsatoshi.com" };

// Reading channels and balances: the read-only macaroon when set, else the invoice one.
const READ = () => process.env.LND_READONLY_MACAROON || process.env.LND_INVOICE_MACAROON;
// A pasted deposit address: shaped like a bc1q address, nothing else. The server
// holds no key that makes addresses; making stays on the Mac.
export const validDepositAddress = (a) => typeof a === "string" && /^bc1q[02-9ac-hj-np-z]{38,58}$/.test(a);

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
// stream: the call answers with one JSON object per line (routerrpc); the last one counts.
function lndRequest(method, path, body, { macaroon = process.env.LND_INVOICE_MACAROON, timeout = 10000, stream = false } = {}) {
  const base = new URL(process.env.LND_REST_URL);
  let ca;
  if (process.env.LND_TLS_CERT) {
    const raw = process.env.LND_TLS_CERT.trim();
    ca = raw.includes("BEGIN CERTIFICATE") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  }
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request({
      // IPv4 only: the tunnel admits the server's IPv4 address, and an IPv6 connection is turned away.
      host: base.hostname, port: base.port || 443, family: 4, method, path: base.pathname.replace(/\/$/, "") + path, ca,
      headers: { "Grpc-Metadata-macaroon": String(macaroon || "").trim(), "Content-Type": "application/json", "ngrok-skip-browser-warning": "1", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(stream ? data.trim().split("\n").filter(Boolean).at(-1) || "{}" : data); } catch { return reject(new Error(`LND ${res.statusCode}: ${data.slice(0, 200)}`)); }
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

// Pays a BOLT11 invoice from the node, routing fees capped at feeLimit sats
// (routerrpc SendPaymentV2: LND 0.21 removed the old SendPaymentSync).
// Returns { status: "succeeded", feeSats, preimage } | { status: "failed", error }
// | { status: "unknown" } (no answer in time: check later with paymentStatus).
export async function payInvoice(pr, feeLimit) {
  if (!canPay()) return { status: "failed", error: "Sending is not switched on." };
  try {
    const r = await lndRequest("POST", "/v2/router/send", { payment_request: pr, fee_limit_sat: String(feeLimit), timeout_seconds: 60, no_inflight_updates: true, allow_self_payment: false },
      { macaroon: process.env.YEBENTE_LND_PAY_MACAROON, timeout: 70000, stream: true });
    const p = r.result || r;
    if (p.status === "SUCCEEDED") return { status: "succeeded", feeSats: Number(p.fee_sat || 0), preimage: p.payment_preimage || null };
    if (p.status === "FAILED") return { status: "failed", error: String(p.failure_reason || "The payment failed.").replace(/^FAILURE_REASON_/, "").toLowerCase().replace(/_/g, " ") };
    if (r.error) return { status: "unknown", error: String(r.error.message || r.error).slice(0, 200) };
  } catch (e) {
    // The node's own words (not a gateway's HTML page), to show if it never started.
    const said = /^LND \d+: ([^<{].*)$/s.exec(e.message)?.[1];
    return { status: "unknown", error: said ? said.slice(0, 200) : undefined };
  }
  // Only the node's own FAILED is final. Any other answer (an error, a dropped
  // tunnel, a gateway page) may come while the node is still paying, so it is
  // checked with paymentStatus before anything is refunded.
  return { status: "unknown" };
}

// What the node can send right now, read with the pay macaroon (offchain:read):
// each active channel's local balance minus the reserve Lightning makes us keep
// in it (1% of the channel). The reserve can never be spent, so a channel whose
// balance is below it can send nothing. null when it can't be read.
export const spendableIn = (channels) => channels.filter((c) => c.active).reduce((t, c) => t + Math.max(0, c.local - (c.localReserve || 0)), 0);
export async function outboundSats() {
  if (!canPay()) return null;
  try {
    const r = await lndRequest("GET", "/v1/channels?active_only=true", null, { macaroon: process.env.YEBENTE_LND_PAY_MACAROON });
    return spendableIn((r.channels || []).map((c) => ({ active: c.active !== false, local: Number(c.local_balance) || 0, localReserve: Number(c.local_constraints?.chan_reserve_sat ?? c.local_chan_reserve_sat) || 0 })));
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
  if (!kesCache.rate) throw new Error("The shilling rate didn't answer. Try again in a minute.");
  return (await btcUsd()) * kesCache.rate;
}

// What happened to an earlier payment: "succeeded" (with feeSats), "failed" or "in_flight".
export async function paymentStatus(hash) {
  const macaroon = process.env.YEBENTE_LND_PAY_MACAROON;
  const r = await lndRequest("GET", "/v1/payments?include_incomplete=true&reversed=true&max_payments=500", null, { macaroon });
  const p = (r.payments || []).find((x) => x.payment_hash === hash);
  if (p?.status === "SUCCEEDED") return { status: "succeeded", feeSats: Number(p.fee_sat || 0) };
  if (p?.status === "FAILED") return { status: "failed" };
  if (p) return { status: "in_flight" };
  // Not among the latest payments: ask the node about this one. "Failed" only
  // when the node says it never started it; anything unclear stays in flight.
  const notStarted = (m) => /isn't initiated|not initiated/i.test(String(m || ""));
  try {
    const t = await lndRequest("GET", `/v2/router/track/${Buffer.from(hash, "hex").toString("base64url")}?no_inflight_updates=true`, null, { macaroon, timeout: 15000, stream: true });
    const s = t.result || t;
    if (s.status === "SUCCEEDED") return { status: "succeeded", feeSats: Number(s.fee_sat || 0) };
    if (s.status === "FAILED" || notStarted(t.error?.message || t.error)) return { status: "failed" };
  } catch (e) {
    if (notStarted(e.message)) return { status: "failed" };
  }
  return { status: "in_flight" };
}

// ------------------------------------------------------------- LNURL-pay
// Amount in a BOLT11 human-readable part, in millisats (null if amountless).
export function bolt11Msats(pr) {
  const m = /^ln(?:bc|tb|bcrt)(\d+)([munp]?)1/i.exec(pr);
  if (!m) return null;
  const n = BigInt(m[1]);
  const per = { "": 100_000_000_000n, m: 100_000_000n, u: 100_000n, n: 100n, p: 0n };
  const msats = m[2].toLowerCase() === "p" ? n / 10n : n * per[m[2].toLowerCase()];
  // More than every bitcoin that can exist is not an amount (2010 overflow lesson).
  return msats > BigInt(MAX_MONEY_SATS) * 1000n ? null : Number(msats);
}

// The payment hash inside a BOLT11 invoice (tagged field "p"), so a payment
// confirmed by hand still has its real reference. null if it can't be read.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export const bolt11PaymentHash = (pr) => bolt11Hash32(pr, 1);
// The description hash ("h" field, LUD-06): SHA-256 of the LNURL metadata. null if absent.
export const bolt11DescriptionHash = (pr) => bolt11Hash32(pr, 23);
function bolt11Hash32(pr, want) {
  const s = String(pr || "").toLowerCase(), sep = s.lastIndexOf("1");
  if (!s.startsWith("ln") || sep < 0) return null;
  const words = [...s.slice(sep + 1, -6)].map((c) => BECH32.indexOf(c));
  if (words.some((w) => w < 0)) return null;
  for (let i = 7; i + 3 <= words.length;) { // after the 35-bit timestamp: type (5 bits), length (10 bits), data
    const type = words[i], len = words[i + 1] * 32 + words[i + 2], data = words.slice(i + 3, i + 3 + len);
    if (type === want && len === 52) { // a 32-byte hash: 52 five-bit words
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

let providerFetch = (u, o) => publicFetch(u, o);
export const setProviderFetcher = (f) => { providerFetch = f; }; // tests

async function lnurlInvoice(msats, comment) {
  const [user, domain] = PAYMENTS.lightningAddress.split("@");
  // The provider's replies name further links (callback, verify): public addresses only.
  const meta = await (await providerFetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, { signal: AbortSignal.timeout(8000), maxBytes: 65536 })).json();
  if (meta.tag !== "payRequest") throw new Error("Lightning address is not an LNURL-pay endpoint");
  if (msats < meta.minSendable || msats > meta.maxSendable) throw new Error("Amount outside what the Lightning address accepts");
  const u = new URL(meta.callback);
  u.searchParams.set("amount", String(msats));
  if (meta.commentAllowed > 0 && comment) u.searchParams.set("comment", comment.slice(0, meta.commentAllowed));
  const inv = await (await providerFetch(u.href, { signal: AbortSignal.timeout(8000), maxBytes: 65536 })).json();
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
    const r = await (await providerFetch(inv.verifyUrl, { signal: AbortSignal.timeout(8000), maxBytes: 65536 })).json();
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
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F1B2D", light: "#FFFFFF" } });
  // Pages insert this with innerHTML: refuse anything but a plain QR picture,
  // so a compromised generator can't smuggle in a script or event handler.
  if (!svg.startsWith("<svg") || /<script|on\w+\s*=|javascript:/i.test(svg)) throw new Error("QR generator returned an unexpected picture.");
  return svg;
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
    const r = await lndRequest("GET", "/v1/balance/channels", null, { macaroon: READ() });
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
    const depth = confirmationsFor(need); // the node's own record, as deep as the amount requires
    for (const tx of r.transactions || []) {
      if (!(Number(tx.num_confirmations) >= depth)) continue;
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
  if (!process.env.LND_REST_URL || !READ()) throw new Error("The node isn't connected (LND_REST_URL and LND_READONLY_MACAROON).");
  const [open, pending] = await Promise.all([lndRequest("GET", "/v1/channels?peer_alias_lookup=true", null, { macaroon: READ() }), lndRequest("GET", "/v1/channels/pending", null, { macaroon: READ() }).catch(() => ({}))]);
  const ch = (c) => ({ id: c.chan_id || c.channel_point, point: c.channel_point, peer: c.remote_pubkey || c.remote_node_pub || "", alias: c.peer_alias || "", capacity: Number(c.capacity) || 0,
    local: Number(c.local_balance) || 0, remote: Number(c.remote_balance) || 0, active: Boolean(c.active), private: Boolean(c.private),
    // The peer must keep its reserve, so that much of its side can never come to us;
    // and we must keep ours, so that much of our side can never be sent.
    reserve: Number(c.remote_constraints?.chan_reserve_sat ?? c.remote_chan_reserve_sat) || 0,
    localReserve: Number(c.local_constraints?.chan_reserve_sat ?? c.local_chan_reserve_sat) || 0, uptime: Number(c.uptime) || 0, lifetime: Number(c.lifetime) || 0 });
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
// Confirmations before an on-chain payment counts, by what is at risk. The
// whitepaper (section 11) shows an attacker's chance of rewriting a payment
// falls exponentially with each block on top; history (the 2013 chain split,
// 51% reorgs on smaller chains) shows one block isn't final for large sums.
export const MAX_MONEY_SATS = 2_100_000_000_000_000; // 21 million BTC: no amount can be larger (2010 overflow lesson)
export const confirmationsFor = (sats) => (sats >= 10_000_000 ? 6 : sats >= 1_000_000 ? 3 : 1);

// What an address has received: "confirmed" counts only outputs at least
// minConfs blocks deep; shallower ones count as unconfirmed.
export async function addressReceived(address, minConfs = 1) {
  for (const base of CHAIN) {
    try {
      if (minConfs <= 1) {
        const a = await (await fetch(`${base}/address/${address}`, { signal: AbortSignal.timeout(8000) })).json();
        if (a.chain_stats) return { confirmed: a.chain_stats.funded_txo_sum, unconfirmed: a.mempool_stats.funded_txo_sum };
        continue;
      }
      const [txs, tip] = await Promise.all([
        fetch(`${base}/address/${address}/txs`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
        fetch(`${base}/blocks/tip/height`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text()).then(Number),
      ]);
      if (!Array.isArray(txs) || !Number.isSafeInteger(tip)) continue;
      let confirmed = 0, unconfirmed = 0;
      for (const tx of txs) {
        const got = (tx.vout || []).filter((o) => o.scriptpubkey_address === address).reduce((t, o) => t + Number(o.value || 0), 0);
        const depth = tx.status?.confirmed ? tip - tx.status.block_height + 1 : 0;
        if (depth >= minConfs) confirmed += got; else unconfirmed += got;
      }
      return { confirmed, unconfirmed, minConfs };
    } catch { /* next source */ }
  }
  throw new Error("Block explorers unavailable");
}

// ------------------------------------------------------------- node status
// The node's own view (admin Node tab). /v1/getinfo needs info:read: set
// LND_READONLY_MACAROON (hex of readonly.macaroon); the other macaroons are tried after it.
export async function nodeInfo() {
  if (!process.env.LND_REST_URL) return null;
  const tries = [process.env.LND_READONLY_MACAROON, process.env.YEBENTE_LND_PAY_MACAROON, process.env.LND_INVOICE_MACAROON].filter(Boolean);
  let last;
  for (const macaroon of tries) {
    try {
      const r = await lndRequest("GET", "/v1/getinfo", null, { macaroon });
      return { alias: r.alias || "", version: String(r.version || "").split(" ")[0], blockHeight: Number(r.block_height) || 0, synced: Boolean(r.synced_to_chain),
        graphSynced: Boolean(r.synced_to_graph), activeChannels: Number(r.num_active_channels) || 0, pendingChannels: Number(r.num_pending_channels) || 0,
        peers: Number(r.num_peers) || 0, network: r.chains?.[0]?.network || "" };
    } catch (err) { last = err; }
  }
  return { error: /403|permission|denied/i.test(String(last?.message)) ? "Set LND_READONLY_MACAROON to see the node's status." : String(last?.message || "Node not reachable.") };
}

// What a node operator learns from (admin dashboard): the on-chain wallet, the
// fee policy on each channel, and what the node routed for others in 30 days.
// Read-only; each part is null when the macaroon can't read it.
export async function nodeDetails(now = Date.now()) {
  if (!process.env.LND_REST_URL || !READ()) return null;
  const get = (path, body) => lndRequest(body ? "POST" : "GET", path, body || null, { macaroon: READ() }).then((r) => r, () => null);
  const since = Math.floor((now - 30 * 864e5) / 1000);
  const [chain, fees, fwd] = await Promise.all([get("/v1/balance/blockchain"), get("/v1/fees"), get("/v1/switch", { start_time: String(since), end_time: String(Math.floor(now / 1000)), num_max_events: 10000 })]);
  const events = fwd?.forwarding_events || [];
  return {
    onchain: chain ? { confirmed: Number(chain.confirmed_balance) || 0, unconfirmed: Number(chain.unconfirmed_balance) || 0 } : null,
    fees: fees ? (fees.channel_fees || []).map((f) => ({ point: f.channel_point || "", baseMsat: Number(f.base_fee_msat) || 0, ppm: Number(f.fee_per_mil) || 0 })) : null,
    earned: fees ? { day: Number(fees.day_fee_sum) || 0, week: Number(fees.week_fee_sum) || 0, month: Number(fees.month_fee_sum) || 0 } : null,
    forwards: fwd ? { count: events.length, volumeSats: events.reduce((t, e) => t + (Number(e.amt_out) || 0), 0), feeSats: events.reduce((t, e) => t + (Number(e.fee) || 0), 0) } : null,
  };
}

// The node explorer (admin): everything a new operator can learn from the node,
// read with the read-only macaroon. Each part is null when it can't be read.
const scid = (id) => { try { const n = BigInt(id); if (n < 1n << 40n) return null; return `${n >> 40n}x${(n >> 16n) & 0xffffffn}x${n & 0xffffn}`; } catch { return null; } };
// Each on-chain coin (UTXO): address holding it, size, confirmations, and outpoint. Pure.
export function summarizeUtxos(list) {
  const coins = (Array.isArray(list) ? list : []).filter((u) => u?.address && u?.amount_sat != null)
    .map((u) => ({ address: String(u.address), sats: Number(u.amount_sat) || 0, confs: Number(u.confirmations) || 0, outpoint: String(u.outpoint || "") }));
  return { count: coins.length, sats: coins.reduce((t, c) => t + c.sats, 0), coins };
}

export async function nodeExplorer(now = Date.now()) {
  if (!process.env.LND_REST_URL || !READ()) return null;
  const get = (p) => lndRequest("GET", p, null, { macaroon: READ(), timeout: 7000 }).then((r) => r, () => null);
  const since = Math.floor((now - 30 * 864e5) / 1000);
  const [info, graph, chans, peers, pays, invs, utxos, closed] = await Promise.all([get("/v1/getinfo"), get("/v1/graph/info"), get("/v1/channels?peer_alias_lookup=true"), get("/v1/peers"),
    get(`/v1/payments?include_incomplete=true&reversed=true&max_payments=500&creation_date_start=${since}`), get("/v1/invoices?reversed=true&num_max_invoices=1000"),
    get("/v1/utxos?min_confs=0&max_confs=2147483647"), get("/v1/channels/closed")]);
  const recentInvs = (invs?.invoices || []).filter((i) => Number(i.creation_date) >= since);
  return {
    info: info ? { pubkey: info.identity_pubkey || "", color: info.color || "", lastBlockAt: info.best_header_timestamp ? new Date(Number(info.best_header_timestamp) * 1000).toISOString() : null,
      inactive: Number(info.num_inactive_channels) || 0, commit: String(info.commit_hash || "").slice(0, 12), uris: (info.uris || []).length } : null,
    graph: graph ? { nodes: Number(graph.num_nodes) || 0, channels: Number(graph.num_channels) || 0, diameter: Number(graph.graph_diameter) || 0, avgOutDegree: Math.round((Number(graph.avg_out_degree) || 0) * 10) / 10 } : null,
    channels: chans ? (chans.channels || []).map((c) => ({ alias: c.peer_alias || "", scid: scid(c.chan_id), point: c.channel_point || "", type: c.commitment_type || "", initiator: Boolean(c.initiator),
      updates: Number(c.num_updates) || 0, sent: Number(c.total_satoshis_sent) || 0, received: Number(c.total_satoshis_received) || 0, commitFee: Number(c.commit_fee) || 0,
      csvDelay: Number(c.csv_delay || c.local_constraints?.csv_delay) || 0, uptimePct: Number(c.lifetime) ? Math.round((Number(c.uptime) / Number(c.lifetime)) * 1000) / 10 : null,
      pendingHtlcs: (c.pending_htlcs || []).length })) : null,
    peers: peers ? (peers.peers || []).map((p) => ({ pubkey: p.pub_key || "", inbound: Boolean(p.inbound), pingMs: Math.round((Number(p.ping_time) || 0) / 1000), flaps: Number(p.flap_count) || 0,
      sync: p.sync_type || "", satSent: Number(p.sat_sent) || 0, satRecv: Number(p.sat_recv) || 0 })) : null,
    payments: pays ? (() => { const ok = (pays.payments || []).filter((p) => p.status === "SUCCEEDED"); return { count: (pays.payments || []).length, succeeded: ok.length,
      failed: (pays.payments || []).filter((p) => p.status === "FAILED").length, sats: ok.reduce((t, p) => t + (Number(p.value_sat) || 0), 0), feeSats: ok.reduce((t, p) => t + (Number(p.fee_sat) || 0), 0) }; })() : null,
    invoices: invs ? { count: recentInvs.length, settled: recentInvs.filter((i) => i.state === "SETTLED").length, expired: recentInvs.filter((i) => i.state === "CANCELED").length,
      sats: recentInvs.filter((i) => i.state === "SETTLED").reduce((t, i) => t + (Number(i.amt_paid_sat) || 0), 0) } : null,
    utxos: utxos ? summarizeUtxos(utxos.utxos) : null,
    closed: closed ? (closed.channels || []).map((c) => ({ type: c.close_type || "", capacity: Number(c.capacity) || 0, settled: Number(c.settled_balance) || 0, height: Number(c.close_height) || 0 })) : null,
  };
}

// Money in and out of the node over a period (admin profit and loss), read-only.
export async function nodeMoney({ days = 30, now = Date.now() } = {}) {
  if (!process.env.LND_REST_URL || !READ()) return null;
  const get = (p, body) => lndRequest(body ? "POST" : "GET", p, body || null, { macaroon: READ(), timeout: 7000 }).then((r) => r, () => null);
  const since = Math.floor((now - days * 864e5) / 1000), until = Math.floor(now / 1000);
  const [pays, fwd, txs, bal, chain] = await Promise.all([get(`/v1/payments?include_incomplete=false&reversed=true&max_payments=2000&creation_date_start=${since}`),
    get("/v1/switch", { start_time: String(since), end_time: String(until), num_max_events: 10000 }), get(`/v1/transactions?start_height=0&end_height=-1`),
    get("/v1/balance/channels"), get("/v1/balance/blockchain")]);
  const ok = (pays?.payments || []).filter((p) => p.status === "SUCCEEDED");
  const tx = (txs?.transactions || []).filter((t) => Number(t.time_stamp) >= since);
  return {
    paid: pays ? { count: ok.length, sats: ok.reduce((t, p) => t + (Number(p.value_sat) || 0), 0), feeSats: ok.reduce((t, p) => t + (Number(p.fee_sat) || 0), 0) } : null,
    routed: fwd ? { count: (fwd.forwarding_events || []).length, feeSats: (fwd.forwarding_events || []).reduce((t, e) => t + (Number(e.fee) || 0), 0) } : null,
    onchainFees: txs ? tx.reduce((t, x) => t + (Number(x.total_fees) || 0), 0) : null,
    localSats: bal ? Number(bal.local_balance?.sat ?? bal.balance) || 0 : null,
    onchainSats: chain ? Number(chain.confirmed_balance) || 0 : null,
  };
}

// Total node balance including funds in transit, read with the read-only
// macaroon for the 5-minute Deadman's Switch balance check:
//   - /v1/balance/channels: local_balance + pending_open_local_balance + unsettled_local_balance
//   - /v1/balance/blockchain: confirmed_balance + unconfirmed_balance
//   - /v1/channels/pending: total_limbo_balance
export async function nodeTotalBalance() {
  if (!process.env.LND_REST_URL || !READ()) return null;
  try {
    const [bal, chain, pending] = await Promise.all([
      lndRequest("GET", "/v1/balance/channels", null, { macaroon: READ(), timeout: 7000 }),
      lndRequest("GET", "/v1/balance/blockchain", null, { macaroon: READ(), timeout: 7000 }),
      lndRequest("GET", "/v1/channels/pending", null, { macaroon: READ(), timeout: 7000 }),
    ]);
    const localSats = Number(bal?.local_balance?.sat ?? bal?.balance) || 0;
    const pendingOpenSats = Number(bal?.pending_open_local_balance?.sat ?? bal?.pending_open_balance) || 0;
    const unsettledSats = Number(bal?.unsettled_local_balance?.sat ?? bal?.unsettled_balance) || 0;
    const confirmedSats = Number(chain?.confirmed_balance) || 0;
    const unconfirmedSats = Number(chain?.unconfirmed_balance) || 0;
    const limboSats = Number(pending?.total_limbo_balance) || 0;
    const channelSats = localSats + pendingOpenSats + unsettledSats;
    const onchainSats = confirmedSats + unconfirmedSats;
    return {
      totalSats: channelSats + onchainSats + limboSats,
      channelSats,
      onchainSats,
      limboSats,
      localSats,
      pendingOpenSats,
      unsettledSats,
      confirmedSats,
      unconfirmedSats,
    };
  } catch {
    return null;
  }
}

// The chain tip as the public sees it (mempool.space), to compare with the node.
export async function chainTip() {
  const r = await providerFetch("https://mempool.space/api/blocks/tip/height", { signal: AbortSignal.timeout(8000), maxBytes: 64 });
  const n = Number(String(await r.text()).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
