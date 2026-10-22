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

export function clientIp(request) {
  return (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}

export function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export function clean(value, max = 2000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
