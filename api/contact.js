// Contact form: visitors write to the right department, and a $1 Lightning
// payment keeps bots and spam out. Nothing is stored until the invoice is
// paid; every reply the team drafts waits for Stanley's approval, like all
// outbound mail.
// POST /api/contact {step:"quote"} -> {bolt11, qr, hash, sats, expiresAt}
// GET  /api/contact?hash=      -> {paid}
// POST /api/contact {step:"send", hash, name, email, topic, message} -> {ok, id}
import { json, readBody, clean, newId, clientIp, siteUrl, EMAIL_RE } from "../lib/http.js";
import { hit, getJSON, setJSON, pushId, acquireLock, increment } from "../lib/store.js";
import { createInvoice, invoicePaid, qrSvg } from "../lib/lightning.js";

export const CONTACT = { usd: 1, nameMax: 80, emailMax: 120, messageMin: 10, messageMax: 2000, quoteTtl: 1800 };

// What the visitor picks -> which department owns it. Only active,
// external-facing departments; paused and internal teams stay out.
export const TOPICS = {
  yebente: { dept: "growth", label: "YeBente wallet help" },
  learn: { dept: "office", label: "Learning Bitcoin and students" },
  partner: { dept: "office", label: "Partnerships" },
  funding: { dept: "admin", label: "Grants, donations and funding" },
  safety: { dept: "trust", label: "Safety, abuse and phishing" },
  other: { dept: "office", label: "Something else" },
};

// The payer's receipt email, sent at payment time and on resend from the
// dashboard. Receipts come only from finance, only after the node confirms
// payment. The stamp is the head of the department asked about. Short note;
// the full receipt lives behind the download button.
export async function sendContactReceipt({ to, name, sats, label, dept, receipt, hash, site }) {
  const { sendEmail } = await import("../lib/email.js");
  const { commsFor } = await import("../data/team-comms.js");
  const { stanLive } = await import("../lib/stan.js");
  const head = commsFor(dept).head;
  const funds = "Your dollar also funds our Lightning node: the always-on computer that carries every YeBente payment. Running it takes real money and locked-up bitcoin, so every dollar keeps payments fast and nearly free for everyone.";
  const body = stanLive()
    ? `Hi ${name},\n\nThank you. Your $1 (${Number(sats).toLocaleString("en-US")} sats) is with us, and your message about ${String(label).toLowerCase()} is with the right team.\n\n${funds}\n\nChoumi's team reads every message, and Stanley approves every reply.`
    : `Hi ${name},\n\n${head.name}, ${head.title}, confirms your $1 (${Number(sats).toLocaleString("en-US")} sats) is with us. Our AI team is off right now, so your message about ${String(label).toLowerCase()} is referred to the right department, who will read it with Stanley.\n\n${funds}`;
  return sendEmail({ to, subject: `Receipt ${receipt}: thank you for your $1`, kind: "wallet", fromDept: "finance",
    sender: commsFor(dept).signature, cta: { label: "Download receipt (PDF)", url: `${site}/receipt?no=${receipt}&h=${hash}` }, text: body });
}

export async function POST(request) {
  const body = await readBody(request);
  if (body.step === "send") return send(request, body);
  if (body.step !== undefined && body.step !== "quote") return json({ error: "Unknown step." }, 400);
  if ((await hit(`rl:contactq:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many invoices. Try again in an hour." }, 429);
  if ((await hit(`rl:contactq:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 200) return json({ error: "Busy right now. Please try again in a few minutes." }, 429);
  let inv;
  try { inv = await createInvoice({ usd: CONTACT.usd, memo: "Contact message (spam shield)", nodeOnly: true, expiry: CONTACT.quoteTtl }); }
  catch { return json({ error: "Payments are offline right now, so messages are paused. Please try again later." }, 503); }
  await setJSON(`contact:quote:${inv.paymentHash}`, { inv, used: false });
  return json({ bolt11: inv.bolt11, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()), hash: inv.paymentHash, sats: inv.sats, usd: CONTACT.usd, expiresAt: inv.expiresAt });
}

export async function GET(request) {
  const hash = clean(new URL(request.url).searchParams.get("hash"), 64);
  if ((await hit(`rl:contactcheck:${clientIp(request)}`, 600)) > 300) return json({ error: "Too many checks." }, 429);
  if (!/^[0-9a-f]{64}$/.test(hash)) return json({ error: "Unknown invoice." }, 404);
  const rec = await getJSON(`contact:quote:${hash}`);
  if (!rec) return json({ error: "Unknown invoice." }, 404);
  let paid = false;
  try { paid = (await invoicePaid(rec.inv)) === true; } catch { paid = false; }
  return json({ paid });
}

async function send(request, body) {
  const name = clean(body.name, CONTACT.nameMax);
  const email = clean(body.email, CONTACT.emailMax);
  const message = clean(body.message, CONTACT.messageMax);
  const topic = TOPICS[body.topic] ? body.topic : null;
  const hash = /^[0-9a-f]{64}$/.test(String(body.hash || "")) ? body.hash : null;
  if (!name) return json({ error: "Tell us your name." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "That email address does not look right." }, 400);
  if (!topic) return json({ error: "Pick what your message is about." }, 400);
  if (message.length < CONTACT.messageMin) return json({ error: "Write a little more so the team can help." }, 400);
  if (!hash) return json({ error: "Pay the $1 invoice first, then send." }, 402);
  if ((await hit(`rl:contact:${clientIp(request)}`, 3600)) > 10) return json({ error: "Too many messages. Try again in an hour." }, 429);
  if ((await hit(`rl:contact:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 100) return json({ error: "Busy right now. Please try again in a few minutes." }, 429);
  const release = await acquireLock(`contact:pay:${hash}`, 60);
  if (!release) return json({ error: "Already sending. Wait a moment and try again." }, 429);
  try {
    const rec = await getJSON(`contact:quote:${hash}`);
    if (!rec || rec.used || rec.inv?.paymentHash !== hash) return json({ error: "That invoice was already used. Start a new message for a fresh one." }, 402);
    if (Date.parse(rec.inv.expiresAt) < Date.now()) return json({ error: "That invoice expired. Start a new message for a fresh one." }, 402);
    let paid = false;
    try { paid = (await invoicePaid(rec.inv)) === true; } catch { paid = false; }
    if (!paid) return json({ error: "We have not received your $1 yet. Pay the invoice, then send." }, 402);
    const id = newId(8);
    const t = TOPICS[topic];
    const year = new Date().toISOString().slice(0, 4);
    const receipt = `ALT-${year}-${String(await increment(`receipt:no:${year}`)).padStart(4, "0")}`;
    const at = new Date().toISOString();
    // The security screen reads every paid message before the team does: links,
    // code, scripts or instructions aimed at our agents put it on hold, and the
    // hold is recorded in the Security watch. Held messages still get receipts.
    const { screen, describe, defang } = await import("../lib/screen.js");
    const s = screen(`${name}\n${message}`);
    const held = s.flagged ? { at, reasons: s.reasons } : null;
    await setJSON(`contact:quote:${hash}`, { ...rec, used: true });
    await setJSON(`contact:msg:${id}`, { id, at, paidAt: at, name, email, topic, dept: t.dept, label: t.label, message, sats: rec.inv.sats, hash, receipt, handled: false, held });
    await pushId("contact:inbox", id);
    if (held) {
      const { recordAttack } = await import("../lib/attacks.js");
      await recordAttack(s.reasons.includes("instructions") ? "prompt_injection" : "hidden_content",
        { where: `contact message ${id}`, ip: clientIp(request), detail: `${describe(s.reasons)}: ${defang(message).slice(0, 160)}` }).catch(() => {});
    }
    const { sendEmail, OWNER_EMAIL } = await import("../lib/email.js");
    try {
      await sendEmail({ to: OWNER_EMAIL, subject: `Contact: ${t.label} from ${name}`, kind: "owner",
        text: `A paid ($1) contact message arrived for ${t.dept}.${held ? ` SECURITY HOLD: it contains ${describe(held.reasons)}, so no AI agent may read it until you decide. The text below is defanged.` : ""}\n\nFrom: ${name} <${email}>\nAbout: ${t.label}\nReceipt: ${receipt}\n\n${held ? defang(message) : message}\n\nRead and queue a reply from the dashboard: Choumi tab, contact inbox.`, replyTo: email });
    } catch (err) { console.error("contact notify", err.message); }
    try {
      await sendContactReceipt({ to: email, name, sats: rec.inv.sats, label: t.label, dept: t.dept, receipt, hash, site: siteUrl(request) });
    } catch (err) { console.error("contact receipt", err.message); }
    return json({ ok: true, id, receipt });
  } finally { await release(); }
}
