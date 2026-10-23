// Scan-to-pay over Lightning.
// POST /api/pay { id, t }          -> invoice + QR for the proposal's amount due
// GET  /api/pay?id=&t=             -> has it been paid? (auto-confirms on LND)
// GET  /api/pay?qr=address         -> QR of the public Lightning address (homepage)
import { json, readBody, clean, clientIp, safeEqual } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { getProposal, saveProposal, getLead, logEvent, saveLead, confirmPayment } from "../lib/crm.js";
import { emailOwner } from "../lib/email.js";
import { createInvoice, invoicePaid, qrSvg, lightningMode } from "../lib/lightning.js";
import { PAYMENTS } from "../data/catalog.js";
import { encodeLnurl } from "../lib/lnurl.js";
import { siteUrl } from "../lib/http.js";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && safeEqual(p.token, t) ? p : null;
}

const fresh = (inv, usd) => inv && inv.usd === usd && Date.parse(inv.expiresAt) - Date.now() > 3 * 60e3;

async function publicInvoice(inv) {
  return {
    bolt11: inv.bolt11, sats: inv.sats, usd: inv.usd, rate: inv.rate, expiresAt: inv.expiresAt,
    autoConfirm: inv.autoConfirm, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()),
  };
}

export async function POST(request) {
  const body = await readBody(request);
  if ((await hit(`rl:pay:${clientIp(request)}`, 600)) > 30) return json({ error: "Too many requests, try again in a few minutes." }, 429);
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Proposal not found." }, 404);
  if (!["accepted", "paid_claimed"].includes(p.status)) return json({ error: "Accept the proposal first." }, 409);
  if (!lightningMode()) return json({ error: "Lightning payments aren't set up yet." }, 503);

  const usd = p.totals.dueNow;
  if (!fresh(p.lightning, usd)) {
    try {
      p.lightning = await createInvoice({ usd, memo: `Altradits: ${p.title} (proposal ${p.id})` });
    } catch (err) {
      console.error("lightning invoice", err);
      return json({ error: "Couldn't create a Lightning invoice right now. Please use another payment method or try again shortly." }, 502);
    }
    await saveProposal(p);
  }
  // A fixed-amount LNURL for wallets that prefer it (needs our own node).
  const lnurl = lightningMode() === "lnd" ? encodeLnurl(`${siteUrl(request)}/api/lnurl?p=${p.id}&t=${p.token}`) : (PAYMENTS.lnurl || "").toUpperCase();
  return json({ invoice: { ...(await publicInvoice(p.lightning)), lnurl, lnurlFixedAmount: lightningMode() === "lnd" } });
}

export async function GET(request) {
  const u = new URL(request.url);

  if (u.searchParams.get("qr") === "address") {
    const target = PAYMENTS.lnurl || PAYMENTS.lightningAddress;
    if (!target) return new Response("Not configured", { status: 404 });
    return new Response(await qrSvg(`lightning:${target}`.toUpperCase()), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }

  const p = await load(u.searchParams.get("id"), u.searchParams.get("t"));
  if (!p) return json({ error: "Proposal not found." }, 404);
  if (p.status === "paid") return json({ status: "paid" });
  const candidates = [p.lightning, ...(p.lnurlInvoices || [])].filter(Boolean);
  if (!candidates.length) return json({ status: p.status, paid: false });

  // Paid either through the QR invoice or an invoice fetched via the LNURL.
  let paid = null, settled = null;
  for (const inv of candidates) {
    try {
      const r = await invoicePaid(inv);
      if (r) { paid = true; settled = inv; break; }
      if (r === false) paid = false;
    } catch (err) { console.error("lightning check", err); }
  }
  if (paid) {
    const latest = await getProposal(p.id); // another check may have just confirmed it
    if (latest?.status === "paid") return json({ status: "paid" });
    const lead = await getLead(p.leadId);
    p.payment = { method: "Bitcoin (Lightning)", reference: settled.paymentHash || settled.bolt11.slice(-24), claimedAt: new Date().toISOString(), sats: settled.sats };
    if (lead) {
      await confirmPayment(lead, p);
      // Work to start: one of the few things worth an email.
      await emailOwner(`Paid ⚡ ${settled.sats.toLocaleString("en-US")} sats: start work for ${lead.name || lead.email}`,
        `${lead.name || lead.email} paid $${p.totals.dueNow} (${settled.sats} sats) over Lightning for "${p.title}". It's confirmed on your node and the client has their kick-off email.\n\nKick-off is promised within 48 hours.`,
        null, lead.id);
    } else {
      p.status = "paid";
      await saveProposal(p);
    }
    return json({ status: "paid" });
  }
  return json({ status: p.status, paid: false, verifiable: paid !== null });
}
