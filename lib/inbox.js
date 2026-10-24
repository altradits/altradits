// Department inboxes in the admin dashboard (read-only). Each mailbox on
// mail.altradits.com is read over IMAP with its own password, which Stanley
// sets as an environment variable in DirectAdmin → Setup Node.js App:
//   MAIL_STAN, MAIL_HELLO, MAIL_CARE, MAIL_ORDERS, … (MAIL_ + the part before @)
// Mailboxes are opened read-only, so viewing a message never marks it read or
// changes anything. Message bodies are shown as plain text, and anything with
// links or code is flagged by the security screen (lib/screen.js).
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { COMMS } from "../data/team-comms.js";
import { screen, describe } from "./screen.js";

const HOST = () => process.env.IMAP_HOST || "mail.altradits.com";
const PORT = () => Number(process.env.IMAP_PORT) || 993;
const LIST_MAX = 30;
const CACHE_MS = 2 * 60e3;

// stan@ first, then one entry per department address (careers@ and admin@ share a head, not a box).
export function mailboxes() {
  const seen = new Set();
  return COMMS.filter((c) => !seen.has(c.address) && seen.add(c.address)).map((c) => {
    const local = c.address.split("@")[0];
    return { id: local, address: c.address, name: c.id === "founder" ? "Stan (QA & internal)" : c.name.replace(/^Altradits\s*/, "") || c.head.title.replace(/^Head of /, ""), env: `MAIL_${local.toUpperCase()}` };
  });
}
const box = (id) => mailboxes().find((b) => b.id === id);
const password = (b) => process.env[b.env] || "";

let connect = (b) => new ImapFlow({ host: HOST(), port: PORT(), secure: true, auth: { user: b.address, pass: password(b) }, logger: false, socketTimeout: 20000 });
export function setImapFactory(f) { connect = f; } // tests

async function withBox(b, fn) {
  const client = connect(b);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try { return await fn(client); } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}

let cache = { at: 0, data: null };
// Every mailbox: connected or not, unread count, the latest messages' headers.
export async function listInboxes({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await Promise.all(mailboxes().map(async (b) => {
    if (!password(b)) return { ...b, connected: false, messages: [] };
    try {
      return await withBox(b, async (c) => {
        const total = c.mailbox.exists;
        const messages = [];
        if (total) {
          for await (const m of c.fetch(`${Math.max(1, total - LIST_MAX + 1)}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
            const from = m.envelope.from?.[0];
            messages.push({ uid: m.uid, subject: m.envelope.subject || "(no subject)", from: from ? (from.name ? `${from.name} <${from.address}>` : from.address) : "", date: (m.envelope.date || m.internalDate)?.toISOString?.() || null, unread: !m.flags?.has("\\Seen") });
          }
        }
        messages.reverse();
        return { ...b, connected: true, total, unread: messages.filter((m) => m.unread).length, messages };
      });
    } catch (err) {
      return { ...b, connected: false, error: /auth/i.test(err.message) || err.authenticationFailed ? "Login failed: check the password in " + b.env : err.message.slice(0, 160), messages: [] };
    }
  }));
  // Never send env var values or passwords to the browser: only names.
  cache = { at: Date.now(), data };
  return data;
}

// One message, as plain text, with the security screen's verdict.
export async function readMessage(id, uid) {
  const b = box(id);
  if (!b || !password(b)) throw new Error("That mailbox isn't connected.");
  return withBox(b, async (c) => {
    const msg = await c.fetchOne(String(Number(uid)), { source: true }, { uid: true });
    if (!msg?.source) throw new Error("Message not found.");
    const p = await simpleParser(msg.source);
    const text = (p.text || (p.html ? p.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ") : "")).trim().slice(0, 50000);
    const s = screen(`${p.subject || ""}\n${text}`);
    return {
      mailbox: b.address, uid: Number(uid), subject: p.subject || "(no subject)", from: p.from?.text || "", to: p.to?.text || "", cc: p.cc?.text || "",
      date: p.date?.toISOString() || null, text,
      attachments: (p.attachments || []).map((a) => ({ name: a.filename || "attachment", size: a.size, type: a.contentType })),
      security: s.flagged ? `Contains ${describe(s.reasons)}. Don't open links or attachments unless you trust the sender.` : null,
    };
  });
}
