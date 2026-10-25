// Free kits (data/templates.js, lib/subscribers.js).
// GET  /api/kits                         -> the kits, with ladder offers and prices
// POST /api/kits { email, name?, kit }   -> join the list; returns download links; emails a confirmation
// GET  /api/kits?confirm=&c=&k=          -> address confirmed: the kit is emailed, follow-ups may start
// GET  /api/kits?d=&f=&s=&t=             -> download a kit file
// GET  /api/kits?unsub=&t=               -> one-click unsubscribe
import { json, readBody, clientIp } from "../lib/http.js";
import { subscribe, download, unsubscribe, resubscribe, confirmSubscription, publicKits } from "../lib/subscribers.js";

const page = (title, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:17px/1.6 system-ui,sans-serif;color:#0F1B2D;background:#EEF2F6;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#fff;border:2px solid #0F1B2D;border-radius:1rem;padding:2rem;max-width:28rem;margin:1rem"><h1 style="margin:0 0 .5rem;font-size:1.5rem">${title}</h1><p style="margin:0 0 1rem">${text}</p><a href="/" style="color:#2F5BEA">Back to Altradits</a></main>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(request) {
  // One-click unsubscribe from the mail app (RFC 8058: POST to the List-Unsubscribe URL).
  const u = new URL(request.url);
  if (u.searchParams.get("unsub")) return json({ ok: await unsubscribe(u.searchParams.get("unsub"), u.searchParams.get("t")) });
  const body = await readBody(request);
  const r = await subscribe({ email: body.email, name: body.name, kit: body.kit, website: body.website, ip: clientIp(request) });
  return r.error ? json({ error: r.error }, r.status) : json(r);
}

export async function GET(request) {
  const u = new URL(request.url), q = (k) => u.searchParams.get(k);
  // Opening the link only asks: mail apps' link scanners open every link, and
  // must not unsubscribe anyone. The button (or the mail app's one-click POST) does it.
  if (q("unsub")) {
    const action = `/api/kits?unsub=${encodeURIComponent(q("unsub"))}&t=${encodeURIComponent(q("t") || "")}`;
    return page("Unsubscribe?", `Stop all Altradits emails to this address.</p><form method="post" action="${action.replace(/"/g, "&quot;")}" onsubmit="event.preventDefault();fetch(this.action,{method:'POST'}).then(r=>r.json()).then(d=>{this.outerHTML=d.ok?'<p><b>You\'re unsubscribed.</b> Your downloads still work.</p>':'<p>This link didn\'t work. Reply to any of our emails and we\'ll remove you by hand.</p>'})"><button style="font:600 1rem system-ui;padding:.7rem 1.2rem;border-radius:.6rem;border:2px solid #0F1B2D;background:#0F1B2D;color:#fff;cursor:pointer">Unsubscribe</button></form><p style="margin-top:1rem">`);
  }
  if (q("confirm")) {
    return (await confirmSubscription(q("confirm"), q("c"), q("k")))
      ? page("Confirmed", "Thanks. Your kit is on its way to your inbox.")
      : page("Link not recognised", "This confirmation link didn't work. Get the kit again from the free templates page.");
  }
  if (q("resub")) {
    return (await resubscribe(q("resub"), q("c"), q("k")))
      ? page("You're back on the list", "Thanks for confirming. Your kit is on its way to your inbox.")
      : page("Link not recognised", "This confirmation link didn't work. Get the kit again from the free templates page.");
  }
  if (q("d")) {
    const file = await download({ kit: q("d"), file: q("f"), id: q("s"), t: q("t"), c: q("c") });
    if (!file) return page("Download link not recognised", "Get the kit again from the free templates page and we'll send a fresh link.");
    return new Response(file.body, { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" } });
  }
  return json(publicKits());
}
