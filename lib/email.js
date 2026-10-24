// Outbound email through Resend's REST API. Every message is also logged to the
// outbox so the admin dashboard shows exactly what the agents sent, and so the
// site still works (log only) before RESEND_API_KEY is set.
import { BUSINESS } from "../data/catalog.js";
import { setJSON, pushId } from "./store.js";
import { newId } from "./http.js";

// Who sends what (data/team-comms.js):
// - External email comes from the department heads at their official addresses
//   (the Front Office, hello@, when no department fits), with stan@ copied.
// - Stan (stan@altradits.com), Head of Quality and Internal Communications,
//   sends all internal mail (kind "team") and each client's payment
//   confirmation (kind "payment"). Payment confirmations are blind-copied to
//   Stanley at altradits@gmail.com (EMAIL_BCC=none switches that off).
// Stanley monitors through stan@ and the admin, without approving anything.
// EMAIL_FROM forces one sending address (for hosts that only allow their own
// mailbox, or Resend before altradits.com is verified); the department stays in
// the display name and Reply-To. EMAIL_REPLY_TO sends every reply to one inbox
// (e.g. altradits@gmail.com) until the department forwarders exist.
const FROM = process.env.EMAIL_FROM || (process.env.RESEND_API_KEY && !process.env.SMTP_HOST && process.env.EMAIL_TRANSPORT !== "sendmail" ? "Altradits <onboarding@resend.dev>" : "Altradits <hello@altradits.com>");
const FORCED_FROM = process.env.EMAIL_FROM || (process.env.RESEND_API_KEY && !process.env.SMTP_HOST && process.env.EMAIL_TRANSPORT !== "sendmail" ? FROM : "");
const STAN = "stan@altradits.com";
// Brand colours, sampled from the logo.
const NAVY = "#234B73", RED = "#E2474F", MUTED = "#4B5A70";
// The logo always sits on its brand background (from the official artwork).
const LOGO_BG = "#F5F5F5";
const logoTile = (width) => `<a href="${SITE()}" style="display:inline-block;background:${LOGO_BG};padding:8px 12px;border-radius:6px;text-decoration:none"><img src="${SITE()}/assets/logo.png" alt="Altradits" width="${width}" style="display:block;width:${width}px;height:auto;border:0"></a>`;
export const OWNER_EMAIL = process.env.OWNER_EMAIL || BUSINESS.email;
const BCC = (process.env.EMAIL_BCC ?? BUSINESS.email).trim();
const SITE = () => (process.env.SITE_URL || BUSINESS.siteUrl).replace(/\/$/, "");
export const CONTACT = { email: "hello@altradits.com", site: "altradits.com", place: "Nairobi, Kenya" };

let comms = null;
async function department(id) {
  comms ||= await import("../data/team-comms.js").catch(() => ({ commsFor: () => null }));
  return id ? comms.commsFor(id) : null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// The email signature: logo, red brand bar, the head's name in navy, their
// title (which says they're an AI agent) and the department address.
function signatureHtml(sender) {
  const [name, title, ...rest] = sender.signature;
  const link = (t) => t.split(" · ").map((part) => /@/.test(part)
    ? `<a href="mailto:${escapeHtml(part)}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>`
    : /\./.test(part) ? `<a href="${SITE()}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>` : escapeHtml(part)).join(" · ");
  return `<table role="presentation" style="border-collapse:collapse;margin:26px 0 0"><tr>
<td style="padding:2px 14px 2px 0;vertical-align:middle">${logoTile(88)}</td>
<td style="width:3px;background:${RED};font-size:0;line-height:0">&nbsp;</td>
<td style="padding:2px 0 2px 14px;vertical-align:middle;font:14px/1.45 system-ui,sans-serif">
<b style="color:${NAVY};font-size:15px">${escapeHtml(name)}</b><br>
<span style="color:${MUTED};font-size:13px">${escapeHtml(title || "")}</span>${rest.length ? `<br><span style="font-size:13px">${rest.map(link).join("<br>")}</span>` : ""}
</td></tr></table>`;
}

function layout(title, bodyText, cta, sender) {
  const paras = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:${NAVY};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  // Letterhead: the logo and contact line on top, the sender's branded signature at the foot.
  const sig = sender?.signature?.length ? signatureHtml(sender) : "";
  return `<div style="font:16px/1.55 system-ui,sans-serif;color:#0F1B2D;max-width:560px;margin:auto;padding:24px">
<table role="presentation" width="100%" style="border-collapse:collapse;border-bottom:2px solid ${NAVY};margin:0 0 20px"><tr>
<td style="padding:0 0 12px">${logoTile(116)}</td>
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

export async function sendEmail({ to, subject, text, cta, kind = "client", leadId = null, replyTo, dept, headers }) {
  // Internal mail is Stan's (except replies to job applicants, which careers@
  // sends); payment confirmations are Stan's; everything else goes out from
  // the department, or the Front Office when none fits.
  const internal = kind === "team" && dept !== "careers";
  // Escalations to Stanley are internal too, so they come from Stan.
  let sender = await department(internal || kind === "payment" || kind === "owner" ? "founder" : dept || "office");
  if (sender && (sender.sendsAs === false || (sender.address === STAN && !internal && kind !== "payment" && kind !== "owner"))) sender = await department("office");
  const from = FORCED_FROM ? (sender ? `${sender.name} <${FORCED_FROM.match(/<([^>]+)>/)?.[1] || FORCED_FROM}>` : FORCED_FROM) : sender ? `${sender.name} <${sender.address}>` : FROM;
  const sign = sender?.signature?.length ? `\n\n--\n${sender.signature.join("\n")}` : "";
  // Stan is copied on what the heads send; Stanley is blind-copied on payment confirmations.
  const cc = kind !== "owner" && sender?.address !== STAN && !String(to).toLowerCase().includes(STAN) ? STAN : undefined;
  const bcc = kind === "payment" && BCC && BCC !== "none" && !String(to).toLowerCase().includes(BCC.toLowerCase()) ? BCC : undefined;
  replyTo ||= process.env.EMAIL_REPLY_TO || (sender ? sender.address : CONTACT.email);
  const record = { id: newId(), to, from, cc: cc || null, bcc: bcc || null, dept: dept || null, subject, text, cta: cta || null, kind, leadId, at: new Date().toISOString(), status: "logged" };
  const smtp = await mailer();
  if (smtp) {
    try {
      await smtp.sendMail({
        from, to, cc, bcc, subject, replyTo, ...(headers ? { headers } : {}),
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
          from, to: [to], ...(cc ? { cc: [cc] } : {}), ...(bcc ? { bcc: [bcc] } : {}), ...(headers ? { headers } : {}), subject,
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

// The exact HTML an email would have (admin previews and tests).
export async function previewEmail({ subject, text, cta, dept, kind = "client" }) {
  const internal = kind === "team" && dept !== "careers";
  let sender = await department(internal || kind === "payment" ? "founder" : dept || "office");
  if (sender && (sender.sendsAs === false || (sender.address === STAN && !internal && kind !== "payment"))) sender = await department("office");
  return layout(subject, text, cta, sender);
}
