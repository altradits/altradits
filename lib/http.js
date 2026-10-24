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
export function clientIp(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",").map((s) => s.trim()).filter(Boolean).at(-1) || "local";
  const v6 = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  return crypto.createHash("sha256").update(`altradits:${v6}`).digest("hex").slice(0, 16);
}

export function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
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
