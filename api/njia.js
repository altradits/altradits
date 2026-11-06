// Njia public API (issue #416). GET only: health and the stored public summary.
// The summary is rebuilt hourly by the job and read from the store here. This
// API never calls the node, so the page cannot be used to load the Tor node.
// Switched on with NJIA=on. Off: health still answers, the summary is { on:false }.
//
//   GET  ?part=health -> { ok, on, publicAt } (always 200, even while off)
//   GET  (no part)    -> the stored summary, filtered by settings and lockdown
import { json, clientIp } from "../lib/http.js";
import { hit, getJSON } from "../lib/store.js";

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  if (q.get("part") === "health") {
    const { njiaOn } = await import("../lib/njia.js");
    const pub = await getJSON("njia:public").catch(() => null);
    return json({ ok: true, on: njiaOn(), publicAt: pub?.at || null });
  }
  // Public limits: 60 a minute per network, 5,000 an hour site-wide.
  const ip = clientIp(request); // a hash, never the address itself
  const hour = new Date().toISOString().slice(0, 13);
  if ((await hit(`rl:njia:ip:${ip}`, 60)) > 60 || (await hit(`rl:njia:all:${hour}`, 3600)) > 5000)
    return json({ error: "Too many requests. Try again later." }, 429);
  const { njiaOn } = await import("../lib/njia.js");
  if (!njiaOn()) return json({ on: false });
  const pub = await getJSON("njia:public").catch(() => null);
  if (!pub) return json({ on: true, stops: [], line: "Njia isn't open yet." });
  const { deadmanActive } = await import("../lib/deadman.js");
  if (deadmanActive()) return json({ on: true, stops: pub.stops || [], line: "Paused for a security check." });
  // Allowlist again at the edge: only these stored fields ever leave.
  const out = { on: true, at: pub.at || null, stage: pub.stage || null, stops: pub.stops || [], line: pub.line || "" };
  if (pub.numbers) out.numbers = pub.numbers;
  if (pub.identity) out.identity = pub.identity;
  return json(out);
}
// No POST handler: server.mjs answers 405.
