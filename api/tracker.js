// GET /api/tracker: Stanley's open-source progress and the Builder Path, read from GitHub (cached 30 minutes).
import { json, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { tracker } from "../lib/tracker.js";
import { RULES, STEPS } from "../data/tracker.js";

export async function GET(request) {
  if ((await hit(`rl:tracker:${clientIp(request)}`, 600)) > 120) return json({ error: "Too many requests." }, 429);
  try { return json({ ...(await tracker()), rules: RULES, stepInfo: STEPS }); }
  catch { return json({ error: "GitHub can't be reached right now. Try again soon." }, 503); }
}
