// The one-tap "this was me" link from a level-2 security watch email.
//   GET  /api/deadman?t=   the link: what the watch saw, and a button (POST closes it, no login)
//   POST /api/deadman      { t } closes the watch, strictly once
// Opening the link closes nothing: mail scanners open every link. Tokens are
// 256-bit, stored hashed, single-use, dead after 24 hours (lib/deadman.js).
import crypto from "node:crypto";
import { clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";

const page = (status, title, text, extra = "") => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Altradits security</title><body style="font:17px/1.6 system-ui,sans-serif;background:#141117;color:#F3ECF2;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#221E27;border:1px solid #3F3846;border-radius:24px;padding:2rem;max-width:26rem;margin:1rem"><h1 style="margin:0 0 .5rem;font-size:1.4rem">${title}</h1><p style="margin:0 0 1rem;color:#CBC2CF">${text}</p>${extra}<p style="margin:1rem 0 0"><a href="/admin" style="color:#DDB8FF">Open /admin</a></p></main>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });

const cleanToken = (request, form) => {
  const q = String(new URL(request.url).searchParams.get("t") || form?.get("t") || "");
  return /^[\w-]{20,128}$/.test(q) ? q : "";
};

const ipKey = (request) => crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);

const ago = (iso) => {
  try {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute(s) ago`.replace("(s)", mins === 1 ? "" : "s");
    const h = Math.floor(mins / 60);
    return `${h} hour(s) ago`.replace("(s)", h === 1 ? "" : "s");
  } catch { return "recently"; }
};

export async function GET(request) {
  const t = cleanToken(request, null);
  const { previewAck } = await import("../lib/deadman.js");
  const v = t ? await previewAck(t) : { ok: false };
  if (!v.ok) return page(200, "Link not recognised", "This acknowledgement link has expired, was already used, or the watch already closed. Open /admin to see the current state.");
  return page(200, "Was this you?",
    `Server files differed from the last deploy. First seen ${ago(v.firstSeen)}. Seen ${Number(v.sightings) || 1} time(s). Nothing is frozen. Press the button only if the change was yours (a deploy, a restart, a panel change).`,
    `<form method="post" action="/api/deadman"><input type="hidden" name="t" value="${t}"><button style="font:600 1rem system-ui;padding:.7rem 1.2rem;border-radius:999px;border:0;background:#DDB8FF;color:#141117;cursor:pointer">This was me</button></form>`);
}

export async function POST(request) {
  // Guessing is pointless (256-bit tokens, 30 tries an hour per network).
  if ((await hit(`rl:dm:ack:${ipKey(request)}`, 3600)) > 30)
    return page(429, "Too many attempts", "Try again in an hour.");
  const form = await request.formData().catch(() => null);
  const t = cleanToken(request, form);
  const { acknowledgeWatch } = await import("../lib/deadman.js");
  const ok = t ? (await acknowledgeWatch(t)).ok : false;
  return ok
    ? page(200, "Watch closed", "This was you. The watch is closed and nothing was ever frozen. If the change appears again, a new watch will open.")
    : page(410, "Link not recognised", "This acknowledgement link has expired, was already used, or the watch already closed. Open /admin to see the current state.");
}
