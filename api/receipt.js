// Paid contact receipts, readable by whoever paid: the receipt number plus the
// Lightning payment hash from their own invoice unlocks it. Nothing else is
// accepted, and receipts are never listed.
// GET /api/receipt?no=ALT-2026-0007&h=<64 hex> -> {no, date, for, sats, payer}
// Pre-year numbers (ALT-0001) keep working for receipts already sent out.
import { json, clean, safeEqual, clientIp } from "../lib/http.js";
import { keysWithPrefix, getJSON, hit } from "../lib/store.js";
import { displayReceipt, receiptMatches } from "../lib/receipts.js";

export async function GET(request) {
  if ((await hit(`rl:receipt:${clientIp(request)}`, 600)) > 300) return json({ error: "Too many checks." }, 429);
  const q = new URL(request.url).searchParams;
  const no = clean(q.get("no"), 16);
  const h = clean(q.get("h"), 64);
  if (!/^ALT-(?:\d{4}-)?\d{4}$/.test(no) || !/^[0-9a-f]{64}$/.test(h)) return json({ error: "No such receipt." }, 404);
  for (const k of await keysWithPrefix("contact:msg:")) {
    const m = await getJSON(k);
    if (m && receiptMatches(m, no) && m.hash && safeEqual(m.hash, h)) {
      return json({ no: displayReceipt(m.receipt, m.paidAt || m.at), date: String(m.paidAt || m.at).slice(0, 10), for: `Contact message (${m.label || m.topic})`, sats: m.sats, payer: m.name });
    }
  }
  return json({ error: "No such receipt." }, 404);
}
