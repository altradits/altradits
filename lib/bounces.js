// Bounced emails. The mail relay accepts a message and only later sends a
// "Mail delivery failed" notice back to the sending mailbox, so the admin log
// would keep saying "sent". Once an hour this reads those notices (read-only),
// marks the matching email "bounced: <reason>" and tells Stanley once.
//
// Each sending mailbox needs its password as MAIL_<LOCAL> (MAIL_HELLO for
// hello@altradits.com); mailboxes without one are skipped. Needs the imapflow
// package (pinned in package.json, installed on the server by the deploy);
// tests inject a fake connection instead, so they never touch the network.
import { getJSON, setJSON, listIds, getMany } from "./store.js";
import { COMMS } from "../data/team-comms.js";
import { emailOwner } from "./email.js";

const HOST = () => process.env.IMAP_HOST || "mail.altradits.com";
const PORT = () => Number(process.env.IMAP_PORT) || 993;

// Bounce notices are only trusted from the mail daemons of our own hosts and
// the relay: anyone can forge a "Mail delivery failed" subject, so anything
// from another sender is ignored. BOUNCE_DAEMON_HOSTS replaces this list.
const DAEMON_LOCALS = ["mailer-daemon", "postmaster"];
const daemonHosts = () => [...new Set(String(process.env.BOUNCE_DAEMON_HOSTS || "mail.altradits.com,host-ww.net,relay.mailchannels.net").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
const isDaemon = (addr) => {
  const [local, domain] = String(addr || "").trim().toLowerCase().split("@");
  return DAEMON_LOCALS.includes(local) && Boolean(domain) && daemonHosts().some((h) => domain === h || domain.endsWith(`.${h}`));
};
const headerAddr = (raw, name) => {
  const m = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  if (!m) return "";
  return (m[1].match(/<([^<>\s]+)>/)?.[1] || m[1].trim().split(/\s+/).pop() || "").replace(/^<|>$/g, "").trim();
};

export function mailboxes() {
  const seen = new Set();
  return COMMS.filter((c) => c.address && !seen.has(c.address) && seen.add(c.address)).map((c) => {
    const local = c.address.split("@")[0];
    return { id: local, address: c.address, env: `MAIL_${local.toUpperCase()}` };
  });
}
const password = (b) => process.env[b.env] || "";

let connect = async (b) => {
  const { ImapFlow } = await import("imapflow");
  return new ImapFlow({ host: HOST(), port: PORT(), secure: true, auth: { user: b.address, pass: password(b) }, logger: false, socketTimeout: 20000 });
};
export function setImapFactory(f) { connect = f; } // tests

async function withBox(b, fn) {
  const client = await connect(b);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try { return await fn(client); } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}

// Delivery failures ("Mail delivery failed…") from the last few days, in every
// connected mailbox: who it was for, the original subject and the reason.
// Read-only: viewing never marks anything read or moves anything.
const BOUNCE_SUBJECT = /^(Mail delivery failed|Undeliver(ed|able)|Delivery Status Notification \(Failure\)|Returned mail|Delivery (has )?failed)/i;
export async function findBounces({ days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400e3);
  const found = [];
  for (const b of mailboxes().filter(password)) {
    try {
      await withBox(b, async (c) => {
        const uids = await c.search({ since }, { uid: true });
        if (!uids?.length) return;
        const hits = [];
        for await (const m of c.fetch(uids.slice(-200).join(","), { uid: true, envelope: true }, { uid: true })) {
          if (BOUNCE_SUBJECT.test(m.envelope?.subject || "")) hits.push({ uid: m.uid, date: m.envelope.date || new Date() });
        }
        for (const h of hits) {
          const msg = await c.fetchOne(String(h.uid), { source: true }, { uid: true });
          const raw = msg?.source?.toString("utf8") || "";
          const recipient = (raw.match(/^Final-Recipient:\s*rfc822;\s*(\S+)/im) || raw.match(/^X-Failed-Recipients:\s*(\S+)/im) || [])[1];
          if (!recipient) continue;
          const subject = [...raw.matchAll(/^Subject:\s*(.+)$/gim)].map((s) => s[1].trim()).find((s) => !BOUNCE_SUBJECT.test(s)) || "";
          const reason = ((raw.match(/^Diagnostic-Code:\s*(?:smtp;\s*)?(.+)$/im) || [])[1] || "rejected by the receiving server").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 160);
          const messageIds = [...new Set([...raw.matchAll(/^Message-ID:\s*(<[^<>\s]+>)/gim)].map((m) => m[1]))];
          found.push({ key: `${b.id}:${h.uid}`, mailbox: b.address, date: new Date(h.date).toISOString(), recipient: recipient.toLowerCase().replace(/[<>]/g, ""), subject, reason,
            from: headerAddr(raw, "From"), returnPath: headerAddr(raw, "Return-Path"), messageIds });
        }
      });
    } catch (err) { console.error(`bounces: ${b.address} unread (${String(err.message || err).slice(0, 120)})`); } // the address only, never the password
  }
  return found;
}

const SENT = /^sent$/;

export async function checkBounces() {
  const notices = await findBounces();
  const seen = new Set((await getJSON("bounces:seen")) || []);
  const fresh = notices.filter((n) => !seen.has(n.key));
  if (!fresh.length) return { checked: notices.length, bounced: 0 };
  const emails = (await getMany("email", await listIds("emails", 1000))).filter(Boolean);
  const byMessageId = new Map(emails.filter((e) => SENT.test(e.status) && e.messageId).map((e) => [e.messageId, e]));
  const marked = [];
  for (const n of fresh) {
    seen.add(n.key);
    if (!isDaemon(n.from) && !isDaemon(n.returnPath)) continue; // forged from anyone else: ignored
    const at = Date.parse(n.date);
    const inWindow = (e) => Date.parse(e.at) <= at + 60e3 && at - Date.parse(e.at) < 3 * 86400e3;
    let e = null;
    if (n.messageIds.length) {
      // The returned original names our Message-ID: that row, to that address, or nothing.
      e = n.messageIds.map((id) => byMessageId.get(id)).find((x) => x && inWindow(x) && String(x.to).toLowerCase() === n.recipient) || null;
      if (!e) continue; // an unknown Message-ID proves nothing: ignored
    } else {
      // No Message-ID quoted: recipient and subject only, from the daemon.
      const candidates = emails.filter((x) => SENT.test(x.status) && String(x.to).toLowerCase() === n.recipient && inWindow(x));
      e = candidates.find((x) => x.subject === n.subject) || candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      if (!e) continue;
    }
    Object.assign(e, { status: `bounced: ${n.reason}`, bouncedAt: n.date });
    await setJSON(`email:${e.id}`, e);
    marked.push(e);
  }
  await setJSON("bounces:seen", [...seen].slice(-500));
  if (marked.length) {
    await emailOwner(`${marked.length} email${marked.length === 1 ? "" : "s"} bounced`,
      `These emails didn't reach the person. They're marked "bounced" in the admin email log.\n\n${marked.map((e) => `- ${e.subject} → ${e.to} (the receiving server said: "${e.status.replace(/^bounced: /, "")}")`).join("\n")}\n\nA mistyped address needs the person to try again. "Message blocked" means the mail relay judged the content as spam.`).catch(() => {});
  }
  return { checked: notices.length, bounced: marked.length };
}
