// Orders straight from the website: every price button opens a payment QR.
// POST /api/order { item, ref? }                 -> { id, t, item }  (then POST /api/pay)
// POST /api/order { id, t, email?, name?, task?, urgency? } -> save the client's details
// POST /api/order { id, t, coupon }           -> apply a one-time hunt code -> { usd, pct }
// GET  /api/order?id=&t=  -> { status, portal?, phone? }  (phone only once an
//                            urgent order is paid, so the client can flag it)
import { json, readBody, clean, oneLine, clientIp, safeEqual, EMAIL_RE, emailTypo, typoMessage } from "../lib/http.js";
import { holdIfUnsafe, screen, defang } from "../lib/screen.js";
import { hit, listIds, getMany } from "../lib/store.js";
import { createOrder, getProposal, saveProposal, getLead, saveLead, logEvent, sendKickoff } from "../lib/crm.js";
import { emailOwner } from "../lib/email.js";
import { getTask, saveTask, ensurePortal, assignTask } from "../lib/ops.js";
import { workersLive, kickQueue } from "../lib/workers.js";
import { orderable, URGENCY } from "../data/catalog.js";
import { OWNER_PHONE } from "../lib/contact.js";
import { reserveCoupon, releaseCoupon, holdCoupon, MIN_TO_PAY } from "../lib/hunt.js";

const isUrgent = (o) => o.urgentOk && ["hours", "minutes"].includes(o.urgency);
const urgencyNote = (o) => URGENCY.find((u) => u.id === o.urgency)?.note || "";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && p.order && safeEqual(p.token, t) ? p : null;
}

export async function POST(request) {
  const body = await readBody(request);
  if (body.id && body.coupon !== undefined) return applyCoupon(body, request);
  if (body.id) return update(body);
  const item = orderable(clean(body.item, 40));
  if (!item) return json({ error: "Unknown item." }, 400);
  if ((await hit(`rl:order:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many orders from this connection. Try again in an hour." }, 429);
  // Site-wide: unpaid checkouts can't flood the store, whatever the connection.
  if ((await hit(`rl:order:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 300) return json({ error: "We're very busy right now. Please try again in a few minutes." }, 429);
  const { lead, p } = await createOrder(item, { ref: clean(body.ref, 12).toLowerCase() });
  return json({ id: p.id, t: p.token, name: lead.pickup, item: { id: item.id, name: item.name, usd: p.totals.dueNow } });
}

// One code per order; the price drops before the invoice is made, and the code
// is spent only when the order is paid (lib/crm.js confirmPayment).
async function applyCoupon(body, request) {
  // Codes can't be guessed at scale: per connection and site-wide limits.
  if ((await hit(`rl:coupon:${clientIp(request)}`, 600)) > 10) return json({ error: "Too many tries. Wait ten minutes and try again." }, 429);
  if ((await hit(`rl:coupon:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 400) return json({ error: "Codes can't be checked right now. Please try again shortly." }, 429);
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Order not found." }, 404);
  if (p.status !== "accepted") return json({ error: "This order can't take a code now." }, 409);
  // A new code means a new price: the current invoice is retired (still watched,
  // with the code it was made with) and the next payment QR uses the new price.
  if (p.lightning) { p.retiredInvoices = [...(p.retiredInvoices || []), p.lightning].slice(-10); p.lightning = null; }
  if (p.onchain) p.onchain.sats = null;
  const code = clean(body.coupon, 20).toUpperCase();
  const full = p.totals.monthly + p.totals.oneOff;
  try {
    // A code stays reserved while an invoice made with it can still be paid
    // (the invoice is retired, not cancelled): it can't be spent on another order meanwhile.
    if (p.coupon && p.coupon.code !== code) {
      const live = (p.retiredInvoices || []).filter((i) => i.coupon?.code === p.coupon.code && Date.parse(i.expiresAt) > Date.now()).map((i) => i.expiresAt).sort().at(-1);
      if (live) await holdCoupon(p.coupon.code, p.id, live); else await releaseCoupon(p.coupon.code, p.id);
    }
    if (!code) { p.coupon = null; p.totals.dueNow = full; await saveProposal(p); return json({ usd: full, pct: 0 }); }
    const c = await reserveCoupon(code, p.id);
    if (c.kind === "credit") {
      // Credit from an earlier overpayment: off the price, leaving at least MIN_TO_PAY to pay.
      const credit = Math.round(Math.min(c.usd, full - MIN_TO_PAY) * 100) / 100;
      if (credit <= 0) { await releaseCoupon(c.code, p.id); return json({ error: "This order is too small to use that credit. Keep it for a bigger one." }, 400); }
      p.coupon = { code: c.code, credit };
      p.totals.dueNow = Math.round((full - credit) * 100) / 100;
      await saveProposal(p);
      return json({ usd: p.totals.dueNow, credit, code: c.code, left: Math.round((c.usd - credit) * 100) / 100 });
    }
    p.coupon = { code: c.code, pct: c.pct };
    p.totals.dueNow = Math.round(full * (100 - c.pct)) / 100;
    await saveProposal(p);
    return json({ usd: p.totals.dueNow, pct: c.pct, code: c.code });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}

async function update(body) {
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Order not found." }, 404);
  const lead = await getLead(p.leadId);
  if (!lead) return json({ error: "Order not found." }, 404);
  const email = clean(body.email, 200).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if (emailTypo(email)) return json({ error: typoMessage(emailTypo(email)) }, 400);
  const hadEmail = Boolean(lead.email);
  const before = p.order.task, wasUrgent = isUrgent(p.order);
  if (p.order.urgentOk && URGENCY.some((u) => u.id === body.urgency)) p.order.urgency = body.urgency;
  if (email) {
    lead.email = email;
    // An email typed here is unconfirmed, so it never joins this order to an
    // existing client's portal, tasks or retainer (anyone can type anyone's
    // email). The match is only noted for Stanley.
    if (!hadEmail) {
      const prior = (await getMany("lead", await listIds("leads", 500))).find(
        (l) => l.id !== lead.id && l.email === email && l.stage === "active",
      );
      if (prior) logEvent(lead, `Same email as an existing client (${prior.id}); not linked (the email isn't confirmed).`);
    }
  }
  if (body.name !== undefined) {
    const name = oneLine(body.name, 120);
    if (screen(name).flagged) return json({ error: "Please enter just your name (no links or code)." }, 400);
    lead.name = name;
  }
  if (body.task !== undefined) p.order.task = clean(body.task, 4000);
  p.client = { ...p.client, name: lead.name, email: lead.email };
  p.summary = p.order.task;
  await saveProposal(p);
  logEvent(lead, "Order details updated.");
  await saveLead(lead);

  // Paid but not yet confirmable (node down): acknowledge once they give an address; alert on urgency.
  if (p.status === "paid_claimed") {
    const { acknowledgeClaim } = await import("../lib/crm.js");
    if (email && !hadEmail) { await acknowledgeClaim(lead, p); await saveProposal(p); }
    if (isUrgent(p.order) && !wasUrgent) {
      const { whatsappOwner } = await import("../lib/notify.js");
      await emailOwner(`🚨 URGENT, payment to confirm: ${p.order.name}`, `${lead.name || lead.email || "A client"} paid for "${p.order.name}" while the node was down and now needs it urgently: ${urgencyNote(p.order)}.\n\nCheck the backup wallet and the Mac, then approve the payment check in Approvals to start the work.`, null, lead.id);
      await whatsappOwner(`Altradits URGENT: ${p.order.name} was paid while the node was down and is now marked urgent. Check the Mac and the admin Approvals.`);
    }
  }
  if (p.status === "paid") {
    if (email && !hadEmail && p.payment?.receiptOwed) { const { sendOfficialReceipt } = await import("../lib/finance.js"); await sendOfficialReceipt(lead, p); } // the node recorded it before they gave an address
    else if (email && !hadEmail) { await sendKickoff(lead, p); await saveProposal(p); } // first address: their payment email and receipt
    if (isUrgent(p.order) && !wasUrgent) {
      const t = p.order.taskId && (await getTask(p.order.taskId));
      if (t) { t.urgency = p.order.urgency; t.history.push({ at: new Date().toISOString(), by: "client", text: `Marked urgent: ${urgencyNote(p.order)}` }); await saveTask(t); }
      await emailOwner(`🚨 URGENT: ${p.order.name}`, `${lead.name || lead.email || "A client"} paid for "${p.order.name}" and now needs it urgently: ${urgencyNote(p.order)}.\n\n${p.order.task || "(no details yet)"}`, null, lead.id);
    }
    if (p.order.task !== before) {
      const t = p.order.taskId && (await getTask(p.order.taskId));
      if (t) {
        t.details = p.order.task;
        t.question = null;
        t.qa = null;
        t.history.push({ at: new Date().toISOString(), by: "client", text: "Added order details" });
        const held = await holdIfUnsafe(t, p.order.task, "order details", saveTask);
        if (!held) {
          if (["waiting_client", "owner", "new"].includes(t.status)) {
            t.status = workersLive() ? "queued" : "new";
            t.attempts = 0;
          }
          await saveTask(t);
          if (t.status === "queued" && workersLive()) kickQueue();
          else if (t.status === "new" && !workersLive()) await assignTask(t);
        }
      }
      // Held by the security screen: Stanley gets the defanged copy from the hold, not the raw text.
      if (!(t && t.status === "held")) await emailOwner(`Order details: ${p.order.name}`, `${lead.name || lead.email || "A client"} added details to their paid order:\n\n${defang(p.order.task)}`, null, lead.id);
    }
  }
  return json({ ok: true });
}

export async function GET(request) {
  const u = new URL(request.url);
  const p = await load(u.searchParams.get("id"), u.searchParams.get("t"));
  if (!p) return json({ error: "Order not found." }, 404);
  if (p.status !== "paid") return json({ status: p.status });
  const lead = await getLead(p.leadId);
  const urgent = isUrgent(p.order);
  return json({ status: "paid", item: p.order.name, delivery: urgent ? urgencyNote(p.order) : p.timeline, portal: lead ? ensurePortal(lead) : null, emailed: Boolean(lead?.email), name: lead?.pickup || null,
    ...(urgent && OWNER_PHONE ? { phone: `+${OWNER_PHONE}`, ref: p.id.slice(0, 6).toUpperCase() } : {}) });
}
