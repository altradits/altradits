// Donations to Bitcoin education, paid in Bitcoin like any order.
// POST /api/donate { usd | sats, name?, email?, message?, anonymous? } -> { id, t, usd, sats?, name }  (then POST /api/pay)
//   sats: an exact amount in sats (from 10), invoiced as exactly that many sats.
//   anonymous: no name or email is kept; the donation name collects the receipt (/collect).
// GET  /api/donate                                  -> purpose, suggested amounts, total raised
import { json, readBody, clean, clientIp, EMAIL_RE, emailTypo, typoMessage } from "../lib/http.js";
import { hit, listIds, getMany } from "../lib/store.js";
import { createDonation } from "../lib/crm.js";
import { DONATIONS } from "../data/catalog.js";
import { btcUsd } from "../lib/lightning.js";

export async function POST(request) {
  const body = await readBody(request);
  const sats = body.sats !== undefined && body.sats !== "" ? Number(body.sats) : null;
  if (sats !== null && !(Number.isInteger(sats) && sats >= DONATIONS.minSats && sats <= DONATIONS.maxSats)) return json({ error: `Choose a whole number of sats between ${DONATIONS.minSats} and ${DONATIONS.maxSats.toLocaleString("en-US")}.` }, 400);
  // In sats: its dollar value at today's rate, for the totals only (the invoice is in sats).
  const usd = sats !== null ? Math.round(((sats * (await btcUsd().catch(() => 0))) / 1e8) * 100) / 100 : Math.round(Number(body.usd) * 100) / 100;
  if (sats === null && !(usd >= DONATIONS.min && usd <= DONATIONS.max)) return json({ error: `Choose an amount between $${DONATIONS.min} and $${DONATIONS.max}.` }, 400);
  const email = clean(body.email, 200).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if (emailTypo(email)) return json({ error: typoMessage(emailTypo(email)) }, 400);
  if ((await hit(`rl:donate:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many attempts. Try again in an hour." }, 429);
  if ((await hit(`rl:donate:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 200) return json({ error: "We're very busy right now. Please try again in a few minutes." }, 429);
  const anon = Boolean(body.anonymous);
  const { lead, p } = await createDonation({ usd, sats, name: anon ? "" : body.name, email: anon ? "" : email, message: body.message, ref: clean(body.ref, 12).toLowerCase() });
  if (anon) { p.donation.anonymous = true; const { saveProposal } = await import("../lib/crm.js"); await saveProposal(p); }
  return json({ id: p.id, t: p.token, usd: p.totals.dueNow, ...(sats !== null ? { sats } : {}), name: lead.pickup });
}

export async function GET() {
  const paid = (await getMany("proposal", await listIds("proposals", 2000))).filter((p) => p.donation && p.status === "paid");
  return json({ ...DONATIONS, raised: Math.round(paid.reduce((t, p) => t + p.totals.dueNow, 0) * 100) / 100, donors: paid.length });
}
