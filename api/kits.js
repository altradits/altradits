// Free kits (data/templates.js, lib/subscribers.js).
// GET  /api/kits                         -> the kits, with ladder offers and prices
// POST /api/kits { email, name?, kit }   -> join the list; returns download links (also emailed)
// GET  /api/kits?d=&f=&s=&t=             -> download a kit file
// GET  /api/kits?unsub=&t=               -> one-click unsubscribe
import { json, readBody, clientIp } from "../lib/http.js";
import { subscribe, download, unsubscribe, publicKits } from "../lib/subscribers.js";

const page = (title, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:17px/1.6 system-ui,sans-serif;color:#0F1B2D;background:#EEF2F6;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#fff;border:2px solid #0F1B2D;border-radius:1rem;padding:2rem;max-width:28rem;margin:1rem"><h1 style="margin:0 0 .5rem;font-size:1.5rem">${title}</h1><p style="margin:0 0 1rem">${text}</p><a href="/" style="color:#2F5BEA">Back to Altradits</a></main>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(request) {
  const body = await readBody(request);
  const r = await subscribe({ email: body.email, name: body.name, kit: body.kit, website: body.website, ip: clientIp(request) });
  return r.error ? json({ error: r.error }, r.status) : json(r);
}

export async function GET(request) {
  const u = new URL(request.url), q = (k) => u.searchParams.get(k);
  if (q("unsub")) {
    return (await unsubscribe(q("unsub"), q("t")))
      ? page("You're unsubscribed", "You won't get any more emails from us. Your downloads still work.")
      : page("Link not recognised", "This unsubscribe link didn't work. Reply to any of our emails and we'll remove you by hand.");
  }
  if (q("d")) {
    const file = await download({ kit: q("d"), file: q("f"), id: q("s"), t: q("t") });
    if (!file) return page("Download link not recognised", "Get the kit again from the free templates page and we'll send a fresh link.");
    return new Response(file.body, { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" } });
  }
  return json(publicKits());
}
