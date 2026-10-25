// GET /api/cron  (Vercel Cron, daily). See lib/followups.js.
import { json, safeEqual, siteUrl } from "../lib/http.js";
import { runFollowups } from "../lib/followups.js";
import { runLearningCadence } from "../lib/learning.js";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(secret, given)) return json({ error: "Unauthorized" }, 401);
  const followups = await runFollowups(siteUrl(request));
  const learning = await runLearningCadence().catch((e) => ({ error: e.message }));
  return json({ ...followups, learning });
}
