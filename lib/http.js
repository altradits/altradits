import crypto from "node:crypto";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export function newId(bytes = 9) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The visitor's address: the right-most hop that isn't one of our own proxies.
// Earlier values come from the client and can be forged to dodge rate limits.
// IPv6 is bucketed by /64 (one connection usually owns the whole block), and
// rate-limit keys store a hash, never the address itself.
// The hash is keyed with a server secret, so stored keys can't be reversed by
// trying every IPv4 address.
const expand6 = (ip) => {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t].map((g) => g.padStart(4, "0"));
};
// Proxy hops to look past: private, loopback, link-local and carrier-NAT
// addresses (nginx or Apache in front of Passenger), plus TRUSTED_PROXIES.
const PROXY_HOP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::ffff:(10|127|192\.168)\.|f[cd][0-9a-f]{2}:|fe80:|unknown$)/i;
function clientChain(request) {
  const trusted = new Set(String(process.env.TRUSTED_PROXIES || "").split(",").map((s) => s.trim()).filter(Boolean));
  // Direct to Node from a public address (no proxy in front): forwarded headers
  // are the client's own words. Ignore them and use the connected address, so a
  // forged X-Forwarded-For can't dodge per-visitor rate limits. server.mjs sets
  // x-remote-addr from the socket and overwrites any client-sent value.
  const remote = String(request.headers.get("x-remote-addr") || "").trim();
  if (remote && !PROXY_HOP.test(remote) && !trusted.has(remote)) return { hops: 0, skipped: 0, ip: remote };
  const hops = String(request.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Right to left: the first address that isn't one of our proxies is the visitor.
  let i = hops.length - 1;
  while (i >= 0 && (PROXY_HOP.test(hops[i]) || trusted.has(hops[i]))) i--;
  return { hops: hops.length, skipped: hops.length - 1 - i, ip: i >= 0 ? hops[i] : request.headers.get("x-real-ip") || hops.at(-1) || "local" };
}
// Shape only (no addresses): how many hops arrive and how many were proxies.
export const proxyShape = (request) => { const c = clientChain(request); return { hops: c.hops, skipped: c.skipped }; };

export function clientIp(request) {
  const { ip } = clientChain(request);
  const bucket = ip.includes(":") && !ip.startsWith("::ffff:") ? expand6(ip.split("%")[0]).slice(0, 4).join(":") : ip.replace(/^::ffff:/, "");
  return crypto.createHmac("sha256", process.env.IP_SALT || process.env.ADMIN_TOKEN || "altradits").update(bucket).digest("hex").slice(0, 16);
}

// Links in emails and invoices: SITE_URL, else the request's host only on a
// developer's machine. On the live server a visitor's Host header must never
// decide where our links point.
export function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" || process.env.PASSENGER_APP_ENV) return "https://altradits.com";
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

// A single-line field (names, companies, emails): no line breaks or leading
// markdown, so it can't add lines to a receipt, an email or a CSV row.
export function oneLine(value, max = 200) {
  return clean(value, max * 2).replace(/\s+/g, " ").replace(/^[#*>\-+=@\s]+/, "").trim().slice(0, max);
}

export function clean(value, max = 2000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

// No commas, quotes or semicolons: mailers treat "a,b@x.com" as two recipients.
export const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

// Misspelt big-provider domains: the email bounces and the person never gets
// their kit or receipt. Only well-known slips, so real domains are never refused.
const TYPOS = {
  "gmail.com": ["gmial.com", "gmai.com", "gmal.com", "gamil.com", "gnail.com", "gmaill.com", "gmail.co", "gmail.cm", "gmail.con", "gmail.om", "gmeil.com", "gmsil.com"],
  "hotmail.com": ["homtmail.com", "hotmial.com", "hotmal.com", "hotmai.com", "hotmil.com", "hotmaill.com", "hotmail.co", "hotmail.con", "hormail.com", "hotamil.com"],
  "yahoo.com": ["yaho.com", "yahooo.com", "yahoo.co", "yahoo.con", "yhoo.com", "yaoo.com"],
  "outlook.com": ["outlok.com", "outloo.com", "outlook.co", "outlook.con", "outllok.com", "otlook.com"],
  "icloud.com": ["iclod.com", "icloud.co", "icoud.com", "icluod.com"],
};
const FIX = Object.fromEntries(Object.entries(TYPOS).flatMap(([good, bad]) => bad.map((b) => [b, good])));
// The corrected address when the domain is a known typo, else null.
export function emailTypo(email) {
  const [user, domain] = String(email || "").toLowerCase().split("@");
  return user && FIX[domain] ? `${user}@${FIX[domain]}` : null;
}
export const typoMessage = (fix) => `Did you mean ${fix}? Please check your email address.`;
