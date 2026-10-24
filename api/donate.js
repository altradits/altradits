// Donations to Bitcoin education, paid in Bitcoin like any order.
// POST /api/donate { usd, name?, email?, message?, anonymous? } -> { id, t, usd, name }  (then POST /api/pay)
//   anonymous: no name or email is kept; the donation name collects the receipt (/collect).
// GET  /api/donate                                  -> purpose, suggested amounts, total raised
import { json, readBody, clean, clientIp, EMAIL_RE } from "../lib/http.js";
import { hit, listIds, getMany } from "../lib/store.js";
import { createDonation } from "../lib/crm.js";
import { DONATIONS } from "../data/catalog.js";

export async function POST(request) {
  const body = await readBody(request);
  const usd = Math.round(Number(body.usd) * 100) / 100;
  if (!(usd >= DONATIONS.min && usd <= DONATIONS.max)) return json({ error: `Choose an amount between $${DONATIONS.min} and $${DONATIONS.max}.` }, 400);
  const email = clean(body.email, 200).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if ((await hit(`rl:donate:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many attempts. Try again in an hour." }, 429);
  const anon = Boolean(body.anonymous);
  const { lead, p } = await createDonation({ usd, name: anon ? "" : body.name, email: anon ? "" : email, message: body.message, ref: clean(body.ref, 12).toLowerCase() });
  if (anon) { p.donation.anonymous = true; const { saveProposal } = await import("../lib/crm.js"); await saveProposal(p); }
  return json({ id: p.id, t: p.token, usd: p.totals.dueNow, name: lead.pickup });
}

export async function GET() {
  const paid = (await getMany("proposal", await listIds("proposals", 2000))).filter((p) => p.donation && p.status === "paid");
  return json({ ...DONATIONS, raised: Math.round(paid.reduce((t, p) => t + p.totals.dueNow, 0) * 100) / 100, donors: paid.length });
}
