// The follow-up agent, run once a day (by the app's own timer on HostAfrica,
// or by /api/cron on Vercel):
// - nudges clients with open proposals (day 2 and day 6) and unpaid acceptances
// - manages monthly retainer renewals (day 25 invoice, day 30 due, day 35 pause)
// - chases missing task briefs after 1 working day (Caroline Atieno, orders@)
// - reminds clients to review deliverables after 2 days and auto-completes after 14 days
// - sends 3-day post-handover care check-ins (Rebecca Tadesse, care@) and retainer upsells
// - follows up delegation-quiz leads without proposals (day 2 and day 5)
// - sends Stanley ONE digest, and only if approvals have waited over 20 hours
import { listIds, getMany } from "./store.js";
import { getLead, saveLead, getProposal, saveProposal, priceProposal, proposalUrl, TYPE_LABELS } from "./crm.js";
import { sendEmail, emailOwner } from "./email.js";
import { overdueDigest, allTasks, saveTask, ensurePortal, ensureReferral, hoursThisMonth } from "./ops.js";
import { PACKAGES } from "../data/catalog.js";

const DAY = 864e5;

export async function runFollowups(base, at = new Date()) {
  const nowMs = at.getTime();
  const nowIso = at.toISOString();
  const report = {
    nudges: 0,
    renewals: 0,
    intakeChases: 0,
    reviewReminders: 0,
    autoCompleted: 0,
    careCheckins: 0,
    upsells: 0,
    quizFollowups: 0,
    digest: false,
    overdueTasks: await overdueDigest(),
  };

  const proposals = await getMany("proposal", await listIds("proposals", 300));
  for (const p of proposals) {
    if (p.donation) continue; // donations are never chased
    const age = nowMs - Date.parse(p.status === "accepted" ? p.acceptedAt : p.createdAt);
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
      await sendEmail({ ...mail, to: lead.email, leadId: lead.id, dept: "growth", cta: { label: "Open proposal", url } });
      p.followups = (p.followups || 0) + 1;
      await saveProposal(p);
      report.nudges++;
    }
  }

  const leads = await getMany("lead", await listIds("leads", 500));
  const tasks = await allTasks(1000);

  // 1. Retainer Renewal & Rollover Lifecycle (Patrick Tefera, orders@)
  for (const lead of leads) {
    if (!lead?.retainer || lead.retainer.status !== "active" || !lead.email) continue;
    const endMs = Date.parse(lead.retainer.periodEnd);
    if (!Number.isFinite(endMs)) continue;
    const daysToEnd = (endMs - nowMs) / DAY;
    const clientTasks = tasks.filter((t) => t.leadId === lead.id);
    const used = hoursThisMonth(clientTasks, lead);
    const baseHours = lead.retainer.baseHours || 0;
    const rolloverPreview = Math.min(baseHours, Math.max(0, Math.round((baseHours - used) * 100) / 100));

    if (daysToEnd <= 5 && (lead.retainer.noticesSent || 0) === 0) {
      // Day 25: generate next month's renewal proposal and send 5-day notice
      const orig = lead.retainer.proposalId ? await getProposal(lead.retainer.proposalId) : null;
      const items = lead.retainer.items?.length
        ? lead.retainer.items.map((i) => ({
            package_id: PACKAGES.some((pk) => pk.id === i.ref) ? i.ref : undefined,
            service_id: !PACKAGES.some((pk) => pk.id === i.ref) ? i.ref : undefined,
            label: i.label,
            type: "monthly",
            price_usd: i.price,
            quantity: i.quantity || 1,
            description: i.description,
          }))
        : [{ package_id: "lite", description: "Monthly retainer renewal" }];
      const { proposal: ren } = priceProposal(lead, {
        title: `Renewal: ${orig?.title || "Monthly Retainer"}`,
        executive_summary: `Renewal for your upcoming 30-day cycle (${baseHours} base hours${rolloverPreview > 0 ? ` + up to ${rolloverPreview} rollover hours from this month` : ""}).`,
        items,
      });
      ren.status = "accepted";
      ren.acceptedAt = nowIso;
      ren.acceptedBy = "Retainer renewal";
      ren.renewalOf = orig?.id || lead.proposalId;
      if (lead.referralCredit > 0 && ren.totals.dueNow > 1) {
        const credit = Math.min(lead.referralCredit, ren.totals.dueNow - 1);
        ren.creditAppliedUsd = credit;
        ren.totals.dueNow = Math.round((ren.totals.dueNow - credit) * 100) / 100;
      }
      await saveProposal(ren);
      lead.retainer.renewalProposalId = ren.id;
      lead.retainer.noticesSent = 1;
      await saveLead(lead);
      await sendEmail({
        to: lead.email,
        leadId: lead.id,
        dept: "orders",
        subject: `Your monthly retainer renews in 5 days: ${ren.title}`,
        text: `Hi ${lead.name || "there"},\n\nYour current 30-day cycle wraps up on ${lead.retainer.periodEnd.slice(0, 10)}. You've used ${used} of your ${(lead.retainer.baseHours || 0) + (lead.retainer.rolloverHours || 0)} hours so far${rolloverPreview > 0 ? `, so ${rolloverPreview} unused hour(s) will roll over into next month` : ""}.${ren.creditAppliedUsd ? `\n\nWe also applied $${ren.creditAppliedUsd} of your referral credit to this invoice.` : ""}\n\nYour renewal invoice ($${ren.totals.dueNow}) is ready whenever you'd like to settle it for uninterrupted service.`,
        cta: { label: "Renew your retainer", url: proposalUrl(base, ren) },
      });
      report.renewals++;
    } else if (daysToEnd <= 0 && lead.retainer.noticesSent === 1) {
      // Day 30: due today reminder
      const ren = lead.retainer.renewalProposalId ? await getProposal(lead.retainer.renewalProposalId) : null;
      lead.retainer.noticesSent = 2;
      await saveLead(lead);
      if (ren && ren.status !== "paid") {
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "orders",
          subject: `Retainer renewal due today: ${ren.title}`,
          text: `Hi ${lead.name || "there"},\n\nYour monthly retainer is due for renewal today ($${ren.totals.dueNow}). Pay via the link below to keep your task queue active and carry over ${rolloverPreview} unused hour(s).`,
          cta: { label: "Pay renewal invoice", url: proposalUrl(base, ren) },
        });
        report.renewals++;
      }
    } else if (daysToEnd <= -5 && lead.retainer.noticesSent === 2) {
      // Day 35: 5 days past due -> pause month-to-month cleanly
      const ren = lead.retainer.renewalProposalId ? await getProposal(lead.retainer.renewalProposalId) : null;
      if (!ren || ren.status !== "paid") {
        lead.retainer.status = "paused";
        lead.retainer.pausedAt = nowIso;
        lead.retainer.noticesSent = 3;
        await saveLead(lead);
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "orders",
          subject: "Your Altradits retainer is paused for now",
          text: `Hi ${lead.name || "there"},\n\nSince we haven't received this month's renewal payment, we've paused your month-to-month retainer so no further invoices accumulate. Whenever you're ready to restart, you can use your renewal link below or message us anytime.`,
          cta: ren ? { label: "Restart retainer", url: proposalUrl(base, ren) } : { label: "Open portal", url: ensurePortal(lead) },
        });
        report.renewals++;
      }
    }
  }

  // 2. Task Lifecycle: 1-day missing-input chase, 2-day review reminder, 14-day auto-complete, 3-day care check-in
  for (const t of tasks) {
    const lead = t.leadId ? leads.find((l) => l.id === t.leadId) || (await getLead(t.leadId)) : null;
    if (!lead) continue;

    // 2a. Caroline Atieno's 1-day missing-input chase (waiting_client or empty order brief)
    const waitingBrief = t.status === "waiting_client" || (["queued", "owner", "new"].includes(t.status) && t.details === "Details to follow from the client.");
    const waitStamp = t.waitingSince || t.createdAt || t.updatedAt;
    if (waitingBrief && !t.intakeChasedAt && nowMs - Date.parse(waitStamp) > 1 * DAY) {
      t.intakeChasedAt = nowIso;
      await saveTask(t);
      if (lead.email) {
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "orders",
          subject: `Waiting on one detail to start: ${t.title}`,
          text: `Hi ${lead.name || "there"},\n\nWe're ready to work on "${t.title}" as soon as we have your brief${t.question ? `:\n\n"${t.question}"` : "."}\n\nSend the details in your portal and our team will get right on it.`,
          cta: { label: "Send details in portal", url: ensurePortal(lead) },
        });
        report.intakeChases++;
      }
    }

    // 2b. Review reminder (2 days) & Auto-complete (14 days)
    if (t.status === "review") {
      const reviewAge = nowMs - Date.parse(t.reviewAt || t.deliverable?.at || t.updatedAt || t.createdAt);
      if (reviewAge > 14 * DAY) {
        t.status = "done";
        t.closedAt = nowIso;
        t.history.push({ at: nowIso, by: "ops", text: "Auto-completed after 14 days in client review" });
        await saveTask(t);
        report.autoCompleted++;
      } else if (reviewAge > 2 * DAY && !t.reviewRemindedAt && lead.email) {
        t.reviewRemindedAt = nowIso;
        await saveTask(t);
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: t.department || "orders",
          subject: `Ready for your review: ${t.title}`,
          text: `Hi ${lead.name || "there"},\n\nJust a quick reminder that "${t.title}" is waiting in your portal. Take a look when you have a moment — you can approve and rate it, or request any adjustments within your 14-day fix window.`,
          cta: { label: "Review deliverable", url: ensurePortal(lead) },
        });
        report.reviewReminders++;
      }
    }

    // 2c. Rebecca Tadesse's (care@) 3-day post-handover check-in on satisfied completed tasks
    if (t.status === "done" && !t.careCheckinAt && (!t.satisfaction || t.satisfaction.rating >= 4)) {
      const doneAge = nowMs - Date.parse(t.closedAt || t.updatedAt || t.createdAt);
      if (doneAge > 3 * DAY && lead.email) {
        t.careCheckinAt = nowIso;
        await saveTask(t);
        const refUrl = ensureReferral(lead);
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "care",
          subject: `Checking in on "${t.title}"`,
          text: `Hi ${lead.name || "there"},\n\nI'm checking in to make sure "${t.title}" is working smoothly for you in practice. Remember you have a 14-day free fix window if anything in the original scope needs a tweak.\n\nIf you know another founder or operator who'd love their hours back, share your referral link (${refUrl}) — you'll earn 10% credit on their first payment.`,
          cta: { label: "Open your portal", url: ensurePortal(lead) },
        });
        report.careCheckins++;
      }
    }
  }

  // 3. Repeat One-Off -> Monthly Retainer Upsell & Delegation Quiz Follow-Ups
  for (const lead of leads) {
    if (!lead?.email) continue;
    // 3a. Delegation-quiz leads without a proposal: Day 2 and Day 5 follow-ups
    if (lead.source === "delegation-quiz" && !lead.proposalId && !["paid", "active", "lost"].includes(lead.stage)) {
      const age = nowMs - Date.parse(lead.createdAt);
      const step = lead.quizFollowups || 0;
      const hrs = lead.context?.quiz?.hours || lead.hoursPerWeek || 8;
      if (step === 0 && age > 2 * DAY) {
        lead.quizFollowups = 1;
        await saveLead(lead);
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "growth",
          subject: `Getting your ${hrs} hours/week back`,
          text: `Hi ${lead.name || "there"},\n\nIn the delegation quiz you mentioned spending around ${hrs} hours a week on tasks our team handles every day. Want to test us on a single $5 starter task or get a tailored monthly plan? Reply with the #1 task on your plate and we'll take it from there.`,
          cta: { label: "Try a $5 starter task", url: `${base}/va#quick` },
        });
        report.quizFollowups++;
      } else if (step === 1 && age > 5 * DAY) {
        lead.quizFollowups = 2;
        await saveLead(lead);
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "growth",
          subject: "Your first 1-hour task is free",
          text: `Hi ${lead.name || "there"},\n\nIf you'd like to see how we work before committing to a plan, send us one real task (up to an hour of work) and we'll deliver it free, or start with our Starter Retainer ($249/month for 12 hours).`,
          cta: { label: "See plans & quick jobs", url: `${base}/va` },
        });
        report.quizFollowups++;
      }
    }

    // 3b. Retainer upsell for satisfied one-off clients
    if (lead.stage === "active" && !lead.retainer && !lead.upsellSentAt) {
      const paidOrders = proposals.filter((p) => p.status === "paid" && !p.donation && (p.leadId === lead.id || (p.client?.email && p.client.email.toLowerCase() === lead.email.toLowerCase())) && !(p.totals?.monthly > 0));
      const fiveStarDone = tasks.some((t) => t.leadId === lead.id && t.status === "done" && t.satisfaction?.rating === 5 && nowMs - Date.parse(t.closedAt || t.updatedAt) > 3 * DAY);
      if (paidOrders.length >= 2 || fiveStarDone) {
        lead.upsellSentAt = nowIso;
        await saveLead(lead);
        const starter = PACKAGES.find((pk) => pk.id === "lite") || PACKAGES[0] || { name: "Lite", price: 349, hours: 15 };
        await sendEmail({
          to: lead.email,
          leadId: lead.id,
          dept: "growth",
          subject: "Want your own dedicated monthly hours?",
          text: `Hi ${lead.name || "there"},\n\nIt's been great delivering your recent work. Whenever you have ongoing tasks across social, admin, research, or tech, our ${starter.name} Retainer ($${starter.price}/month for ${starter.hours} hours, with 1-month unused hour rollover) gives you priority turnaround and direct portal task requests anytime.`,
          cta: { label: "Explore monthly plans", url: `${base}/va` },
        });
        report.upsells++;
      }
    }
  }

  const approvals = await getMany("approval", await listIds("approvals", 200));
  const stale = approvals.filter((a) => a.status === "pending" && nowMs - Date.parse(a.createdAt) > 20 * 3600e3);
  if (stale.length) {
    await emailOwner(
      `${stale.length} item${stale.length > 1 ? "s" : ""} still waiting for you`,
      stale.map((a) => `- ${TYPE_LABELS[a.type] || a.type}: ${a.summary.split("\n")[0]}`).join("\n"),
      { label: "Open dashboard", url: `${base}/admin` },
    );
    report.digest = true;
  }
  return report;
}
