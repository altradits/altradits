// Outbound email through Resend's REST API. Every message is also logged to the
// outbox so the admin dashboard shows exactly what the agents sent, and so the
// site still works (log only) before RESEND_API_KEY is set.
import { BUSINESS } from "../data/catalog.js";
import { setJSON, pushId } from "./store.js";
import { newId } from "./http.js";

const FROM = process.env.EMAIL_FROM || (process.env.RESEND_API_KEY ? "Altradits <onboarding@resend.dev>" : "Altradits <hello@altradits.com>");
export const OWNER_EMAIL = process.env.OWNER_EMAIL || BUSINESS.email;

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function layout(title, bodyText, cta) {
  const paras = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:#2F5BEA;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<div style="font:16px/1.55 system-ui,sans-serif;color:#0F1B2D;max-width:560px;margin:auto;padding:24px">
<p style="font-weight:800;font-size:18px;margin:0 0 18px">Altradits</p>
<h2 style="font-size:20px;margin:0 0 14px">${escapeHtml(title)}</h2>${paras}${button}
<p style="color:#4B5A70;font-size:13px;margin-top:28px">Altradits · ${escapeHtml(BUSINESS.timezone)} · Reply to this email to reach a human.</p></div>`;
}

// Server mail: EMAIL_TRANSPORT=sendmail uses the host's own mail server (no
// credentials needed on HostAfrica); SMTP_HOST/SMTP_USER/SMTP_PASS use a mailbox.
let transport;
async function mailer() {
  if (transport !== undefined) return transport;
  transport = null;
  if (process.env.SMTP_HOST || process.env.EMAIL_TRANSPORT === "sendmail") {
    const { default: nodemailer } = await import("nodemailer");
    transport = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465,
          secure: (Number(process.env.SMTP_PORT) || 465) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
      : nodemailer.createTransport({ sendmail: true, newline: "unix", path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" });
  }
  return transport;
}

export async function sendEmail({ to, subject, text, cta, kind = "client", leadId = null, replyTo }) {
  const record = { id: newId(), to, subject, text, cta: cta || null, kind, leadId, at: new Date().toISOString(), status: "logged" };
  const smtp = await mailer();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: FROM, to, subject, replyTo: replyTo || OWNER_EMAIL,
        text: cta ? `${text}\n\n${cta.label}: ${cta.url}` : text,
        html: layout(subject, text, cta),
      });
      record.status = "sent";
    } catch (err) {
      record.status = `failed: ${err.message}`;
    }
  } else if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: [to], subject,
          text: cta ? `${text}\n\n${cta.label}: ${cta.url}` : text,
          html: layout(subject, text, cta),
          reply_to: replyTo || OWNER_EMAIL,
        }),
      });
      record.status = res.ok ? "sent" : `failed ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (err) {
      record.status = `failed: ${err.message}`;
    }
  }
  await setJSON(`email:${record.id}`, record);
  await pushId("emails", record.id);
  if (record.status !== "sent") console.log(`[email ${record.status}] to=${to} subject=${subject}`);
  return record;
}

// The only path to Stanley's inbox. Callers decide criticality; see notifyOwner
// in agent.js for the filter.
export function emailOwner(subject, text, cta, leadId) {
  return sendEmail({ to: OWNER_EMAIL, subject: `[Action needed] ${subject}`, text, cta, kind: "owner", leadId });
}
