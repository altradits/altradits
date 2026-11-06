// Outbound email: Ye₿ente's codes, links and security notices to a wallet's
// owner, and alerts to Stanley. Sent by the host's mail server (sendmail), a
// mailbox (SMTP_*) or Resend (RESEND_API_KEY). Every message is also logged to
// the store, so the admin shows what was sent; a wallet email's link never is.
import fs from "node:fs";
import { setJSON, pushId } from "./store.js";
import { newId } from "./http.js";
import { deadmanActive } from "./deadman.js";
import { BUSINESS } from "../data/brand.js";
import { commsFor } from "../data/team-comms.js";

const FROM = process.env.EMAIL_FROM || (process.env.RESEND_API_KEY && !process.env.SMTP_HOST && process.env.EMAIL_TRANSPORT !== "sendmail" ? "Altradits <onboarding@resend.dev>" : "Altradits <hello@altradits.com>");
export const OWNER_EMAIL = process.env.OWNER_EMAIL || "altradits@gmail.com";
export const CONTACT = { email: BUSINESS.email, site: String(BUSINESS.site).replace(/^https?:\/\//, ""), place: BUSINESS.location };
const SITE = () => (process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "");
const NAVY = "#274C77", RED = "#EA5158", MUTED = "#4B5A70", INK = "#0F1B2D", LOGO_BG = "#F5F5F5";

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

// The sender's signature: red brand bar, name in navy, title, linked contact. Pure.
export function signatureHtml(sender) {
  const [name, title, contact] = sender;
  const link = String(contact || "").split(" · ").map((part) => /@/.test(part)
    ? `<a href="mailto:${escapeHtml(part)}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>`
    : /\./.test(part) ? `<a href="${SITE()}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>` : escapeHtml(part)).join(" · ");
  return `<table role="presentation" style="border-collapse:collapse;margin:0"><tr>`
    + `<td style="width:3px;background:${RED};font-size:0;line-height:0">&nbsp;</td>`
    + `<td style="padding:2px 0 2px 14px;font:14px/1.45 system-ui,-apple-system,sans-serif">`
    + `<b style="color:${NAVY};font-size:15px">${escapeHtml(name)}</b><br>`
    + `<span style="color:${MUTED};font-size:13px">${escapeHtml(title || "")}</span><br><span style="font-size:13px">${link}</span>`
    + `</td></tr></table>`;
}

// The branded message: the words, one button, the stamp below. No letterhead:
// emails open with the message; the logo lives in the footer stamp. Pure.
export function emailLayout(text, cta, sender = null) {
  const paras = String(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${richHtml(p)}</p>`).join("");
  const button = cta ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(cta.url)}" style="background:${NAVY};color:#ffffff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>` : "";
  const who = sender?.length ? signatureHtml(sender)
    : `<div style="font:14px/1.5 system-ui,-apple-system,sans-serif"><b style="color:${INK}">${escapeHtml(BUSINESS.name)}</b> · ${escapeHtml(CONTACT.place)}<br>${escapeHtml(CONTACT.email)} · ${escapeHtml(CONTACT.site)}</div>`;
  return `<div style="font:16px/1.6 system-ui,-apple-system,sans-serif;color:${INK};max-width:560px;margin:auto;padding:24px">`
    + paras + button
    + `<table role="presentation" width="100%" bgcolor="${LOGO_BG}" style="border-collapse:collapse;margin:26px 0 0;background:${LOGO_BG};border-radius:8px"><tr>`
    + `<td style="padding:14px 0 14px 16px;vertical-align:middle;width:1%"><a href="${SITE()}"><img src="cid:${LOGO_CID}" alt="${escapeHtml(BUSINESS.name)}" width="88" style="display:block;width:88px;height:auto;border:0"></a></td>`
    + `<td style="padding:14px 16px 14px 14px;vertical-align:middle">${who}</td></tr>`
    + `<tr><td colspan="2" style="padding:0 16px 12px;color:${MUTED};font:11.5px/1.5 system-ui,-apple-system,sans-serif">${SAFETY}</td></tr></table></div>`;
}

// The plain-text twin: same words, signature or contact lines at the foot. Pure.
export function emailText(text, cta, sender = null) {
  const foot = sender?.length ? `--\n${sender.join("\n")}\n${SAFETY}` : `--\n${BUSINESS.name} · ${BUSINESS.tagline}\n${CONTACT.place} · ${CONTACT.email} · ${CONTACT.site}\n${SAFETY}`;
  return `${plainText(text)}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n${foot}`;
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
// During a Deadman's Switch lockdown, owner alerts and wallet security notices
// (recovery, sign-out, PIN reset, wrong-PIN lock-out) still go out; everything else is held.
const WALLET_SECURITY_RE = /recover|signed out|new pin|locked after wrong pin|new phone logged in|someone asked to change your email|fingerprint approval turned on/i;

export async function sendEmail({ to, subject, text, cta, kind = "wallet", security = false, replyTo, sender, fromDept }) {
  // Owner alerts and reports to Stanley come from Stan by default (lib/stan.js);
  // wallet mail from Altradits. fromDept sends as a department instead: owner
  // alerts from the department they belong to (docs/system-overview.md), and
  // receipts from finance after the node confirms. Plain code only: the sender
  // never depends on AI keys, pause state, budgets or power buttons.
  const deptFrom = fromDept ? (() => { const d = commsFor(fromDept); return `${d.head.name} · ${d.name} <${d.address}>`; })() : null;
  const from = deptFrom || (kind === "owner" ? FROM.replace(/^[^<]*</, "Stan · Altradits <") : FROM);
  // Replies go to the sending department's own address, never the generic hello.
  const reply = replyTo || process.env.EMAIL_REPLY_TO || (fromDept ? commsFor(fromDept).address : null) || CONTACT.email;
  const sig = sender !== undefined ? sender : fromDept ? commsFor(fromDept).signature : kind === "owner" ? commsFor("founder").signature : null;
  const isWallet = kind === "wallet" || kind === "wallet_security";
  const isWalletSecurity = Boolean(security) || kind === "wallet_security" || (kind === "wallet" && WALLET_SECURITY_RE.test(`${subject || ""} ${text || ""}`));
  // A wallet email's links are never logged: the button URL above, and any
  // one-tap token written into the words (a freeze link). The mail sent keeps them.
  const loggedText = isWallet ? String(text).replace(/([?&]t=)[\w-]{20,}/g, "$1(redacted)") : text;
  // Our own Message-ID, stored on the log row: a bounce notice quotes it back,
  // which proves a "Mail delivery failed" is about mail we really sent (#119).
  const fromDomain = (String(from).match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})>?$/) || [])[1] || "altradits.com";
  const messageId = `<${newId(12)}@${fromDomain}>`;
  const record = { id: newId(), messageId, to, from, replyTo: reply, cc: null, bcc: null, subject, text: loggedText, cta: cta ? (isWallet ? { label: cta.label, url: "(not stored)" } : cta) : null, kind, security: isWalletSecurity || undefined, at: new Date().toISOString(), status: "logged" };
  const body = emailText(text, cta, sig);
  const testAddress = process.env.NODE_ENV === "production" && TEST_DOMAIN.test(String(to));
  const heldByDeadman = kind !== "owner" && !isWalletSecurity && deadmanActive();
  const smtp = testAddress || heldByDeadman ? null : await mailer();
  if (heldByDeadman) record.status = "held: deadman lockdown";
  else if (testAddress) record.status = "skipped: test address";
  else if (smtp) {
    try {
      await smtp.sendMail({ from, to, subject, replyTo: reply, messageId, attachments: [logoAttachment()].filter(Boolean), text: body, html: emailLayout(text, cta, sig) });
      record.status = "sent";
    } catch (err) { record.status = `failed: ${err.message}`; }
  } else if (process.env.RESEND_API_KEY) {
    try {
      const logo = logoAttachment();
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text: body, html: emailLayout(text, cta, sig), reply_to: reply, headers: { "Message-ID": messageId },
          attachments: logo ? [{ filename: logo.filename, content: logo.content, content_id: LOGO_CID }] : [] }),
      });
      record.status = res.ok ? "sent" : `failed ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (err) { record.status = `failed: ${err.message}`; }
  } else record.status = "failed: no email transport is configured"; // never "logged": unsent mail must say so
  await setJSON(`email:${record.id}`, record);
  await pushId("emails", record.id);
  if (record.status !== "sent") console.log(`[email ${record.status}] id=${record.id} kind=${kind}`); // no addresses or subjects in shared-hosting logs
  return record;
}

// An alert to Stanley's own inbox: from Stan, or fromDept when the alert
// belongs to a department (trust, tech, or the task's own department).
export function emailOwner(subject, text, cta, fromDept) {
  return sendEmail({ to: OWNER_EMAIL, subject: `[Action needed] ${subject}`, text, cta, kind: "owner", fromDept });
}

// A wallet email that never reached the transport (a rate-limit skip): the
// admin log still gets its row, so the miss is visible. No Message-ID: no
// message was created.
export async function logSkippedEmail({ to, subject, kind = "wallet", security = false, status }) {
  const record = { id: newId(), messageId: null, to, from: null, replyTo: null, cc: null, bcc: null,
    subject, text: "(not sent)", cta: null, kind, security: security || undefined, at: new Date().toISOString(), status };
  await setJSON(`email:${record.id}`, record);
  await pushId("emails", record.id);
  console.log(`[email ${record.status}] id=${record.id} kind=${kind}`); // no addresses or subjects in shared-hosting logs
  return record;
}
