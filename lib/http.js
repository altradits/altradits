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

// The address our proxy (Apache/Passenger) appended: the right-most hop. Earlier
// values come from the client and can be forged to dodge rate limits.
// IPv6 is bucketed by /64 (one connection usually owns the whole block), and
// rate-limit keys store a hash, never the address itself.
// The hash is keyed with a server secret, so stored keys can't be reversed by
// trying every IPv4 address.
const expand6 = (ip) => {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t].map((g) => g.padStart(4, "0"));
};
export function clientIp(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",").map((s) => s.trim()).filter(Boolean).at(-1) || "local";
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
