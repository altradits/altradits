// Lightning-address lookups for the Ye₿ente app, done here on the server so
// the wallet page's policy can refuse every outside host but its fixed feeds.
//
// Both the address (typed by the visitor) and the LNURL server (anyone's) are
// untrusted, and this proxy is an SSRF surface, so one helper does every
// check: https only, no userinfo, public IPs only (checked on the IP actually
// connected to, so DNS rebinding finds nothing), no redirects, a short
// timeout, 64 kB at most, JSON only. The invoice step also requires the
// callback on the same host and an invoice for exactly the asked amount.
// Every upstream failure collapses to one sentence, so the proxy can't be
// used to map our network.
import { publicFetch } from "./netsafe.js";
import { lnurlToUrl } from "./lnurl.js";
import { bolt11Msats, bolt11DescriptionHash } from "./lightning.js";
import { clean } from "./http.js";
import crypto from "node:crypto";

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const UNREACHABLE = "That Lightning address isn't reachable.";

let addrFetch = (u, o) => publicFetch(u, o);
export const setLnaddrFetcher = (f) => { addrFetch = f || ((u, o) => publicFetch(u, o)); }; // tests

// A strict user@domain: one @, a short user of plain characters, a dotted
// domain of sound labels. No IP literals, no trailing dot, no blank labels.
const USER = /^[a-z0-9._+-]{1,64}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z]{2,}$/;
export function parseLnAddress(input) {
  const bad = "Enter a Lightning address like name@wallet.com.";
  const cleanInput = String(input || "").trim().replace(/^lightning:/i, "").toLowerCase();
  const at = cleanInput.indexOf("@");
  if (cleanInput.length > 254 || at < 0 || at !== cleanInput.lastIndexOf("@")) throw err(bad);
  const user = cleanInput.slice(0, at), domain = cleanInput.slice(at + 1);
  if (!USER.test(user) || user.startsWith(".") || user.endsWith(".") || user.includes("..")) throw err(bad);
  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) throw err(bad);
  return { user, domain };
}

// Where to ask: a user@domain becomes its LNURL-pay URL; an lnurl1 bech32
// string or lnurlp:// link decodes to its own URL (checked below).
export async function lnurlPayTarget(input) {
  const raw = String(input || "").trim().replace(/^lightning:/i, "");
  if (!raw) throw err("Enter a Lightning address.");
  if (raw.length > 4096) throw err("That Lightning address is too long.");
  if (raw.toLowerCase().startsWith("lnurl1") || /^lnurlp:\/\//i.test(raw)) {
    const decoded = lnurlToUrl(raw);
    let u;
    try { u = new URL(decoded || ""); } catch { u = null; }
    if (!u || u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) throw err("That LNURL can't be read.");
    const segs = u.pathname.split("/").filter(Boolean);
    const domain = u.hostname.toLowerCase();
    const username = segs.length ? segs[segs.length - 1].slice(0, 64).toLowerCase() || "user" : "user";
    return { url: u.href, username, domain, address: null };
  }
  const { user, domain } = parseLnAddress(raw);
  return { url: `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, username: user, domain, address: `${user}@${domain}` };
}

// One LNURL request: a switched-off partner is never asked; anything the
// network or the server does wrong becomes the same one sentence.
async function fetchLnurlJson(url) {
  let u;
  try { u = new URL(url); } catch { u = null; }
  if (!u || u.protocol !== "https:" || u.username || u.password || !u.hostname) throw err(UNREACHABLE, 502);
  const { railHostOff } = await import("./rails.js");
  if (railHostOff(u.hostname)) throw err("Payments to that mobile-money service aren't switched on yet.", 403);
  // Only an Accept header goes out: never cookies, never credentials.
  const r = await addrFetch(u.href, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 })
    .catch(() => { throw err(UNREACHABLE, 502); });
  if (r.status >= 300 && r.status < 400) throw err(UNREACHABLE, 502); // no redirects followed, none accepted
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw err(UNREACHABLE, 502);
  const d = await r.json().catch(() => null);
  if (!d || typeof d !== "object" || Array.isArray(d)) throw err(UNREACHABLE, 502);
  if (!r.ok || d.status === "ERROR") throw err(String(d.reason || UNREACHABLE).slice(0, 200), 502);
  return d;
}

// The human-readable address inside LNURL metadata (LUD-06/16), when it is one.
function metadataAddress(pay, fallback) {
  try {
    const meta = typeof pay.metadata === "string" ? JSON.parse(pay.metadata) : pay.metadata;
    const id = Array.isArray(meta) ? meta.find((m) => Array.isArray(m) && m[0] === "text/identifier")?.[1] : null;
    if (typeof id === "string") { const p = parseLnAddress(id); return `${p.user}@${p.domain}`; }
  } catch { /* keep the fallback */ }
  return fallback;
}

const asSats = (msats, fallback) => { const n = Math.floor((Number(msats) || fallback) / 1000); return Number.isSafeInteger(n) && n >= 0 ? n : Math.floor(fallback / 1000); };
const ceilSats = (msats, fallback) => { const n = Math.ceil((Number(msats) || fallback) / 1000); return Number.isSafeInteger(n) && n >= 0 ? n : Math.ceil(fallback / 1000); };
const commentChars = (v) => { const n = Math.floor(Number(v) || 0); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 0; };

// What the app shows before sending: limits and comment length, nothing else.
export async function resolveLnAddress(input) {
  const t = await lnurlPayTarget(input);
  const pay = await fetchLnurlJson(t.url);
  if (pay.tag !== "payRequest" || typeof pay.callback !== "string" || !pay.callback) throw err(UNREACHABLE, 502);
  return {
    address: metadataAddress(pay, t.address || `${t.username}@${t.domain}`),
    username: t.username,
    domain: t.domain,
    minSendableSats: Math.max(1, ceilSats(pay.minSendable, 1000)),
    maxSendableSats: asSats(pay.maxSendable, 100000000000),
    commentAllowed: commentChars(pay.commentAllowed),
  };
}

// An invoice for exactly `sats`, from the address's own callback.
export async function lnAddressInvoice(input, sats, comment) {
  sats = Number(sats);
  if (!Number.isSafeInteger(sats) || sats < 1) throw err("Enter a whole number of sats.");
  const msats = sats * 1000;
  if (!Number.isSafeInteger(msats)) throw err("That amount isn't possible.");
  const t = await lnurlPayTarget(input);
  const pay = await fetchLnurlJson(t.url);
  if (pay.tag !== "payRequest" || typeof pay.callback !== "string" || !pay.callback) throw err(UNREACHABLE, 502);
  const min = Number(pay.minSendable), max = Number(pay.maxSendable);
  const lo = Number.isFinite(min) ? Math.max(0, min) : 1000, hi = Number.isFinite(max) ? Math.max(0, max) : 100000000000;
  if (msats < lo || msats > hi) throw err(`This address accepts ${Math.ceil(lo / 1000).toLocaleString("en-US")} to ${Math.floor(hi / 1000).toLocaleString("en-US")} sats.`);
  let cb;
  try { cb = new URL(pay.callback); } catch { cb = null; }
  // The callback stays on the host that named it: same name, same port.
  if (!cb || cb.protocol !== "https:" || cb.username || cb.password || cb.host !== new URL(t.url).host) throw err(UNREACHABLE, 502);
  cb.searchParams.set("amount", String(msats));
  const cleanComment = clean(comment, 500);
  const allowed = commentChars(pay.commentAllowed);
  if (allowed > 0 && cleanComment) cb.searchParams.set("comment", cleanComment.slice(0, allowed));
  const inv = await fetchLnurlJson(cb.href);
  const pr = String(inv.pr || "").toLowerCase();
  // Never hand out an invoice for a different amount than asked for.
  if (!pr || bolt11Msats(pr) !== msats) {
    import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where: cb.hostname, detail: `asked ${msats} msat, got ${bolt11Msats(pr)}` })).catch(() => {});
    throw err("The address returned an invoice for a different amount.", 502);
  }
  // An invoice that commits to a description must commit to this address's metadata (LUD-06).
  const dh = bolt11DescriptionHash(pr);
  if (dh && typeof pay.metadata === "string" && dh !== crypto.createHash("sha256").update(pay.metadata).digest("hex")) {
    import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where: cb.hostname, detail: "description hash doesn't match the address's metadata" })).catch(() => {});
    throw err("The address returned an invoice for something else.", 502);
  }
  return { pr };
}
