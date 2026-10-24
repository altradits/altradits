// Orders straight from the website: every price button opens a payment QR.
// POST /api/order { item, ref? }                 -> { id, t, item }  (then POST /api/pay)
// POST /api/order { id, t, email?, name?, task?, urgency? } -> save the client's details
// POST /api/order { id, t, coupon }           -> apply a one-time hunt code -> { usd, pct }
// GET  /api/order?id=&t=  -> { status, portal?, phone? }  (phone only once an
//                            urgent order is paid, so the client can flag it)
import { holdIfUnsafe } from "../lib/screen.js";
import { json, readBody, clean, clientIp, safeEqual, EMAIL_RE } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { createOrder, getProposal, saveProposal, getLead, saveLead, logEvent, sendKickoff } from "../lib/crm.js";
import { emailOwner } from "../lib/email.js";
import { getTask, saveTask, ensurePortal } from "../lib/ops.js";
import { orderable, URGENCY } from "../data/catalog.js";
import { OWNER_PHONE } from "../lib/contact.js";
import { reserveCoupon, releaseCoupon } from "../lib/hunt.js";

const isUrgent = (o) => o.urgentOk && ["hours", "minutes"].includes(o.urgency);
const urgencyNote = (o) => URGENCY.find((u) => u.id === o.urgency)?.note || "";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && p.order && safeEqual(p.token, t) ? p : null;
}

export async function POST(request) {
  const body = await readBody(request);
  if (body.id && body.coupon !== undefined) return applyCoupon(body);
  if (body.id) return update(body);
  const item = orderable(clean(body.item, 40));
  if (!item) return json({ error: "Unknown item." }, 400);
  if ((await hit(`rl:order:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many orders from this connection. Try again in an hour." }, 429);
  const { p } = await createOrder(item, { ref: clean(body.ref, 12).toLowerCase() });
  return json({ id: p.id, t: p.token, item: { id: item.id, name: item.name, usd: p.totals.dueNow } });
}

// One code per order; the price drops before the invoice is made, and the code
// is spent only when the order is paid (lib/crm.js confirmPayment).
async function applyCoupon(body) {
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Order not found." }, 404);
  if (p.status !== "accepted") return json({ error: "This order can't take a code now." }, 409);
  const code = clean(body.coupon, 20).toUpperCase();
  const full = p.totals.monthly + p.totals.oneOff;
  try {
    if (p.coupon && p.coupon.code !== code) await releaseCoupon(p.coupon.code, p.id);
    if (!code) { p.coupon = null; p.totals.dueNow = full; await saveProposal(p); return json({ usd: full, pct: 0 }); }
    const c = await reserveCoupon(code, p.id);
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
  const hadEmail = Boolean(lead.email);
  const before = p.order.task, wasUrgent = isUrgent(p.order);
  if (p.order.urgentOk && URGENCY.some((u) => u.id === body.urgency)) p.order.urgency = body.urgency;
  if (email) lead.email = email;
  if (body.name !== undefined) lead.name = clean(body.name, 120);
  if (body.task !== undefined) p.order.task = clean(body.task, 4000);
  p.client = { ...p.client, name: lead.name, email: lead.email };
  p.summary = p.order.task;
  await saveProposal(p);
  logEvent(lead, "Order details updated.");
  await saveLead(lead);

  if (p.status === "paid") {
    if (email && !hadEmail) await sendKickoff(lead, p);
    if (isUrgent(p.order) && !wasUrgent) {
      const t = p.order.taskId && (await getTask(p.order.taskId));
      if (t) { t.urgency = p.order.urgency; t.history.push({ at: new Date().toISOString(), by: "client", text: `Marked urgent: ${urgencyNote(p.order)}` }); await saveTask(t); }
      await emailOwner(`🚨 URGENT: ${p.order.name}`, `${lead.name || lead.email || "A client"} paid for "${p.order.name}" and now needs it urgently: ${urgencyNote(p.order)}.\n\n${p.order.task || "(no details yet)"}`, null, lead.id);
    }
    if (p.order.task !== before) {
      const t = p.order.taskId && (await getTask(p.order.taskId));
      if (t) {
        t.details = p.order.task;
        t.history.push({ at: new Date().toISOString(), by: "client", text: "Added order details" });
        if (!(await holdIfUnsafe(t, p.order.task, "order details", saveTask))) await saveTask(t);
      }
      await emailOwner(`Order details: ${p.order.name}`, `${lead.name || lead.email || "A client"} added details to their paid order:\n\n${p.order.task}`, null, lead.id);
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
  return json({ status: "paid", item: p.order.name, delivery: urgent ? urgencyNote(p.order) : p.timeline, portal: lead ? ensurePortal(lead) : null, emailed: Boolean(lead?.email),
    ...(urgent ? { phone: `+${OWNER_PHONE}`, ref: p.id.slice(0, 6).toUpperCase() } : {}) });
}
