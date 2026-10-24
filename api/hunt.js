// The weekly treasure hunt (see lib/hunt.js).
// POST /api/hunt { action: "solve", answer }  -> { claim }  (personal share link)
// POST /api/hunt { action: "visit", code }    -> { ok }     (someone opened a share link)
// GET  /api/hunt?claim=&t=                    -> { claim }  (coupon once earned)
// GET  /api/hunt                              -> { n, len, endsAt, pct }
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { solve, visit, claimStatus, huntFor } from "../lib/hunt.js";
import { HUNT } from "../data/marketing.js";

export async function POST(request) {
  const body = await readBody(request);
  if (body.action === "solve") {
    const r = await solve(clean(body.answer, 40), clientIp(request));
    return r.error ? json({ error: r.error }, r.status) : json(r);
  }
  if (body.action === "visit") return json(await visit(clean(body.code, 12), clientIp(request)));
  return json({ error: "Unknown action" }, 400);
}

export async function GET(request) {
  const u = new URL(request.url);
  if (u.searchParams.get("claim")) {
    const claim = await claimStatus(clean(u.searchParams.get("claim"), 20), clean(u.searchParams.get("t"), 40));
    return claim ? json({ claim }) : json({ error: "Not found" }, 404);
  }
  const h = huntFor();
  return json({ n: h.n, len: h.word.length, endsAt: h.endsAt, pct: HUNT.couponPct });
}
