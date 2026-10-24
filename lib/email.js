// Outbound email through Resend's REST API. Every message is also logged to the
// outbox so the admin dashboard shows exactly what the agents sent, and so the
// site still works (log only) before RESEND_API_KEY is set.
import { BUSINESS } from "../data/catalog.js";
import { setJSON, pushId, getJSON } from "./store.js";
import { newId } from "./http.js";

// Everything goes out from stan@altradits.com (Stanley's AI version and QA) or
// a named department head (data/team-comms.js). Department emails copy stan@,
// and anything about a paying client (after a deposit) is blind-copied to
// Stanley's own inbox in case it needs him. EMAIL_BCC=none switches that off.
const FROM = process.env.EMAIL_FROM || "Stan at Altradits <stan@altradits.com>";
export const OWNER_EMAIL = process.env.OWNER_EMAIL || BUSINESS.email;
const BCC = (process.env.EMAIL_BCC ?? BUSINESS.email).trim();
const SITE = () => (process.env.SITE_URL || BUSINESS.siteUrl).replace(/\/$/, "");
export const CONTACT = { email: "stan@altradits.com", site: "altradits.com", place: "Nairobi, Kenya" };

let comms = null;
async function department(id) {
  comms ||= await import("../data/team-comms.js").catch(() => ({ commsFor: () => null }));
  return id ? comms.commsFor(id) : null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function layout(title, bodyText, cta, sender) {
  const paras = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:#2F5BEA;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  // Letterhead: the logo and contact line on top, the sender's signature at the foot.
  const sig = sender?.signature?.length ? `<p style="margin:22px 0 0;color:#0F1B2D;font-size:14px;line-height:1.5">${sender.signature.map(escapeHtml).join("<br>")}</p>` : "";
  return `<div style="font:16px/1.55 system-ui,sans-serif;color:#0F1B2D;max-width:560px;margin:auto;padding:24px">
<table role="presentation" width="100%" style="border-collapse:collapse;border-bottom:2px solid #0F1B2D;margin:0 0 20px"><tr>
<td style="padding:0 0 12px"><a href="${SITE()}"><img src="${SITE()}/assets/logo.png" alt="Altradits" width="120" style="display:block;width:120px;height:auto;border:0"></a></td>
<td style="padding:0 0 12px;text-align:right;color:#4B5A70;font-size:12px;line-height:1.5">${escapeHtml(sender?.address || CONTACT.email)}<br>${CONTACT.site} · ${CONTACT.place}</td></tr></table>
<h2 style="font-size:20px;margin:0 0 14px">${escapeHtml(title)}</h2>${paras}${button}${sig}
<p style="color:#4B5A70;font-size:12px;margin-top:28px;border-top:1px solid #C9D3DF;padding-top:12px">Altradits · Virtual assistance worldwide · ${CONTACT.site} · ${escapeHtml(BUSINESS.timezone)}<br>We never ask for passwords, card numbers or seed phrases by email.</p></div>`;
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

// Has this client paid a deposit? (stage moves to active/paid on payment.)
async function paidClient(leadId) {
  const lead = leadId && (await getJSON(`lead:${leadId}`).catch(() => null));
  return Boolean(lead && ["paid", "active"].includes(lead.stage));
}

export async function sendEmail({ to, subject, text, cta, kind = "client", leadId = null, replyTo, dept, paid }) {
  // A department sends as itself (name, address, signature); otherwise Stanley does.
  const sender = kind === "owner" ? null : (await department(dept || "founder")) || null;
  const from = dept && sender ? `${sender.name} <${sender.address}>` : FROM;
  const sign = sender?.signature?.length ? `\n\n--\n${sender.signature.join("\n")}` : "";
  const cc = dept && sender && sender.address !== CONTACT.email && !String(to).toLowerCase().includes(CONTACT.email) ? CONTACT.email : undefined;
  const afterDeposit = paid ?? (await paidClient(leadId));
  const bcc = afterDeposit && BCC && BCC !== "none" && !String(to).toLowerCase().includes(BCC.toLowerCase()) ? BCC : undefined;
  replyTo ||= dept && sender ? sender.address : CONTACT.email;
  const record = { id: newId(), to, from, cc: cc || null, bcc: bcc || null, dept: dept || null, subject, text, cta: cta || null, kind, leadId, at: new Date().toISOString(), status: "logged" };
  const smtp = await mailer();
  if (smtp) {
    try {
      await smtp.sendMail({
        from, to, cc, bcc, subject, replyTo,
        text: `${cta ? `${text}\n\n${cta.label}: ${cta.url}` : text}${sign}`,
        html: layout(subject, text, cta, sender),
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
          from, to: [to], ...(cc ? { cc: [cc] } : {}), ...(bcc ? { bcc: [bcc] } : {}), subject,
          text: `${cta ? `${text}\n\n${cta.label}: ${cta.url}` : text}${sign}`,
          html: layout(subject, text, cta, sender),
          reply_to: replyTo,
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
