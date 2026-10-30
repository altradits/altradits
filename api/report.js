// POST /api/report { page, directive, blocked }: a page's script lock (its
// Content-Security-Policy) blocked something that wasn't ours. Recorded for the
// Security watch (lib/attacks.js, "csp_violation"). Browser extensions are
// ignored; limited per connection and site-wide, and answered the same way
// either way, so it can't be used to flood the log or to probe it.
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { recordAttack } from "../lib/attacks.js";

const ACCEPTED = () => json({ ok: true }, 202);

export async function POST(request) {
  const ip = clientIp(request);
  if ((await hit(`rl:report:${ip}`, 3600)) > 20) return ACCEPTED();
  if ((await hit(`rl:report:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 300) return ACCEPTED();
  const b = await readBody(request);
  const page = clean(b.page, 100), directive = clean(b.directive, 60), blocked = clean(b.blocked, 200);
  if (!page.startsWith("/") || /^(chrome|moz|safari|webkit|ms-browser)-extension:/i.test(blocked)) return ACCEPTED();
  await recordAttack("csp_violation", { where: page, ip, detail: `${directive || "policy"} blocked ${blocked || "inline code"}` });
  return ACCEPTED();
}
