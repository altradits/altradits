// Outbound email: Ye₿ente's codes, links and security notices to a wallet's
// owner, and alerts to Stanley. Sent by the host's mail server (sendmail), a
// mailbox (SMTP_*) or Resend (RESEND_API_KEY). Every message is also logged to
// the store, so the admin shows what was sent; a wallet email's link never is.
import fs from "node:fs";
import { setJSON, pushId } from "./store.js";
import { newId } from "./http.js";

const FROM = process.env.EMAIL_FROM || (process.env.RESEND_API_KEY && !process.env.SMTP_HOST && process.env.EMAIL_TRANSPORT !== "sendmail" ? "Altradits <onboarding@resend.dev>" : "Altradits <hello@altradits.com>");
export const OWNER_EMAIL = process.env.OWNER_EMAIL || "altradits@gmail.com";
export const CONTACT = { email: "hello@altradits.com", site: "altradits.com", place: "Kisumu, Kenya" };
const SITE = () => (process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "");
const NAVY = "#274C77", MUTED = "#4B5A70", LOGO_BG = "#F5F5F5";

// The logo travels inside each email (an inline attachment), so mail apps don't block it.
const LOGO_CID = "altradits-logo";
const LOGO_FILE = new URL("../assets/logo.png", import.meta.url);
let logoB64;
const logoAttachment = () => {
  try { logoB64 ||= fs.readFileSync(LOGO_FILE).toString("base64"); } catch { return null; }
  return { filename: "altradits-logo.png", content: logoB64, encoding: "base64", contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" };
};

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SAFETY = "We never ask for passwords, PINs, card numbers or recovery words by email.";

// Links are embedded, never shown as raw addresses: write [label](url) in the text.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
const shortUrl = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + (x.pathname === "/" ? "" : x.pathname)).slice(0, 40); } catch { return "link"; } };
const richHtml = (text) => escapeHtml(text).replace(LINK_RE, (m, label, url, bare) => {
  const href = (url || bare).replace(/&amp;/g, "&");
  return `<a href="${escapeHtml(href)}" style="color:${NAVY};font-weight:600">${label || escapeHtml(shortUrl(href))}</a>`;
}).replace(/\n/g, "<br>");
const plainText = (text) => String(text).replace(LINK_RE, (m, label, url, bare) => (label ? `${label}: ${url}` : bare));

function layout(text, cta) {
  const paras = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${richHtml(p)}</p>`).join("");
  const button = cta ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:${NAVY};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>` : "";
  return `<div style="font:16px/1.55 system-ui,sans-serif;color:#0F1B2D;max-width:560px;margin:auto;padding:24px">${paras}${button}
<table role="presentation" width="100%" bgcolor="${LOGO_BG}" style="border-collapse:collapse;margin:26px 0 0;background:${LOGO_BG};border-radius:8px"><tr>
<td style="padding:14px 16px;vertical-align:middle;width:1%"><a href="${SITE()}"><img src="cid:${LOGO_CID}" alt="Altradits" width="88" style="display:block;width:88px;height:auto;border:0"></a></td>
<td style="padding:14px 16px 14px 0;color:${MUTED};font:12px/1.5 system-ui,sans-serif">${CONTACT.site} · ${CONTACT.email}<br>${SAFETY}</td></tr></table></div>`;
}

let transport;
export function setMailer(t) { transport = t; } // tests
async function mailer() {
  if (transport !== undefined) return transport;
  transport = null;
  if (process.env.SMTP_HOST || process.env.EMAIL_TRANSPORT === "sendmail") {
    const { default: nodemailer } = await import("nodemailer");
    transport = process.env.SMTP_HOST
      ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465, secure: (Number(process.env.SMTP_PORT) || 465) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
      : nodemailer.createTransport({ sendmail: true, newline: "unix", path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" });
  }
  return transport;
}

// Reserved test domains (example.com, .test, .invalid…) can't receive mail: skipped on the live site.
const TEST_DOMAIN = /@(?:[^@\s]+\.)?(?:example\.(?:com|org|net)|[^@\s]+\.(?:test|invalid|example|localhost))\s*$/i;

// kind: "wallet" (Ye₿ente, to its owner only) or "owner" (an alert to Stanley).
export async function sendEmail({ to, subject, text, cta, kind = "wallet", replyTo }) {
  // Alerts and reports to Stanley come from Stan (lib/stan.js); wallet mail from Altradits.
  const from = kind === "owner" ? FROM.replace(/^[^<]*</, "Stan · Altradits <") : FROM;
  const record = { id: newId(), to, from, cc: null, bcc: null, subject, text, cta: cta ? (kind === "wallet" ? { label: cta.label, url: "(not stored)" } : cta) : null, kind, at: new Date().toISOString(), status: "logged" };
  const body = `${plainText(text)}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n--\n${CONTACT.site}\n${SAFETY}`;
  const testAddress = process.env.NODE_ENV === "production" && TEST_DOMAIN.test(String(to));
  const smtp = testAddress ? null : await mailer();
  if (testAddress) record.status = "skipped: test address";
  else if (smtp) {
    try {
      await smtp.sendMail({ from, to, subject, replyTo: replyTo || process.env.EMAIL_REPLY_TO || CONTACT.email, attachments: [logoAttachment()].filter(Boolean), text: body, html: layout(text, cta) });
      record.status = "sent";
    } catch (err) { record.status = `failed: ${err.message}`; }
  } else if (process.env.RESEND_API_KEY) {
    try {
      const logo = logoAttachment();
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text: body, html: layout(text, cta), reply_to: replyTo || process.env.EMAIL_REPLY_TO || CONTACT.email,
          attachments: logo ? [{ filename: logo.filename, content: logo.content, content_id: LOGO_CID }] : [] }),
      });
      record.status = res.ok ? "sent" : `failed ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (err) { record.status = `failed: ${err.message}`; }
  }
  await setJSON(`email:${record.id}`, record);
  await pushId("emails", record.id);
  if (record.status !== "sent") console.log(`[email ${record.status}] id=${record.id} kind=${kind}`); // no addresses or subjects in shared-hosting logs
  return record;
}

// An alert to Stanley's own inbox, from Stan.
export function emailOwner(subject, text, cta) {
  return sendEmail({ to: OWNER_EMAIL, subject: `[Action needed] ${subject}`, text, cta, kind: "owner" });
}
