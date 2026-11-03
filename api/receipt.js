// Paid contact receipts, readable by whoever paid: the receipt number plus the
// Lightning payment hash from their own invoice unlocks it. Nothing else is
// accepted, and receipts are never listed.
// GET /api/receipt?no=ALT-0001&h=<64 hex> -> {no, date, for, sats, payer}
import { json, clean, safeEqual, clientIp } from "../lib/http.js";
import { keysWithPrefix, getJSON, hit } from "../lib/store.js";

export async function GET(request) {
  if ((await hit(`rl:receipt:${clientIp(request)}`, 600)) > 300) return json({ error: "Too many checks." }, 429);
  const q = new URL(request.url).searchParams;
  const no = clean(q.get("no"), 12);
  const h = clean(q.get("h"), 64);
  if (!/^ALT-\d{4}$/.test(no) || !/^[0-9a-f]{64}$/.test(h)) return json({ error: "No such receipt." }, 404);
  for (const k of await keysWithPrefix("contact:msg:")) {
    const m = await getJSON(k);
    if (m?.receipt === no && m.hash && safeEqual(m.hash, h)) {
      return json({ no, date: String(m.paidAt || m.at).slice(0, 10), for: `Contact message (${m.label || m.topic})`, sats: m.sats, payer: m.name });
    }
  }
  return json({ error: "No such receipt." }, 404);
}
