// The follow-up agent, run once a day (by the app's own timer on HostAfrica,
// or by /api/cron on Vercel):
// - nudges clients with open proposals (day 2 and day 6) and unpaid acceptances
// - sends Stanley ONE digest, and only if approvals have waited over 20 hours
import { listIds, getMany } from "./store.js";
import { getLead, saveProposal, proposalUrl, TYPE_LABELS } from "./crm.js";
import { sendEmail, emailOwner } from "./email.js";

const DAY = 864e5;

export async function runFollowups(base) {
  const report = { nudges: 0, digest: false };

  const proposals = await getMany("proposal", await listIds("proposals", 300));
  for (const p of proposals) {
    const age = Date.now() - Date.parse(p.status === "accepted" ? p.acceptedAt : p.createdAt);
    const lead = await getLead(p.leadId);
    if (!lead?.email) continue;
    const url = proposalUrl(base, p);
    let mail = null;
    if (p.status === "sent" && p.followups === 0 && age > 2 * DAY) {
      mail = { subject: "Any questions about your proposal?", text: `Hi ${lead.name || "there"},\n\nJust checking in on "${p.title}". If something doesn't fit, scope, budget or timing, reply and we'll adjust it. Prefer to start smaller? Your first task is free.` };
    } else if (p.status === "sent" && p.followups === 1 && age > 6 * DAY) {
      mail = { subject: "Should I close your proposal?", text: `Hi ${lead.name || "there"},\n\nI haven't heard back, so I'll assume now isn't the right time and close this proposal at the end of the week. If you still want those hours back, one click below keeps it open.` };
    } else if (p.status === "accepted" && p.followups < 2 && age > 2 * DAY) {
      mail = { subject: "Ready to kick off?", text: `Hi ${lead.name || "there"},\n\nYou accepted "${p.title}". Kick-off is waiting on payment of $${p.totals.dueNow}. Any method on the proposal page works.` };
    }
    if (mail) {
      await sendEmail({ ...mail, to: lead.email, leadId: lead.id, cta: { label: "Open proposal", url } });
      p.followups = (p.followups || 0) + 1;
      await saveProposal(p);
      report.nudges++;
    }
  }

  const approvals = await getMany("approval", await listIds("approvals", 200));
  const stale = approvals.filter((a) => a.status === "pending" && Date.now() - Date.parse(a.createdAt) > 20 * 3600e3);
  if (stale.length) {
    await emailOwner(
      `${stale.length} item${stale.length > 1 ? "s" : ""} still waiting for you`,
      stale.map((a) => `- ${TYPE_LABELS[a.type] || a.type}: ${a.summary.split("\n")[0]}`).join("\n"),
      { label: "Open dashboard", url: `${base}/admin.html` },
    );
    report.digest = true;
  }
  return report;
}
