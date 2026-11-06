// Kazi board (issue #410), served at /kazi. Its API lives here at
// /api/kazi/<path> (server.mjs passes the path on). Posters pay workers
// directly, peer to peer; Kazi never holds money and sees no payment.
//
// Switched on with KAZI=on. Off: every route below refuses, except health and help.
//
//   GET  health                      always: {ok, on, full} (full: the pilot cap is reached)
//   GET  help                        always: {help} (KAZI_HELP, or null when unset)
//   GET  list                        open tasks, newest first (nothing pending, done or hidden)
//   POST post {title, desc, reward, unit, location, poster, contact, agree} -> {id, token} (token once)
//   POST manage {id, token, action: get|edit|close, ...}  the poster's own task
//   POST flag {id, reason}            flag a task for Stanley (never hides it)
import { json, readBody, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";

const sub = (request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/kazi\/?/, ""));
const fail = (e) => (e.status ? json({ success: false, error: e.message }, e.status) : json({ success: false, error: "Internal server error." }, 500));

export async function GET(request) {
  const path = sub(request);
  if (path === "" || path === "health") {
    const { kaziOn, pilotFull } = await import("../lib/kazi.js");
    const on = kaziOn();
    return json({ ok: true, on, full: on ? await pilotFull() : false });
  }
  if (path === "help") {
    const { kaziHelp } = await import("../lib/kazi.js");
    return json({ success: true, help: kaziHelp() });
  }
  if (path === "list") {
    // A shared mobile address holds many readers, so the per-network cap is generous.
    if ((await hit(`rl:kz:list:${clientIp(request)}`, 600)) > 300) return json({ success: false, error: "Too many requests. Try again later." }, 429);
    try {
      const { listOpen } = await import("../lib/kazi.js");
      return json({ success: true, tasks: await listOpen() });
    } catch (e) { return fail(e); }
  }
  return json({ success: false, error: "Unknown path." }, 404);
}

export async function POST(request) {
  const path = sub(request), body = await readBody(request);
  const ip = clientIp(request);
  try {
    if (path === "post") {
      if ((await hit(`rl:kz:post:${ip}`, 600)) > 30 || (await hit("rl:kz:post:all", 600)) > 200)
        return json({ success: false, error: "Too many posts. Try again later." }, 429);
      const { postTask } = await import("../lib/kazi.js");
      const { id, token } = await postTask(body);
      return json({ success: true, id, token });
    }
    if (path === "manage") {
      const id = String(body.id || "");
      if ((await hit(`rl:kz:manage:${id.toLowerCase()}`, 600)) > 60 || (await hit(`rl:kz:managei:${ip}`, 600)) > 60)
        return json({ success: false, error: "Too many tries. Try again later." }, 429);
      const { manageTask } = await import("../lib/kazi.js");
      return json({ success: true, ...(await manageTask(id, body.token, body.action, body)) });
    }
    if (path === "flag") {
      const id = String(body.id || "");
      if ((await hit(`rl:kz:flag:${id.toLowerCase()}`, 600)) > 20 || (await hit(`rl:kz:flagi:${ip}`, 600)) > 30)
        return json({ success: false, error: "Too many flags. Try again later." }, 429);
      const { flagTask } = await import("../lib/kazi.js");
      return json({ success: true, ...(await flagTask(id, body.reason)) });
    }
  } catch (e) { return fail(e); }
  return json({ success: false, error: "Unknown path." }, 404);
}
