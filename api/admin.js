// Admin API for Stanley's dashboard. Every request needs
// Authorization: Bearer <ADMIN_TOKEN>.
import { json, readBody, clean, siteUrl, safeEqual } from "../lib/http.js";
import { listIds, getMany, getJSON, setJSON, usingRedis } from "../lib/store.js";
import {
  STAGES, getLead, saveLead, logEvent, getProposal, saveProposal, publishProposal,
  recomputeTotals, proposalUrl, publicLead, confirmPayment,
} from "../lib/crm.js";
import { lightningMode } from "../lib/lightning.js";
import { allMembers, allTasks, getMember, setMemberStatus, getTask, saveTask, assignTask, publicMember, notifyClient, OPEN } from "../lib/ops.js";
import { DEPARTMENTS } from "../data/playbooks.js";
import { kickQueue, workersLive, AGENT_ROSTER } from "../lib/workers.js";
import { getProfile, saveProfile, allJobs, addFromUrl, prepareJob, setJobStatus, htmlToText, jobsLive, getJob, hasCv, saveCvFile, removeCvFile, readCvFile } from "../lib/jobs.js";
import fs from "node:fs";
import { buildMasterCv, discoverJobs, updateSettings, careerLive } from "../lib/career.js";
import { getApplicant, saveApplicant, suggestApplicant, queueApply, cancelApply, startApply, applyFile, agentUpdate, think } from "../lib/apply.js";
import { sendEmail } from "../lib/email.js";
import { agentLive } from "../lib/agent.js";
import { marketingView, saveSettings as saveMarketing, createMaster, repurpose, cancelPost, editPost, postNow, marketingLive } from "../lib/marketing.js";
import { BUSINESS } from "../data/catalog.js";

// The dashboard gets the uploaded CV's details, not its full text.
function publicProfile(p) {
  if (!p.cvFile) return p;
  const { text, ...file } = p.cvFile;
  return { ...p, cvFile: { ...file, textChars: (text || "").length } };
}

function authorized(request) {
  const token = process.env.ADMIN_TOKEN;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(token) && safeEqual(token, given);
}

const deny = () => json({ error: process.env.ADMIN_TOKEN ? "Wrong admin token." : "Set ADMIN_TOKEN in your environment first." }, 401);

export async function GET(request) {
  if (!authorized(request)) return deny();
  const u = new URL(request.url);

  if (u.searchParams.get("view") === "jobs") {
    const jobs = (await allJobs()).map(({ pageText, ...j }) => ({
      ...j, followUp: j.status === "applied" && Date.now() - Date.parse(j.appliedAt || j.updatedAt) > 7 * 864e5,
    }));
    return json({ profile: publicProfile(await getProfile()), jobs, aiReady: jobsLive(), applicant: await getApplicant() });
  }

  if (u.searchParams.get("view") === "cvfile") {
    const p = await getProfile();
    const buf = readCvFile(p);
    if (!buf) return json({ error: "No CV uploaded." }, 404);
    const types = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown" };
    return new Response(buf, { headers: { "Content-Type": types[p.cvFile.ext], "Content-Disposition": `attachment; filename="${p.cvFile.name.replace(/"/g, "")}"`, "Cache-Control": "no-store" } });
  }

  if (u.searchParams.get("view") === "marketing") return json(await marketingView());

  if (u.searchParams.get("view") === "ops") {
    const [members, tasks] = await Promise.all([allMembers(), allTasks()]);
    const load = (id) => tasks.filter((t) => t.assigneeId === id && OPEN.includes(t.status)).reduce((s, t) => s + t.estimateHours, 0);
    return json({
      members: members.map((m) => ({ ...publicMember(m), sample: m.sample, openHours: load(m.id) })),
      tasks: tasks.map((t) => ({ ...t, assignee: members.find((m) => m.id === t.assigneeId)?.name || null })),
      departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.name, agent: d.agent.name,
        approved: members.filter((m) => m.status === "approved" && m.departments.includes(d.id)).length })),
      pipeline: Object.fromEntries(["queued", "working", "waiting_client", "owner", "review", "follow_up", "done"].map((st) => [st, tasks.filter((t) => t.status === st).length])),
      satisfaction: (() => { const r = tasks.filter((t) => t.satisfaction).map((t) => t.satisfaction.rating); return r.length ? { avg: Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10, count: r.length } : null; })(),
      agents: AGENT_ROSTER, workersLive: workersLive(),
    });
  }

  if (u.searchParams.get("view") === "lead") {
    const lead = await getLead(clean(u.searchParams.get("id"), 40));
    if (!lead) return json({ error: "Not found" }, 404);
    const proposal = lead.proposalId ? await getProposal(lead.proposalId) : null;
    return json({
      lead: { ...publicLead(lead), notes: lead.notes, events: lead.events, context: lead.context },
      proposal: proposal && { ...proposal, url: proposalUrl(siteUrl(request), proposal) },
    });
  }

  const [leads, approvals, proposals, emails] = await Promise.all([
    listIds("leads", 300).then((ids) => getMany("lead", ids)),
    listIds("approvals", 200).then((ids) => getMany("approval", ids)),
    listIds("proposals", 300).then((ids) => getMany("proposal", ids)),
    listIds("emails", 60).then((ids) => getMany("email", ids)),
  ]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paid = proposals.filter((p) => p.status === "paid");
  const open = proposals.filter((p) => ["sent", "accepted", "paid_claimed"].includes(p.status));
  const stats = {
    leads: leads.length,
    leads7d: leads.filter((l) => Date.now() - Date.parse(l.createdAt) < 7 * 864e5).length,
    qualified: leads.filter((l) => STAGES.indexOf(l.stage) >= STAGES.indexOf("qualified") && l.stage !== "lost").length,
    proposalsOpen: open.length,
    pipelineUsd: open.reduce((t, p) => t + p.totals.monthly + p.totals.oneOff, 0),
    wonMonthUsd: paid.filter((p) => Date.parse(p.payment?.confirmedAt || p.updatedAt) >= monthStart).reduce((t, p) => t + p.totals.dueNow, 0),
    mrrUsd: paid.reduce((t, p) => t + p.totals.monthly, 0),
    activeClients: leads.filter((l) => l.stage === "active").length,
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
    byStage: Object.fromEntries(STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length])),
  };

  return json({
    stats,
    approvals: approvals.filter((a) => a.status === "pending").concat(approvals.filter((a) => a.status !== "pending").slice(0, 20)),
    leads: leads.map((l) => ({
      id: l.id, name: l.name, email: l.email, company: l.company, stage: l.stage, score: l.score,
      needs: l.needs, source: l.source, createdAt: l.createdAt, updatedAt: l.updatedAt,
      refCode: l.refCode || null, referredBy: l.referredBy || null,
      lastMessage: l.transcript.at(-1)?.text?.slice(0, 140) || "",
    })),
    emails,
    system: {
      agents: agentLive ? "live (Claude)" : "scripted fallback: set ANTHROPIC_API_KEY",
      email: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.EMAIL_TRANSPORT === "sendmail" ? "server mail (sendmail)" : process.env.RESEND_API_KEY ? "Resend" : "log only: set EMAIL_TRANSPORT=sendmail",
      storage: usingRedis ? "Redis" : `file store (${process.env.DATA_DIR || ".data"})`,
      ownerEmail: process.env.OWNER_EMAIL || BUSINESS.email,
      lightning: lightningMode() === "lnd" ? "LND node (QR invoices, auto-confirmed)" : "Lightning address (QR invoices, you confirm payment)",
    },
  });
}

async function resolveApproval(request, body) {
  const a = await getJSON(`approval:${clean(body.id, 40)}`);
  if (!a) return json({ error: "Approval not found" }, 404);
  if (a.status !== "pending") return json({ error: "Already resolved" }, 409);
  const approve = body.decision === "approve";
  const note = clean(body.note, 3000);
  const lead = a.leadId ? await getLead(a.leadId) : null;
  const base = siteUrl(request);

  if (a.type === "proposal_review") {
    const p = await getProposal(a.payload.proposalId);
    if (approve && p && lead) {
      if (body.edits?.summary) p.summary = clean(body.edits.summary, 3000);
      if (Array.isArray(body.edits?.prices)) {
        body.edits.prices.forEach((price, i) => { if (p.items[i] && Number(price) > 0) p.items[i].price = Math.round(Number(price)); });
      }
      recomputeTotals(p);
      await publishProposal(base, lead, p);
    } else if (p && lead) {
      p.status = "declined";
      await saveProposal(p);
      await sendEmail({ to: lead.email, leadId: lead.id, subject: "About your proposal",
        text: note || `Hi ${lead.name || "there"}, thanks for your patience. ${BUSINESS.owner} would like to talk this through before sending a proposal. Just reply with a good time.` });
    }
  } else if (a.type === "payment_check") {
    const p = await getProposal(a.payload.proposalId);
    if (p && lead) {
      if (approve) {
        await confirmPayment(lead, p, note);
      } else {
        p.status = "accepted";
        logEvent(lead, "Payment not found yet.");
        await sendEmail({ to: lead.email, leadId: lead.id, subject: "We couldn't find your payment yet",
          text: note || `Hi ${lead.name || "there"}, we haven't received the payment yet. Could you reply with the transaction reference or a screenshot? Sometimes it just takes a little longer.` });
      }
      await saveProposal(p);
      await saveLead(lead);
    }
  } else if (lead && note) {
    // trial_task, call_request, escalation: the note goes to the client.
    await sendEmail({ to: lead.email, leadId: lead.id, subject: a.type === "trial_task" ? "Your free task is done" : "A note from Stanley", text: note });
  }

  if (lead) { logEvent(lead, `${a.type} ${approve ? "approved" : "declined"} by Stanley.`); await saveLead(lead); }
  a.status = approve ? "approved" : "declined";
  a.resolvedAt = new Date().toISOString();
  a.note = note;
  await setJSON(`approval:${a.id}`, a);
  return json({ ok: true, approval: a });
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  const body = await readBody(request);

  if (body.action === "approval") return resolveApproval(request, body);

  if (body.action?.startsWith("mkt_")) {
    try {
      if (body.action === "mkt_pause") return json({ settings: await saveMarketing({ paused: Boolean(body.paused) }) });
      if (body.action === "mkt_warmmail") return json({ settings: await saveMarketing({ warmupEmails: Boolean(body.on) }) });
      if (body.action === "mkt_autoreply") return json({ settings: await saveMarketing({ autoReply: Boolean(body.on) }) });
      if (body.action === "mkt_cancel") return json({ post: await cancelPost(clean(body.id, 20)) });
      if (body.action === "mkt_post_now") return json({ post: await postNow(clean(body.id, 20)) });
      if (body.action === "mkt_shout_remove") { const { removeShoutout } = await import("../lib/hunt.js"); await removeShoutout(clean(body.id, 20)); return json({ ok: true }); }
      if (body.action === "mkt_edit") return json({ post: await editPost(clean(body.id, 20), body.text) });
      // These take a minute or two: start them and let the dashboard refresh.
      if (["mkt_master", "mkt_repurpose"].includes(body.action)) {
        if (!marketingLive()) return json({ error: "Set ANTHROPIC_API_KEY to switch the marketing team on." }, 400);
        const job = body.action === "mkt_master"
          ? createMaster({ brief: clean(body.brief, 1500) })
          : repurpose(clean(body.id, 20), { start: /^\d{4}-\d\d-\d\d$/.test(body.start || "") ? body.start : undefined, days: Number(body.days) || 1 });
        job.catch(async (e) => { console.error("marketing", e.message); await setJSON("mkt:lastError", { at: new Date().toISOString(), error: e.message }); });
        return json({ started: true });
      }
    } catch (err) { return json({ error: err.message }, 400); }
    return json({ error: "Unknown marketing action" }, 400);
  }

  if (body.action?.startsWith("job_")) {
    try {
      if (body.action === "job_profile") return json({ profile: publicProfile(await saveProfile(body)) });
      if (body.action === "job_applicant") return json({ applicant: await saveApplicant(body) });
      if (body.action === "job_apply") return json({ job: await queueApply(clean(body.id, 40)) });
      if (body.action === "job_apply_cancel") return json({ job: await cancelApply(clean(body.id, 40)) });
      if (body.action === "job_applicant_suggest") return json({ applicant: await suggestApplicant() });
      // Called by the Altradits Apply extension in Stanley's Chrome.
      if (body.action === "job_agent_start") return json(await startApply(body.id));
      if (body.action === "job_agent_think") return json(await think(body.id, body.messages));
      if (body.action === "job_agent_file") {
        const f = await applyFile(body.id, body.file);
        return json({ name: f.name, type: f.type, data: f.data.toString("base64") });
      }
      if (body.action === "job_agent_update") return json({ job: await agentUpdate(body) });
      if (body.action === "job_settings") return json({ profile: publicProfile(await updateSettings(body)) });
      if (body.action === "job_master_build" || body.action === "job_discover") {
        if (!careerLive()) return json({ error: "Add ANTHROPIC_API_KEY to use the Career Agent." }, 400);
        const p = await getProfile();
        if (body.action === "job_master_build") {
          if (!hasCv(p)) return json({ error: "Upload your CV or add your profile first." }, 400);
          if (p.masterBuilding && Date.now() - Date.parse(p.masterBuilding.since) < 10 * 60e3) return json({ started: false, error: "Already building." }, 409);
          buildMasterCv().catch((err) => console.error("master cv", err.message));
        } else {
          if (!hasCv(p) && !p.targets) return json({ error: "Upload your CV and set target roles first." }, 400);
          if (p.discovery?.running && Date.now() - Date.parse(p.discovery.startedAt) < 15 * 60e3) return json({ started: false, error: "Already searching." }, 409);
          discoverJobs().catch((err) => console.error("discover", err.message));
        }
        return json({ started: true }, 202);
      }
      if (body.action === "job_cv_upload") return json({ profile: publicProfile(await saveCvFile(body)) });
      if (body.action === "job_cv_remove") return json({ profile: publicProfile(await removeCvFile()) });
      if (body.action === "job_import_readme") {
        // Start the profile from the public GitHub profile README in this repo.
        const md = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
        const text = htmlToText(md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<img[^>]*>/gi, "")).replace(/[*_`#|]+/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        const p = await getProfile();
        return json({ profile: publicProfile(await saveProfile({ ...p, cv: p.cv ? `${p.cv}\n\n${text}` : text })) });
      }
      if (body.action === "job_add") return json(await addFromUrl(body.url));
      if (body.action === "job_prepare") {
        const id = clean(body.id, 40);
        if (!jobsLive()) return json({ error: "Add ANTHROPIC_API_KEY to use the Career Agent." }, 400);
        if (!hasCv(await getProfile())) return json({ error: "Upload your CV or add your profile first (My profile, above)." }, 400);
        if (!(await getJob(id))) return json({ error: "Job not found" }, 404);
        // Runs in the background (can take a minute); the dashboard polls.
        prepareJob(id).catch((err) => console.error("job prepare", err.message));
        return json({ started: true }, 202);
      }
      if (body.action === "job_status") return json({ job: await setJobStatus(clean(body.id, 40), body.status, body.note) });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    return json({ error: "Unknown job action" }, 400);
  }

  if (body.action === "member_status") {
    const m = await getMember(clean(body.id, 40));
    if (!m) return json({ error: "Member not found" }, 404);
    try { await setMemberStatus(m, body.status); } catch (err) { return json({ error: err.message }, 400); }
    return json({ ok: true });
  }
  if (["task_send_client", "task_rerun", "task_close"].includes(body.action)) {
    const t = await getTask(clean(body.id, 40));
    if (!t) return json({ error: "Task not found" }, 404);
    const at = new Date().toISOString();
    if (body.action === "task_send_client") {
      if (!t.deliverable) return json({ error: "No deliverable to send." }, 409);
      t.status = "review";
      t.reviewAt = at;
      t.history.push({ at, by: "Stanley", text: "Checked and sent to client" });
      await saveTask(t);
      await notifyClient(t, `Ready for your review: ${t.title}`, `${t.deliverable.summary || "Your task is done."}\n\nOpen your portal to download it, then approve and rate it, or ask for changes.`);
    } else if (body.action === "task_rerun") {
      const note = clean(body.note, 1000);
      t.status = "queued";
      t.attempts = 0;
      t.history.push({ at, by: "Stanley", text: note ? `Changes requested: ${note}` : "Re-run requested" });
      await saveTask(t);
      kickQueue();
    } else {
      t.status = "done";
      t.history.push({ at, by: "Stanley", text: `Follow-up closed${body.note ? `: ${clean(body.note, 500)}` : ""}` });
      await saveTask(t);
    }
    return json({ ok: true });
  }

  if (body.action === "task_submit") {
    const t = await getTask(clean(body.id, 40));
    if (!t || !["new", "in_progress", "changes", "assigned", "owner"].includes(t.status)) return json({ error: "Task is not open" }, 409);
    const url = clean(body.url, 500), note = clean(body.note, 2000);
    if (!/^https?:\/\//.test(url) && note.length < 10) return json({ error: "Add a deliverable link or a note." }, 400);
    t.deliverable = { url: /^https?:\/\//.test(url) ? url : "", note, at: new Date().toISOString() };
    t.hoursLogged = Math.max(0, Math.min(40, Number(body.hours) || 0));
    t.status = "review";
    t.history.push({ at: new Date().toISOString(), by: "Stanley", text: `Submitted for review (${t.hoursLogged}h)` });
    await saveTask(t);
    await notifyClient(t, `Ready for your review: ${t.title}`, `Your task "${t.title}" is done.\n\n${note}${t.deliverable.url ? `\n\nDeliverable: ${t.deliverable.url}` : ""}\n\nApprove it or ask for changes in your portal.`);
    return json({ ok: true });
  }
  if (body.action === "task_assign" || body.action === "task_cancel") {
    const t = await getTask(clean(body.id, 40));
    if (!t) return json({ error: "Task not found" }, 404);
    if (body.action === "task_cancel") {
      t.status = "cancelled";
      t.history.push({ at: new Date().toISOString(), by: "Stanley", text: "Cancelled" });
      await saveTask(t);
    } else if (body.memberId === "self") {
      t.assigneeId = null;
      t.status = "in_progress";
      t.history.push({ at: new Date().toISOString(), by: "Stanley", text: "Stanley is doing this one" });
      await saveTask(t);
    } else {
      await assignTask(t, body.memberId ? clean(body.memberId, 40) : undefined);
    }
    return json({ ok: true });
  }

  const lead = await getLead(clean(body.id, 40));
  if (!lead) return json({ error: "Lead not found" }, 404);

  if (body.action === "lead_update") {
    if (STAGES.includes(body.stage)) lead.stage = body.stage;
    if (typeof body.notes === "string") lead.notes = clean(body.notes, 5000);
    await saveLead(lead);
    return json({ ok: true });
  }
  if (body.action === "email_client") {
    if (!lead.email) return json({ error: "This lead has no email." }, 400);
    const sent = await sendEmail({ to: lead.email, leadId: lead.id, subject: clean(body.subject, 200) || "A note from Altradits", text: clean(body.text, 8000) });
    logEvent(lead, `Stanley emailed: ${sent.subject}`);
    await saveLead(lead);
    return json({ ok: true, status: sent.status });
  }
  return json({ error: "Unknown action" }, 400);
}
