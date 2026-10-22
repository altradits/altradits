// GET /api/cron  (Vercel Cron, daily). See lib/followups.js.
import { json, safeEqual, siteUrl } from "../lib/http.js";
import { runFollowups } from "../lib/followups.js";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(secret, given)) return json({ error: "Unauthorized" }, 401);
  return json(await runFollowups(siteUrl(request)));
}
