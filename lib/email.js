// Outbound email through Resend's REST API. Every message is also logged to the
// outbox so the admin dashboard shows exactly what the agents sent, and so the
// site still works (log only) before RESEND_API_KEY is set.
import fs from "node:fs";
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
const NAVY = "#274C77", RED = "#EA5158", MUTED = "#4B5A70";
// The logo always sits on its brand background (from the official artwork).
const LOGO_BG = "#F5F5F5";
// The logo travels inside each email (an inline attachment), not fetched from
// the web, so mail apps don't block it or warn "remote resources have been blocked".
const LOGO_CID = "altradits-logo";
const LOGO_FILE = new URL("../assets/logo.png", import.meta.url);
let logoB64;
const logoAttachment = () => {
  try { logoB64 ||= fs.readFileSync(LOGO_FILE).toString("base64"); } catch { return null; }
  return { filename: "altradits-logo.png", content: logoB64, encoding: "base64", contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" };
};
const logoImg = (width) => `<a href="${SITE()}" style="display:inline-block;background:${LOGO_BG};text-decoration:none"><img src="cid:${LOGO_CID}" alt="Altradits" width="${width}" style="display:block;width:${width}px;height:auto;border:0;background:${LOGO_BG}"></a>`;
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

// The email signature, all on the logo's brand background: logo, red brand
// bar, the head's name in navy, their title and the department address, then
// one small line with the safety note and (on mailing-list email) Unsubscribe.
const SAFETY = "We never ask for passwords, card numbers or seed phrases by email.";
function signatureHtml(sender, unsubscribe) {
  const [name, title, ...rest] = sender.signature;
  const link = (t) => t.split(" · ").map((part) => /@/.test(part)
    ? `<a href="mailto:${escapeHtml(part)}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>`
    : /\./.test(part) ? `<a href="${SITE()}" style="color:${NAVY};text-decoration:none">${escapeHtml(part)}</a>` : escapeHtml(part)).join(" · ");
  return `<table role="presentation" width="100%" bgcolor="${LOGO_BG}" style="border-collapse:collapse;margin:26px 0 0;background:${LOGO_BG};border-radius:8px">
<tr><td style="padding:14px 0 10px 16px;vertical-align:middle;width:1%">${logoImg(88)}</td>
<td style="padding:14px 0 10px 14px;vertical-align:middle"><table role="presentation" style="border-collapse:collapse"><tr>
<td style="width:3px;background:${RED};font-size:0;line-height:0">&nbsp;</td>
<td style="padding:2px 0 2px 14px;font:14px/1.45 system-ui,sans-serif">
<b style="color:${NAVY};font-size:15px">${escapeHtml(name)}</b><br>
<span style="color:${MUTED};font-size:13px">${escapeHtml(title || "")}</span>${rest.length ? `<br><span style="font-size:13px">${rest.map(link).join("<br>")}</span>` : ""}
</td></tr></table></td></tr>
<tr><td colspan="2" style="padding:0 16px 12px;color:${MUTED};font:11px/1.5 system-ui,sans-serif">${SAFETY}${unsubscribe ? ` <a href="${escapeHtml(unsubscribe)}" style="color:${MUTED}">Unsubscribe</a>` : ""}</td></tr></table>`;
}

// Links are embedded, never shown as raw addresses: write [label](url) in the
// text; a bare URL becomes a link showing only its short form (no tokens).
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
const shortUrl = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + (x.pathname === "/" ? "" : x.pathname)).slice(0, 40); } catch { return "link"; } };
// noLinks: alerts to Stanley quote what clients wrote, so only links to places
// we trust (the site, our own social and code hosts) become clickable; anything
// else (a "[Review payment](https://evil…)") stays visible as plain text.
const TRUSTED = /(^|\.)(altradits\.com|x\.com|twitter\.com|linkedin\.com|facebook\.com|tiktok\.com|instagram\.com|github\.com|wa\.me)$/i;
const trusted = (href) => { try { const u = new URL(href); return u.protocol === "https:" && (TRUSTED.test(u.hostname) || u.hostname === new URL(SITE()).hostname); } catch { return false; } };
function richHtml(text, noLinks = false) {
  return escapeHtml(text).replace(LINK_RE, (m, label, url, bare) => {
    const href = (url || bare).replace(/&amp;/g, "&");
    if (noLinks && !trusted(href)) return m;
    return `<a href="${escapeHtml(href)}" style="color:${NAVY};font-weight:600">${label || escapeHtml(shortUrl(href))}</a>`;
  }).replace(/\n/g, "<br>");
}
// The plain-text copy (shown only by text-only mail apps) keeps the address.
const plainText = (text) => String(text).replace(LINK_RE, (m, label, url, bare) => (label ? `${label}: ${url}` : bare));

function layout(title, bodyText, cta, sender, unsubscribe, noLinks = false) {
  const paras = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${richHtml(p, noLinks)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:${NAVY};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  // No letterhead: the signature carries the logo and contact details.
  const sig = signatureHtml(sender?.signature?.length ? sender : { signature: ["Altradits", "Virtual assistance worldwide", `${CONTACT.email} · ${CONTACT.site}`] }, unsubscribe);
  return `<div style="font:16px/1.55 system-ui,sans-serif;color:#0F1B2D;max-width:560px;margin:auto;padding:24px">
${paras}${button}${sig}</div>`;
}

// Server mail: EMAIL_TRANSPORT=sendmail uses the host's own mail server (no
// credentials needed on HostAfrica); SMTP_HOST/SMTP_USER/SMTP_PASS use a mailbox.
let transport;
export function setMailer(t) { transport = t; } // tests
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

// Stanley approves every email before it leaves (EMAIL_APPROVAL=off disables
// the gate, e.g. in tests). Skipping the queue: alerts to Stanley himself;
// payment emails, each with its receipt attached (Bitcoin settles instantly,
// so the client hears at once and receiving money needs no approval); and
// deliveries, the one email a visitor asked for on the site (their free kit).
// His own actions pass approved: true.
const AUTO = new Set(["owner", "payment", "delivery", "wallet"]); // wallet: Ye₿ente codes, links and security notices, to their owner only
const TEST_DOMAIN = /@(?:[^@\s]+\.)?(?:example\.(?:com|org|net)|[^@\s]+\.(?:test|invalid|example|localhost))\s*$/i;
const GATE = () => (process.env.EMAIL_APPROVAL || "on") !== "off";

export async function sendEmail(args) {
  if (GATE() && !AUTO.has(args.kind) && !args.approved) return queueForApproval(args);
  return deliver(args);
}

async function queueForApproval(args) {
  const preview = await deliver(args, { dryRun: true });
  const record = { ...preview, status: "awaiting approval", payload: { ...args, approved: undefined } };
  await setJSON(`email:${record.id}`, record);
  await pushId("emails", record.id);
  await pushId("approvalq", record.id);
  await notifyPending();
  return record;
}

// One heads-up to Stanley at most every 30 minutes while drafts are waiting.
async function notifyPending() {
  const { getJSON } = await import("./store.js");
  const last = await getJSON("mail:notifiedAt");
  if (last && Date.now() - Date.parse(last) < 30 * 60e3) return;
  await setJSON("mail:notifiedAt", new Date().toISOString());
  const n = (await pendingApprovals()).length;
  await deliver({ to: OWNER_EMAIL, kind: "owner", subject: `[Approval needed] ${n} email${n === 1 ? "" : "s"} waiting for you`,
    text: `Your departments have ${n} email${n === 1 ? "" : "s"} ready to send. Nothing goes out until you approve it.`,
    cta: { label: "Review and approve", url: `${SITE()}/admin#stan` } }).catch(() => {});
}

export async function pendingApprovals() {
  const { listIds, getMany } = await import("./store.js");
  return (await getMany("email", await listIds("approvalq", 500))).filter((e) => e.status === "awaiting approval");
}

// Stanley's decision on a waiting email; edits to subject and text are kept.
export async function decideEmail(id, { approve, subject, text, note } = {}) {
  const { getJSON } = await import("./store.js");
  const rec = await getJSON(`email:${String(id).slice(0, 30)}`);
  if (!rec || rec.status !== "awaiting approval") throw new Error("That email isn't waiting for approval.");
  const at = new Date().toISOString();
  const dept = rec.dept || rec.payload?.dept || "office";
  if (!approve) {
    Object.assign(rec, { status: "rejected by Stanley", decidedAt: at, note: note || "" });
    await setJSON(`email:${rec.id}`, rec);
    if (note) {
      await import("./learning.js").then((m) => m.recordOutcome({
        kind: "stanley_email_edit", dept, approved: false, note, original: rec.payload,
      })).catch(() => {});
    }
    return rec;
  }
  const norm = (s) => String(s || "").replace(/\r\n/g, "\n").trim();
  const changedSubject = Boolean(subject && norm(subject) !== norm(rec.payload?.subject));
  const changedText = Boolean(text && norm(text) !== norm(rec.payload?.text));
  const edited = { ...rec.payload, ...(subject ? { subject } : {}), ...(text ? { text } : {}) };
  const sent = await deliver(edited);
  Object.assign(rec, { status: `approved: ${sent.status}`, decidedAt: at, sentAs: sent.id, subject: edited.subject, text: edited.text });
  await setJSON(`email:${rec.id}`, rec);
  if (changedSubject || changedText || note) {
    await import("./learning.js").then((m) => m.recordOutcome({
      kind: "stanley_email_edit",
      dept,
      approved: true,
      note: note || `Stanley edited ${changedSubject && changedText ? "subject and body" : changedSubject ? "subject" : "body"} before sending "${edited.subject}".`,
      original: rec.payload,
      edited,
      question: rec.payload?.subject,
      answer: changedText ? edited.text : "",
    })).catch(() => {});
  }
  return { ...rec, sent };
}

// attachments: [{ filename, content (base64), contentType }], e.g. a kit's PDF
// or a receipt, sent in the email so there's no download link to click.
async function deliver({ to, subject, text, cta, kind = "client", leadId = null, replyTo, dept, headers, unsubscribe, qa, attachments = [] }, { dryRun = false } = {}) {
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
  // Ye₿ente wallet mail (codes, recovery links, security notices) goes to its owner only.
  const cc = kind !== "owner" && kind !== "wallet" && sender?.address !== STAN && !String(to).toLowerCase().includes(STAN) ? STAN : undefined;
  const bcc = kind === "payment" && BCC && BCC !== "none" && !String(to).toLowerCase().includes(BCC.toLowerCase()) ? BCC : undefined;
  replyTo ||= process.env.EMAIL_REPLY_TO || (sender ? sender.address : CONTACT.email);
  // A wallet email's link (a login or recovery key) is never kept in the log.
  const record = { id: newId(), to, from, cc: cc || null, bcc: bcc || null, dept: dept || null, subject, text, cta: cta ? (kind === "wallet" ? { label: cta.label, url: "(not stored)" } : cta) : null, unsubscribe: unsubscribe || null, qa: qa || null, files: attachments.map((a) => a.filename), kind, leadId, at: new Date().toISOString(), status: "logged" };
  if (dryRun) return record;
  // Reserved test domains (example.com, .test, .invalid…) can't receive mail:
  // on the live site they're skipped, so the mail relay never sees a bounce.
  const testAddress = process.env.NODE_ENV === "production" && TEST_DOMAIN.test(String(to));
  const smtp = testAddress ? null : await mailer();
  if (testAddress) record.status = "skipped: test address";
  else if (smtp) {
    try {
      await smtp.sendMail({
        from, to, cc, bcc, subject, replyTo, ...(headers ? { headers } : {}),
        attachments: [logoAttachment(), ...attachments.map((a) => ({ ...a, encoding: "base64" }))].filter(Boolean),
        text: `${plainText(text)}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}${sign}${unsubscribe ? `\n\nUnsubscribe: ${unsubscribe}` : ""}`,
        html: layout(subject, text, cta, sender, unsubscribe, kind === "owner"),
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
          attachments: [...(logoAttachment() ? [{ filename: "altradits-logo.png", content: logoAttachment().content, content_id: LOGO_CID }] : []), ...attachments.map((a) => ({ filename: a.filename, content: a.content }))],
          text: `${plainText(text)}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}${sign}${unsubscribe ? `\n\nUnsubscribe: ${unsubscribe}` : ""}`,
          html: layout(subject, text, cta, sender, unsubscribe, kind === "owner"),
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
  if (record.status !== "sent") console.log(`[email ${record.status}] id=${record.id} kind=${kind}`); // no addresses or subjects in shared-hosting logs
  return record;
}

// The only path to Stanley's inbox. Callers decide criticality; see notifyOwner
// in agent.js for the filter.
export function emailOwner(subject, text, cta, leadId) {
  return sendEmail({ to: OWNER_EMAIL, subject: `[Action needed] ${subject}`, text, cta, kind: "owner", leadId });
}

// The exact HTML an email would have (admin previews and tests).
export async function previewEmail({ subject, text, cta, dept, kind = "client", unsubscribe }) {
  const internal = kind === "team" && dept !== "careers";
  let sender = await department(internal || kind === "payment" || kind === "owner" ? "founder" : dept || "office");
  if (sender && (sender.sendsAs === false || (sender.address === STAN && !internal && kind !== "payment" && kind !== "owner"))) sender = await department("office");
  return layout(subject, text, cta, sender, unsubscribe, kind === "owner").replaceAll(`cid:${LOGO_CID}`, `${SITE()}/assets/logo.png`);
}
