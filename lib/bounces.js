// Bounced emails. The mail relay accepts a message and only later sends a
// "Mail delivery failed" notice back to the sending mailbox, so the admin log
// would keep saying "sent". Once an hour this reads those notices (read-only),
// marks the matching email "bounced: <reason>" and tells Stanley once.
import { getJSON, setJSON, listIds, getMany } from "./store.js";
import { findBounces } from "./inbox.js";
import { emailOwner } from "./email.js";

const SENT = /^(approved: )?sent$/;

export async function checkBounces() {
  const notices = await findBounces();
  const seen = new Set((await getJSON("bounces:seen")) || []);
  const fresh = notices.filter((n) => !seen.has(n.key));
  if (!fresh.length) return { checked: notices.length, bounced: 0 };
  const emails = (await getMany("email", await listIds("emails", 1000))).filter(Boolean);
  const marked = [];
  for (const n of fresh) {
    seen.add(n.key);
    const at = Date.parse(n.date);
    // Sent to that address in the 3 days before the notice; the same subject wins.
    const candidates = emails.filter((e) => SENT.test(e.status) && String(e.to).toLowerCase() === n.recipient
      && Date.parse(e.at) <= at + 60e3 && at - Date.parse(e.at) < 3 * 86400e3);
    const e = candidates.find((x) => x.subject === n.subject) || candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (!e) continue;
    Object.assign(e, { status: `bounced: ${n.reason}`, bouncedAt: n.date });
    await setJSON(`email:${e.id}`, e);
    marked.push(e);
  }
  await setJSON("bounces:seen", [...seen].slice(-500));
  if (marked.length) {
    await emailOwner(`${marked.length} email${marked.length === 1 ? "" : "s"} bounced`,
      `These emails didn't reach the person. They're marked "bounced" in the admin email log.\n\n${marked.map((e) => `- ${e.subject} → ${e.to}: ${e.status.replace(/^bounced: /, "")}`).join("\n")}\n\nA mistyped address needs the person to try again. "Message blocked" means the mail relay judged the content as spam.`).catch(() => {});
  }
  return { checked: notices.length, bounced: marked.length };
}
