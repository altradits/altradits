// The admin page's script (moved out of the HTML so the page's Content
// Security Policy can allow only our own script files).
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Not shown inside a frame."); } // no clickjacking
import { SERVICES } from "/data/catalog.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// The admin is in sats only. Amounts priced in dollars (what clients see) are
// converted at the current BTC rate and marked ≈; payments use the sats received.
const sats = (n) => `${Math.round(Number(n) || 0).toLocaleString("en-US")} sats`;
// A receipt number opens that receipt (the pop-up at the end of this file).
const rcpt = (no) => no ? `<button type="button" class="rcpt" data-receipt="${esc(no)}" title="Open receipt ${esc(no)}">${esc(no)}</button>` : "";
// Dollar amounts inside agent-written summaries, shown in sats.
const satsText = (s) => String(s ?? "").replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (m, n) => money(n.replace(/,/g, "")));
const money = (usd) => (D?.btcUsd ? `≈ ${sats(((Number(usd) || 0) / D.btcUsd) * 1e8)}` : "– sats");
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const STAGES = ["new", "engaged", "qualified", "pending_approval", "proposal_sent", "won", "paid", "active", "lost"];
const LABELS = { proposal_review: "Proposal needs your OK", payment_check: "Confirm payment & kick off", trial_task: "Free trial task", escalation: "Client needs you", call_request: "Call requested" };
const svcName = (id) => SERVICES.find((s) => s.id === id)?.name || id;
let token = "";
try { token = sessionStorage.getItem("altra.admin") || ""; } catch {}
let D = null;

// Feedback for every click: the button that started a request spins while it
// runs, then flashes green (done) or red (failed), and a short message says so.
let lastBtn = null, lastAt = 0, toastTimer;
document.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.getAttribute("role") !== "tab") { lastBtn = b; lastAt = Date.now(); } }, true);
function toast(text, fail = false, ms = 2600) {
  let el = $("#toast");
  if (!el) { el = Object.assign(document.createElement("div"), { id: "toast" }); el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.append(el); }
  el.textContent = text; el.className = fail ? "fail" : ""; el.hidden = false;
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function settle(btn, ok) {
  if (!btn) return;
  btn.classList.remove("busy"); btn.removeAttribute("aria-busy");
  btn.classList.add(ok ? "didok" : "didfail"); setTimeout(() => btn.classList.remove("didok", "didfail"), 1500);
}
async function api(path, body) {
  const btn = Date.now() - lastAt < 800 ? lastBtn : null;
  lastBtn = null;
  if (btn) { btn.classList.add("busy"); btn.setAttribute("aria-busy", "true"); if (body) toast("Working on it…", false, 0); }
  try {
    const res = await fetch("/api/admin" + path, { method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: res.status === 413 ? "That file is too large (413)." : `Request failed (${res.status})` }));
    if (res.status === 401) { showLogin(data.error); throw new Error(data.error); }
    if (!res.ok) throw new Error(data.error || "Request failed");
    if (btn) { settle(btn, true); if (body) toast("Done ✓"); }
    return data;
  } catch (err) {
    const msg = err.message === "Failed to fetch" ? "No connection to the server. Check your internet and try again." : err.message;
    if (btn) settle(btn, false);
    if (btn || body) toast(`Failed: ${msg}`, true, 6000); // background loads fail quietly

    throw new Error(msg);
  }
}
function showLogin(msg) { $("#app").hidden = true; $("#login").hidden = false; $("#loginErr").textContent = msg || ""; $("#tok").focus(); }
$("#login").addEventListener("submit", (e) => {
  e.preventDefault(); token = $("#tok").value.trim();
  try { sessionStorage.setItem("altra.admin", token); } catch {}
  load();
});

function tab(name) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  if (["tasks", "team"].includes(name)) loadOps();
  if (name === "growth") renderGrowth();
  if (name === "finance") { loadFinance(); loadHeld(); loadPower(); loadChannels(); }
  if (name === "jobs") loadJobs();
  if (name === "marketing") loadMarketing();
  if (name === "stan") loadStan();
  if (name === "emails") loadInboxes();
  ["overview", "approvals", "leads", "tasks", "team", "finance", "growth", "marketing", "stan", "jobs", "emails"].forEach((t) => { $("#tab-" + t).hidden = t !== name; });
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
document.addEventListener("input", (e) => { if (e.target.matches("[data-price]")) { const s = e.target.parentElement.querySelector("[data-satsfor]"); if (s) s.textContent = money(e.target.value); } });
$("#eraseGo").addEventListener("click", async () => {
  try { const r = await api("", { action: "erase_person", email: $("#eraseEmail").value.trim(), confirm: $("#eraseConfirm").value.trim() }); $("#eraseMsg").textContent = `Erased ${r.erased} record${r.erased === 1 ? "" : "s"}${r.kept ? `; ${r.kept} payment record${r.kept === 1 ? "" : "s"} kept for the books` : ""}.`; $("#eraseConfirm").value = ""; }
  catch (err) { $("#eraseMsg").textContent = err.message; }
});
$("#logout").addEventListener("click", () => {
  try { sessionStorage.removeItem("altra.admin"); } catch {}
  token = ""; D = null;
  showLogin("Signed out on this device.");
});
function renderAi(ai) {
  const box = $("#aiPaused");
  if (!box) return;
  box.hidden = !ai?.paused;
  if (ai?.paused) $("#aiPausedWhy").textContent = ai.reason === "key"
    ? "— the Anthropic API key was rejected. Fix ANTHROPIC_API_KEY, then re-check."
    : `— the Anthropic credit ran out${ai.since ? ` (${ago(ai.since)})` : ""}. Top up at console.anthropic.com, then re-check.`;
}
$("#aiRecheck")?.addEventListener("click", async () => {
  try { const r = await api("", { action: "ai_recheck" }); renderAi(r.ai); toast("AI un-paused: the next AI step will try again."); }
  catch (err) { toast(err.message, true, 6000); }
});

$("#refresh").addEventListener("click", async (e) => {
  const b = e.currentTarget; lastBtn = null;
  b.classList.add("busy"); toast("Refreshing…", false, 0);
  try { await load(false); tab(document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || "overview"); settle(b, true); toast(`Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`); }
  catch (err) { settle(b, false); toast(`Refresh failed: ${err.message}`, true, 6000); }
});

function approvalHtml(a) {
  const pending = a.status === "pending";
  const lead = D.leads.find((l) => l.id === a.leadId);
  const isProposal = a.type === "proposal_review";
  const approveLabel = { proposal_review: "Approve & send to client", payment_check: "Payment received: kick off", trial_task: "Mark done (note goes to client)", escalation: "Mark handled", call_request: "Mark handled" }[a.type] || "Approve";
  const declineLabel = { proposal_review: "Don't send", payment_check: "Not received yet" }[a.type];
  return `<div class="ap ${pending ? "pending" : ""}" id="ap-${a.id}">
    <h3>${esc(LABELS[a.type] || a.type)} ${pending ? "" : `<span class="stage">${esc(a.status)}</span>`}</h3>
    <div class="meta">${lead ? `<a href="#lead=${lead.id}" data-lead="${lead.id}">${esc(lead.name || lead.email || "Lead")}</a> · ` : ""}${ago(a.createdAt)}</div>
    <pre>${esc(satsText(a.summary))}</pre>
    ${pending ? `
      ${isProposal ? `<div data-prices="${a.payload.proposalId}"><button class="btn" data-loadprop="${a.payload.proposalId}" data-ap="${a.id}">Review & edit prices</button></div>` : ""}
      <textarea placeholder="${a.type === "proposal_review" || a.type === "payment_check" ? "Optional note to the client" : "Note to the client (sent by email if filled in)"}" id="note-${a.id}"></textarea>
      <div class="row"><button class="btn ok" data-approve="${a.id}">${approveLabel}</button>
      ${declineLabel ? `<button class="btn" data-decline="${a.id}">${declineLabel}</button>` : ""}</div>` : a.note ? `<p class="muted">Note: ${esc(a.note)}</p>` : ""}
  </div>`;
}

// Page views (counted on our own server) next to the orders over the same 30 days.
function renderVisits(s) {
  const v = s.visits;
  if (!v) { $("#visits").innerHTML = `<p class="muted">No visit counts yet.</p>`; return; }
  const pages = Object.entries(v.byPage).sort((a, b) => b[1].d30 - a[1].d30);
  const max = Math.max(1, ...v.daily.map((d) => d.views));
  $("#visits").innerHTML = `<div class="kpis"><div class="kpi"><small>Views (7d)</small><div>${v.d7}</div></div><div class="kpi"><small>Views (30d)</small><div>${v.d30}</div></div>
    <div class="kpi"><small>Orders (30d)</small><div>${s.orders30d}</div></div><div class="kpi"><small>Paid (30d)</small><div>${s.paid30d}</div></div></div>
    <div class="funnel">${v.daily.map((d) => `<div class="r"><span>${esc(d.day.slice(5))}</span><span class="bar"><i style="width:${(d.views / max) * 100}%"></i></span><b>${d.views}</b></div>`).join("")}</div>
    <div class="grid2"><table><tr><th>Page</th><th>7d</th><th>30d</th></tr>${pages.map(([p, n]) => `<tr><td>/${p === "home" ? "" : esc(p)}</td><td>${n.d7}</td><td>${n.d30}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No views yet.</td></tr>`}</table>
    <table><tr><th>Came from</th><th>30d</th></tr>${v.sources.map((x) => `<tr><td>${esc(x.source)}</td><td>${x.views}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">No views yet.</td></tr>`}</table></div>
    <p class="muted" style="font-size:.9rem">Counted on our own server: page, day and the site a visitor came from. No IP addresses, cookies or outside trackers. Bots are skipped.</p>`;
}

function render() {
  const s = D.stats;
  const pending = D.approvals.filter((a) => a.status === "pending");
  $("#apCount").hidden = !pending.length; $("#apCount").textContent = pending.length;
  const m = s.toMove || { count: 0 };
  $("#finCount").hidden = $("#moveNote").hidden = !m.count; $("#finCount").textContent = m.count;
  if (m.count) $("#moveNote").innerHTML = `<b>⚡ ${m.count} payment${m.count > 1 ? "s" : ""} waiting to move to the node</b> (${sats(m.sats)}, in the backup wallet). ${m.ready === m.count ? "The node is back: the QR is in your email and in Finance." : "When the node is back online, you're emailed the QR within the hour, or make it now in Finance."} <button type="button" class="btn" id="moveOpen">Open Finance</button>`;
  $("#kpis").innerHTML = [
    ["Waiting for you", s.pendingApprovals], ["New leads (7d)", s.leads7d], ["Qualified", s.qualified],
    ["Open proposals", s.proposalsOpen], ["Pipeline", money(s.pipelineUsd)], ["Won this month", sats(s.wonMonthSats)],
    ["Monthly recurring", money(s.mrrUsd)], ["Active clients", s.activeClients],
    ...(s.yebente ? [["Ye₿ente wallets", s.yebente.wallets], ["Owed to wallets", sats(s.yebente.owedSats)], ["Node can send", s.yebente.outboundSats === null ? "unknown" : sats(s.yebente.outboundSats)]] : []),
  ].map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v}</div></div>`).join("");
  const max = Math.max(1, ...Object.values(s.byStage));
  $("#funnel").innerHTML = STAGES.map((st) => `<div class="r"><span>${st.replace("_", " ")}</span><span class="bar"><i style="width:${(s.byStage[st] / max) * 100}%"></i></span><b>${s.byStage[st]}</b></div>`).join("");
  renderVisits(s);
  $("#sys").innerHTML = Object.entries(D.system).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("");
  renderAi(D.ai);
  $("#overviewApprovals").innerHTML = pending.length ? pending.map(approvalHtml).join("") : `<p class="muted">Nothing needs you right now. The agents have it. ☕</p>`;
  $("#approvals").innerHTML = D.approvals.length ? D.approvals.map(approvalHtml).join("") : `<p class="muted">No approvals yet.</p>`;
  renderLeads();
  $("#emailRows").innerHTML = D.emails.map((e) => `<tr><td>${ago(e.at)}</td><td>${esc(e.to)}</td><td>${esc(e.subject)}</td><td${/^(bounced|failed)/.test(e.status) ? ' class="err"' : ""}>${esc(e.status)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No emails yet.</td></tr>`;
}

$("#stageFilter").innerHTML += STAGES.map((s) => `<option>${s}</option>`).join("");
function renderLeads() {
  const q = $("#search").value.toLowerCase(), st = $("#stageFilter").value;
  const rows = D.leads.filter((l) => (!st || l.stage === st) && (!q || JSON.stringify(l).toLowerCase().includes(q)));
  $("#leadRows").innerHTML = rows.map((l) => `<tr class="click" data-lead="${l.id}">
    <td><b>${esc(l.name || "Anonymous")}</b><br><span class="muted">${esc(l.email || l.source)}</span></td>
    <td><span class="stage ${l.stage}">${esc(l.stage.replace("_", " "))}</span></td>
    <td class="hide-sm">${esc(l.needs.map(svcName).join(", "))}</td>
    <td class="hide-sm">${l.score || "–"}</td>
    <td>${ago(l.updatedAt)}<br><span class="muted">${esc(l.lastMessage.slice(0, 70))}</span></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No leads yet. Share the site!</td></tr>`;
}
$("#moveNote").addEventListener("click", (e) => { if (e.target.id === "moveOpen") tab("finance"); });
$("#search").addEventListener("input", renderLeads);
$("#stageFilter").addEventListener("change", renderLeads);

async function openLead(id) {
  tab("leads");
  const { lead: l, proposal: p } = await api(`?view=lead&id=${encodeURIComponent(id)}`);
  $("#leadDetail").innerHTML = `<div class="panel"><h2>${esc(l.name || "Anonymous")} <span class="stage ${l.stage}">${esc(l.stage)}</span></h2>
    <div class="grid2"><div>
      <h3 style="font-size:1rem;margin-bottom:.5rem">Conversation</h3>
      <div class="transcript">${l.transcript.map((m) => `<div class="${m.role}">${esc(m.text)}</div>`).join("") || '<p class="muted">No chat yet.</p>'}</div>
      <h3 style="font-size:1rem;margin:1rem 0 .5rem">Email this client</h3>
      <input id="emSubj" placeholder="Subject"><textarea id="emText" placeholder="Message" style="margin-top:.4rem"></textarea>
      <div class="row"><button class="btn primary" id="emSend">Send email</button><span id="emStatus" class="muted"></span></div>
    </div><div>
      <dl><dt>Email</dt><dd>${esc(l.email || "–")}</dd><dt>Company</dt><dd>${esc(l.company || "–")}</dd>
      <dt>Role</dt><dd>${esc(l.role || "–")}</dd><dt>Country</dt><dd>${esc(l.country || "–")}</dd>
      <dt>Needs</dt><dd>${esc(l.needs.map(svcName).join(", ") || "–")}</dd><dt>Hours/week</dt><dd>${esc(l.hoursPerWeek ?? "–")}</dd>
      <dt>Budget</dt><dd>${l.budgetMonthly ? money(l.budgetMonthly) + "/mo" : "–"}</dd><dt>Pain</dt><dd>${esc(l.pain || "–")}</dd>
      <dt>Fit score</dt><dd>${l.score || "–"}/10</dd><dt>Source</dt><dd>${esc(l.source)}</dd></dl>
      ${p ? `<h3 style="font-size:1rem;margin:1rem 0 .3rem">Proposal</h3><p><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a> · <span class="stage">${esc(p.status)}</span><br>${money(p.totals.monthly)}/mo + ${money(p.totals.oneOff)} one-off · due ${money(p.totals.dueNow)}</p>` : ""}
      <h3 style="font-size:1rem;margin:1rem 0 .3rem">Stage & private notes</h3>
      <select id="ldStage">${STAGES.map((s) => `<option ${s === l.stage ? "selected" : ""}>${s}</option>`).join("")}</select>
      <textarea id="ldNotes" style="margin-top:.4rem" placeholder="Private notes, deliverables, logins location…">${esc(l.notes)}</textarea>
      <div class="row"><button class="btn" id="ldSave">Save</button><span id="ldStatus" class="muted"></span></div>
      <h3 style="font-size:1rem;margin:1rem 0 .3rem">Activity</h3>
      <ul class="events">${l.events.slice().reverse().map((e) => `<li>${ago(e.at)}: ${esc(e.text)}</li>`).join("")}</ul>
    </div></div></div>`;
  $("#ldSave").onclick = async () => { await api("", { action: "lead_update", id, stage: $("#ldStage").value, notes: $("#ldNotes").value }); $("#ldStatus").textContent = "Saved"; load(false); };
  $("#emSend").onclick = async () => {
    if (!$("#emText").value.trim()) return;
    try { const r = await api("", { action: "email_client", id, subject: $("#emSubj").value, text: $("#emText").value }); $("#emStatus").textContent = r.status; $("#emText").value = ""; }
    catch (err) { $("#emStatus").textContent = err.message; }
  };
  $("#leadDetail").scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("click", async (e) => {
  const lead = e.target.closest("[data-lead]");
  if (lead) { e.preventDefault(); return openLead(lead.dataset.lead); }
  const lp = e.target.closest("[data-loadprop]");
  if (lp) {
    const a = D.approvals.find((x) => x.id === lp.dataset.ap);
    const { proposal: p } = await api(`?view=lead&id=${encodeURIComponent(a.leadId)}`);
    lp.parentElement.innerHTML = `<p><a href="${esc(p.url)}" target="_blank" rel="noopener">Preview proposal page</a></p>
      <div class="prices">${p.items.map((i, n) => `<label>${esc(i.label)}${i.quantity > 1 ? ` × ${i.quantity}` : ""} (${i.type})<input type="number" min="1" data-price="${n}" value="${i.price}"><small class="muted" data-satsfor="${n}">${money(i.price)}</small></label>`).join("")}<p class="sm muted" style="margin:.3rem 0 0">Prices are set in the currency clients see on the website; the sats beside each update as you type.</p></div>
      <label class="muted" style="font-size:.9rem">Executive summary<textarea data-summary>${esc(p.summary)}</textarea></label>`;
    return;
  }
  const id = e.target.dataset.approve || e.target.dataset.decline;
  if (!id) return;
  const box = $("#ap-" + id);
  const prices = [...box.querySelectorAll("[data-price]")].map((x) => Number(x.value));
  const summary = box.querySelector("[data-summary]")?.value;
  e.target.disabled = true;
  try {
    await api("", { action: "approval", id, decision: e.target.dataset.approve ? "approve" : "decline", note: $("#note-" + id).value,
      edits: prices.length || summary ? { prices, summary } : undefined });
    await load(false);
  } catch (err) { alert(err.message); e.target.disabled = false; }
});

// ---------------------------------------------------------- operations
let O = null;
const TLABEL = { held: "⚠ security hold", new: "unassigned", assigned: "assigned (human)", in_progress: "in progress", review: "with client", changes: "changes", done: "done ✓", cancelled: "cancelled",
  queued: "queued for agent", working: "agent working", waiting_client: "waiting for client", owner: "needs you", follow_up: "unhappy client" };
async function loadOps() {
  try { O = await api("?view=ops"); renderOps(); } catch {}
}
function renderComms() {
  if (!O?.comms) return;
  $("#commsList").innerHTML = O.comms.map((c) => `<details class="ap"><summary style="cursor:pointer"><b>${esc(c.address)}</b> · ${esc(c.name)} <span class="stage">${c.head.kind === "ai" ? "AI head" : "Human"}: ${esc(c.head.name)}${c.head.title || c.head.role ? ` · ${esc(c.head.title || c.head.role)}` : ""}</span>${c.sendsAs === false ? ' <span class="stage">inbox only</span>' : ""}${c.sends ? ` <span class="stage">sends ${esc(c.sends.join(" and "))} mail</span>` : ""}${c.internal ? ' <span class="stage">internal</span>' : ""} <span class="muted sm">${(c.staff || []).length} AI staff · reports to ${esc(c.reportsTo === "founder" ? "Stan" : c.reportsTo || "")}</span><div class="muted sm" style="margin-top:.2rem">${esc(c.purpose)}</div></summary>
    ${(c.staff || []).length ? `<div style="margin-top:.6rem"><b class="sm">Team</b><ul class="sm">${c.staff.map((s) => `<li><b>${esc(s.name)}</b>, ${esc(s.title)}: ${esc(s.jurisdiction.join("; "))}</li>`).join("")}</ul></div>` : ""}
    ${c.channels ? `<div class="grid2 sm"><div><b>External</b><ul>${c.channels.external.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div><b>Internal</b><ul>${c.channels.internal.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>` : ""}
    <div class="grid2" style="margin-top:.6rem;font-size:.92rem">
      <div><b>Receives</b><ul>${c.inbound.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><b>Sends</b><ul>${c.outbound.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><b>Voice</b><ul>${c.voice.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><b>Response times</b><p class="sm" style="margin:.2rem 0 .6rem">First reply: ${esc(c.sla.firstReply)}<br>Resolution: ${esc(c.sla.resolution)}</p>
        <b>Escalates to Stanley when</b><ul>${c.escalate.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <b>Strategy</b><ul>${c.strategy.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <b>Track</b><ul>${c.metrics.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <b>Signature</b><pre class="sm" style="white-space:pre-wrap;margin:.2rem 0">${esc(c.signature.join("\n"))}</pre>${c.cc.length ? `<p class="sm muted">Copies: ${esc(c.cc.join(", "))}</p>` : ""}</div>
    </div></details>`).join("");
}
function renderInternal() {
  const I = O?.internal; if (!I) return;
  const dname = (ids) => ids.map((id) => O.comms.find((c) => c.id === id)?.address?.split("@")[0] || id).join(", ");
  $("#internalProto").innerHTML = `${I.security ? `<div class="sm" style="border-left:3px solid var(--warn);padding-left:.6rem;margin-bottom:.6rem"><b>Security, every message</b><ul style="margin:.2rem 0">${I.security.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}<p class="sm"><b>Daily:</b> ${esc(I.cadence.daily)}<br><b>Weekly:</b> ${esc(I.cadence.weekly)}<br><b>Monthly:</b> ${esc(I.cadence.monthly)}</p>
    <b class="sm">Escalation</b><ol class="sm">${I.escalation.map((e) => `<li><b>${esc(e.who)}</b>: ${esc(e.trigger)} (${esc(e.respond)})</li>`).join("")}</ol>
    <b class="sm">Who owns what</b><div style="overflow-x:auto"><table class="sm"><thead><tr><th>Activity</th><th>Does it</th><th>Accountable</th><th>Consulted</th><th>Informed</th></tr></thead><tbody>${I.raci.map((r) => `<tr><td>${esc(r.activity)}</td><td>${esc(dname(r.responsible))}</td><td>${esc(dname(r.accountable))}</td><td>${esc(dname(r.consulted))}</td><td>${esc(dname(r.informed))}</td></tr>`).join("")}</tbody></table></div>
    <details><summary class="sm" style="cursor:pointer"><b>Handoff checklist and rules</b></summary><ul class="sm">${I.handoff.map((h) => `<li>${esc(h)}</li>`).join("")}</ul><ul class="sm">${I.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>`;
  const Q = O.qa; if (!Q) return;
  $("#qaCount").textContent = `${Q.experts.length} experts`;
  $("#stanMethod").innerHTML = Q.stan.method.map((m) => `<li>${esc(m)}</li>`).join("");
  $("#qaExperts").innerHTML = Q.experts.map((e) => `<details class="sm" style="margin:.2rem 0"><summary style="cursor:pointer"><b>${esc(e.name)}</b>${e.always ? ' <span class="stage">every task</span>' : ""} <span class="muted">${esc(e.domains.join(", "))}</span></summary><ul>${e.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><span class="muted">Persona: ${esc(e.source)}</span></details>`).join("");
}
function renderOps() {
  renderComms();
  renderInternal();
  const openSt = ["held", "new", "assigned", "in_progress", "changes", "queued", "working", "waiting_client", "owner", "follow_up"];
  const unassigned = O.tasks.filter((t) => ["held", "new", "owner", "follow_up"].includes(t.status)).length;
  $("#taskCount").hidden = !unassigned; $("#taskCount").textContent = unassigned;
  const applied = O.members.filter((m) => m.status === "applied").length;
  $("#teamCount").hidden = !applied; $("#teamCount").textContent = applied;
  const f = $("#taskFilter").value;
  const list = O.tasks.filter((t) => f === "open" ? openSt.includes(t.status) : !f || t.status === f);
  const approved = O.members.filter((m) => m.status === "approved");
  const p = O.pipeline || {};
  $("#pipeKpis").innerHTML = [["Queued", p.queued], ["Agents working", p.working], ["Waiting on client", p.waiting_client], ["Needs you", p.owner], ["With client", p.review], ["Unhappy", p.follow_up], ["Done", p.done],
    ["Avg rating", O.satisfaction ? `${O.satisfaction.avg}★` : "–"]].map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v ?? 0}</div></div>`).join("");
  $("#taskList").innerHTML = list.map((t) => `<div class="ap ${["held", "new", "owner", "follow_up"].includes(t.status) ? "pending" : ""}">
    <h3>${esc(t.title)} <span class="stage">${TLABEL[t.status] || t.status}</span></h3>
    <div class="meta">${esc(t.client)} · ${esc(t.department)} · ~${t.estimateHours}h${t.due ? ` · due ${esc(t.due)}` : ""} · ${t.assignee ? esc(t.assignee) : t.agent ? esc(t.agent) : t.status === "in_progress" ? "you" : "nobody yet"}${t.attempts ? ` · attempt ${t.attempts}` : ""}${t.satisfaction ? ` · rated ${t.satisfaction.rating}/5` : ""}</div>
    <pre>${esc(t.details)}</pre>
    ${t.question ? `<p><b>Agent asked the client:</b> ${esc(t.question)}</p>` : ""}
    ${t.status === "held" && t.held ? `<div style="border:2px solid var(--warn);border-radius:.7rem;padding:.7rem .8rem;margin:.5rem 0;background:color-mix(in srgb,var(--warn) 8%,white)">
      <b>Security hold.</b> The ${esc(t.held.source)} contains ${esc(t.held.reasons.join(", "))}. All activity stopped; no AI has read it. Links below are shown as text only.
      <pre style="margin:.5rem 0;max-height:12rem;overflow:auto">${esc(t.held.text)}</pre>
      <div class="row"><input placeholder="Your instructions for the department (optional)" data-releasenote="${t.id}" style="flex:1;min-width:12rem"><button class="btn ok" data-release="${t.id}">Release: it's safe</button><button class="btn" data-cancel="${t.id}">Cancel task</button></div></div>` : ""}
    ${t.qa ? `<p class="muted">QA: ${t.qa.panel ? (t.qa.final?.approve ? "approved by Stan" : t.qa.final ? `sent back by Stan: ${esc((t.qa.final.issues || []).join("; "))}` : `${t.qa.panel.filter((p) => p.approved).length}/${t.qa.panel.length} areas approved`) : t.qa.pass ? "passed" : esc((t.qa.issues || []).join("; "))}</p>` : ""}
    ${t.deliverable ? `<details><summary>Deliverable: ${esc(t.deliverable.title || "")} (${t.hoursLogged}h)</summary>
      <p>${esc(t.deliverable.summary || t.deliverable.note || "")}</p>
      ${t.deliverable.url ? `<p><a href="${esc(t.deliverable.url)}" target="_blank" rel="noopener">Open link</a></p>` : ""}
      ${(t.deliverable.humanSteps || []).length ? `<p><b>Real-world steps for you:</b></p><ul>${t.deliverable.humanSteps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${(t.deliverable.files || []).map((f) => `<p><b>${esc(f.name)}</b></p><pre style="max-height:18rem;overflow:auto;background:var(--bg);padding:.6rem;border-radius:.5rem">${esc(f.content.slice(0, 8000))}</pre>`).join("")}
      ${(t.deliverable.sources || []).length ? `<p class="muted">Sources: ${t.deliverable.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc((() => { try { return new URL(u).hostname; } catch { return "source"; } })())}</a>`).join(", ")}</p>` : ""}</details>` : ""}
    ${t.satisfaction?.comment ? `<p><b>Client said:</b> ${esc(t.satisfaction.comment)}</p>` : ""}
    ${t.status === "owner" ? `<div class="row">${t.deliverable ? `<button class="btn ok" data-sendclient="${t.id}">Steps done: send to client</button>` : ""}<input placeholder="Instructions for the agent (optional)" data-rerunnote="${t.id}" style="flex:1;min-width:12rem"><button class="btn" data-rerun="${t.id}">Re-run agent</button></div>` : ""}
    ${t.status === "follow_up" ? `<div class="row"><input placeholder="What you did to make it right" data-closenote="${t.id}" style="flex:1;min-width:12rem"><button class="btn ok" data-close="${t.id}">Close follow-up</button><button class="btn" data-rerun="${t.id}">Re-run agent</button></div>` : ""}
    ${["new", "assigned", "in_progress", "changes"].includes(t.status) ? `<div class="row"><select data-assignsel="${t.id}" style="max-width:16rem"><option value="">Auto-assign</option>${approved.filter((m) => m.departments.includes(t.department)).concat(approved.filter((m) => !m.departments.includes(t.department))).map((m) => `<option value="${m.id}">${esc(m.name)} (${m.openHours}/${m.hoursPerWeek}h)</option>`).join("")}<option value="self">I'll do it</option></select>
      <button class="btn" data-assign="${t.id}">Assign</button><button class="btn" data-cancel="${t.id}">Cancel task</button></div>` : ""}
    ${!t.assignee && ["in_progress", "new", "changes"].includes(t.status) ? `<details style="margin-top:.5rem"><summary>Submit it yourself</summary>
      <input placeholder="Deliverable link (https://…)" data-surl="${t.id}" style="margin-top:.4rem"><textarea placeholder="What was done (client sees this)" data-snote="${t.id}" style="margin-top:.4rem"></textarea>
      <div class="row"><input type="number" min="0" step="0.25" value="${t.estimateHours}" data-shours="${t.id}" style="max-width:7rem"> hours <button class="btn ok" data-selfsubmit="${t.id}">Send to client</button></div></details>` : ""}
  </div>`).join("") || '<p class="muted">No tasks here.</p>';
  $("#deptKpis").innerHTML = O.departments.map((d) => `<div class="kpi"><small>${esc(d.name)}</small><div style="font-size:1rem">🤖 ${esc(d.agent)}</div><small>${O.workersLive ? "agent active" : "agent off (no AI key)"} · ${d.approved} human${d.approved === 1 ? "" : "s"}</small></div>`).join("");
  const order = { applied: 0, approved: 1, paused: 2, rejected: 3 };
  $("#memberList").innerHTML = O.members.slice().sort((a, b) => order[a.status] - order[b.status] || b.score - a.score).map((m) => `<div class="ap ${m.status === "applied" ? "pending" : ""}">
    <h3>${esc(m.name)} <span class="stage">${esc(m.status)}</span> <span class="muted" style="font-size:.85rem">screen score ${m.score}/10</span></h3>
    <div class="meta">${esc(m.email)} · ${esc(m.country)} ${esc(m.timezone)} · ${money(m.rate)}/h · ${m.hoursPerWeek}h/week · ${esc(m.departments.join(", "))} · ${m.openHours}h open</div>
    <details><summary>Application</summary><p><b>Skills:</b> ${esc(m.skills)}</p><p><b>Tools:</b> ${esc(m.tools)}</p>${m.portfolio ? `<p><a href="${esc(m.portfolio)}" target="_blank" rel="noopener">Portfolio</a></p>` : ""}<p><b>${esc(m.sampleQuestion || "Sample")}</b></p><pre>${esc(m.sample)}</pre></details>
    <div class="row">${m.status !== "approved" ? `<button class="btn ok" data-mstatus="approved" data-mid="${m.id}">Approve</button>` : `<button class="btn" data-mstatus="paused" data-mid="${m.id}">Pause</button>`}
    ${m.status === "applied" ? `<button class="btn" data-mstatus="rejected" data-mid="${m.id}">Decline</button>` : ""}</div></div>`).join("") || '<p class="muted">No applications yet. Share /join in VA communities and on LinkedIn.</p>';
}
$("#taskFilter").addEventListener("change", renderOps);
document.addEventListener("click", async (e) => {
  const d = e.target.dataset;
  let body = null;
  if (d.mstatus) body = { action: "member_status", id: d.mid, status: d.mstatus };
  else if (d.assign) body = { action: "task_assign", id: d.assign, memberId: document.querySelector(`[data-assignsel="${d.assign}"]`).value };
  else if (d.cancel) { if (!confirmCancel(e.target)) return; body = { action: "task_cancel", id: d.cancel }; }
  else if (d.sendclient) body = { action: "task_send_client", id: d.sendclient };
  else if (d.release) body = { action: "task_release", id: d.release, note: document.querySelector(`[data-releasenote="${d.release}"]`)?.value || "" };
  else if (d.rerun) body = { action: "task_rerun", id: d.rerun, note: document.querySelector(`[data-rerunnote="${d.rerun}"]`)?.value || "" };
  else if (d.close) body = { action: "task_close", id: d.close, note: document.querySelector(`[data-closenote="${d.close}"]`)?.value || "" };
  else if (d.selfsubmit) body = { action: "task_submit", id: d.selfsubmit, url: document.querySelector(`[data-surl="${d.selfsubmit}"]`).value, note: document.querySelector(`[data-snote="${d.selfsubmit}"]`).value, hours: document.querySelector(`[data-shours="${d.selfsubmit}"]`).value };
  if (!body) return;
  e.target.disabled = true;
  try { await api("", body); await loadOps(); } catch (err) { e.target.disabled = false; e.target.textContent = err.message; }
});
// Two-step cancel without a browser dialog.
function confirmCancel(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1"; btn.textContent = "Click again to cancel";
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Cancel task"; }, 4000);
  return false;
}

// ---------------------------------------------------------- growth
const SITE = location.origin;
const TEMPLATES = [
  ["WhatsApp: warm contact", `Hi [Name]! Quick one: I've started Altradits, helping busy owners hand off admin, inbox, social media and tech chores. If anything's eating your week, I'll do your first task free (up to an hour). Want me to take one thing off your plate? ${SITE}`],
  ["WhatsApp: ask for a referral", `Hi [Name], hope you're well! I now run Altradits (virtual assistance: inbox, social media, bookings, invoices, websites). Do you know 1 or 2 business owners who are stretched thin? I'd love an intro, and their first task is free. ${SITE}`],
  ["LinkedIn: connection note", `Hi [Name], I help founders get 10+ hours a week back by handling inbox, scheduling, social posts and admin. Happy to connect, and to share a free delegation plan if useful.`],
  ["LinkedIn: follow-up after connecting", `Thanks for connecting, [Name]. Curious: what's the one recurring task you'd hand off tomorrow if you could? Every job on our site has a fixed price, starting with a $5 test task: ${SITE}/va#quick`],
  ["Email: cold, personalised", `Subject: [Business]'s [specific thing you noticed]\n\nHi [Name],\n\nI noticed [specific observation, e.g. your Instagram hasn't posted since March / your site's contact form is broken on mobile].\n\nI run Altradits: we take admin, social media and tech chores off owners' plates. I'd be happy to [fix that one thing] free as a first task, no strings.\n\nWorth a try?\n\nStanley\n${SITE}`],
  ["Follow-up (3 days later)", `Hi [Name], just bumping this in case it got buried. The free first task offer stands. Reply with whatever's annoying you most this week and I'll take it from there.`],
];
function outKey() { return "altra.out." + new Date().toISOString().slice(0, 10); }
function outGet() { try { return Number(localStorage.getItem(outKey())) || 0; } catch { return 0; } }
function outSet(n) { try { localStorage.setItem(outKey(), String(Math.max(0, n))); } catch {} renderOut(); }
function renderOut() { const n = outGet(); $("#outCount").textContent = n; $("#outBar").style.width = Math.min(100, n * 5) + "%"; }
$("#outPlus").onclick = () => outSet(outGet() + 1);
$("#outMinus").onclick = () => outSet(outGet() - 1);
async function loadSubscribers() {
  try {
    const v = await api("?view=subscribers");
    $("#subTotal").textContent = `${v.active} subscribed${v.unsubscribed ? ` · ${v.unsubscribed} unsubscribed` : ""}`;
    $("#subKits").innerHTML = v.byKit.map((k) => `<div class="kpi"><small>${esc(k.title)}</small><div>${k.subscribers}</div><span class="muted sm">${k.downloads} downloads</span></div>`).join("");
    $("#subRows").innerHTML = v.recent.map((r) => `<tr><td class="sm">${ago(r.createdAt)}</td><td>${esc(r.email)}</td><td>${esc(r.name || "")}</td><td class="sm">${esc(r.kits.join(", "))}</td><td class="sm muted">${r.unsubscribed ? "unsubscribed" : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No sign-ups yet.</td></tr>`;
  } catch {}
}
$("#subCsv").addEventListener("click", async () => {
  const res = await fetch("/api/admin?view=subscribers&format=csv", { headers: { Authorization: "Bearer " + token } });
  const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = "altradits-subscribers.csv"; a.click();
});
async function loadDonations() {
  try {
    const d = await api("?view=donations");
    $("#donTotal").textContent = `${(d.sats || 0).toLocaleString("en-US")} sats from ${d.count} donor${d.count === 1 ? "" : "s"}`;
    $("#donList").innerHTML = d.recent.length ? `<table><thead><tr><th>When</th><th>Donor</th><th>Amount</th><th>Message</th><th>Receipt</th></tr></thead><tbody>${d.recent.map((x) => `<tr><td class="sm">${ago(x.at)}</td><td>${esc(x.name || x.email || "Anonymous")}</td><td>${(x.sats || 0).toLocaleString("en-US")} sats</td><td class="sm">${esc(x.message || "")}</td><td class="sm">${x.receipt ? rcpt(x.receipt) : x.email ? "pending" : "no email"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No donations yet.</p>`;
  } catch {}
}
function renderGrowth() {
  loadSubscribers();
  loadDonations();
  renderOut();
  $("#templates").innerHTML = TEMPLATES.map(([t, body], i) => `<div class="ap"><h3>${esc(t)}</h3><pre>${esc(body)}</pre><div class="row"><button class="btn" data-copytpl="${i}">Copy</button></div></div>`).join("");
  if (!D) return;
  const by = {};
  D.leads.forEach((l) => { by[l.source] = (by[l.source] || 0) + 1; });
  $("#sources").innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="r" style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:.35rem 0"><span>${esc(k)}</span><b>${v}</b></div>`).join("") || '<p class="muted">No leads yet.</p>';
  const refs = {};
  D.leads.filter((l) => l.referredBy).forEach((l) => { refs[l.referredBy] = (refs[l.referredBy] || 0) + 1; });
  $("#referrers").innerHTML = Object.entries(refs).map(([code, n]) => { const r = D.leads.find((l) => l.refCode === code); return `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:.35rem 0"><span>${esc(r?.name || r?.email || code)}</span><b>${n}</b></div>`; }).join("") || '<p class="muted">No referrals yet. Every active client gets a referral link in their portal.</p>';
}
document.addEventListener("click", async (e) => {
  const i = e.target.dataset.copytpl;
  if (i === undefined) return;
  try { await navigator.clipboard.writeText(TEMPLATES[i][1]); e.target.textContent = "Copied ✓"; } catch { e.target.textContent = "Select and copy"; }
});

// ---------------------------------------------------------- job hunt
let J = null, jobTimer = null;
const JLABEL = { apply_queued: "🤖 queued for Apply Agent", applying: "🤖 AI applying…", awaiting_submit: "🤖 waiting for your OK", found: "to review", preparing: "preparing…", ready: "pack ready", applied: "applied", interview: "interviewing", offer: "offer 🎉", rejected: "rejected", withdrawn: "withdrawn", error: "error" };
const REC = { apply: "✅ apply", apply_with_care: "⚠️ apply with care", skip: "⛔ skip" };
async function loadJobs() {
  try { J = await api("?view=jobs"); renderJobs(); } catch {}
}
function mdToHtml(md) {
  return esc(md).replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^[-*] (.*)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`).replace(/\n{2,}/g, "<br><br>");
}
const AFIELDS = [["fullName", "Full name"], ["email", "Email"], ["phone", "Phone (with country code)"], ["city", "City"], ["country", "Country"], ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"], ["website", "Website / portfolio"], ["workAuthorization", "Work authorisation / visa"], ["noticePeriod", "Notice period / availability"], ["salaryExpectation", "Salary expectation"], ["relocate", "Willing to relocate?"], ["startDate", "Earliest start date"], ["pronouns", "Pronouns (optional)"], ["demographics", "Demographic questions"]];
function renderApplicant(a) {
  if ($("#appFields").dataset.loaded) return;
  $("#appFields").innerHTML = AFIELDS.map(([k, l]) => `<label class="muted">${l}<input data-af="${k}" value="${esc(a[k] || "")}"></label>`).join("");
  $("#aExtra").value = a.extra || "";
  $("#appFields").dataset.loaded = "1";
}
$("#aSuggest").addEventListener("click", async () => {
  $("#aSuggest").disabled = true; $("#aMsg").textContent = "Reading your CV…";
  try {
    const { applicant } = await api("", { action: "job_applicant_suggest" });
    document.querySelectorAll("[data-af]").forEach((i) => {
      const v = applicant[i.dataset.af] || "";
      if (v && v !== i.value) { i.value = v; i.style.outline = "2px solid var(--btc)"; }
    });
    if (applicant.extra && !$("#aExtra").value) $("#aExtra").value = applicant.extra;
    $("#aMsg").textContent = "Filled from your CV (highlighted). Check them, fill any blanks, then Save to confirm.";
  } catch (err) { $("#aMsg").textContent = err.message; }
  $("#aSuggest").disabled = false;
});
$("#aSave").addEventListener("click", async () => {
  const body = { action: "job_applicant", extra: $("#aExtra").value };
  document.querySelectorAll("[data-af]").forEach((i) => { body[i.dataset.af] = i.value; });
  try { await api("", body); $("#aMsg").textContent = "Saved ✓"; } catch (err) { $("#aMsg").textContent = err.message; }
});
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== "altradits-apply" || e.data.type !== "apply-ack" || e.data.ok) return;
  $("#jobMsg").textContent = `Apply extension: ${e.data.error || "couldn't start"}`;
  api("", { action: "job_apply_cancel", id: e.data.id }).then(loadJobs).catch(() => {});
});
function renderJobs() {
  const p = J.profile;
  renderApplicant(J.applicant || {});
  const ext = document.documentElement.dataset.altraditsApply;
  $("#agentBadge").innerHTML = ext ? `🟢 Apply extension ${esc(ext)} ready` : `⚪ <a href="https://github.com/altradits/altradits/tree/main/apply-extension#install" target="_blank" rel="noopener">Install the Apply extension</a>`;
  if (!$("#pCv").dataset.loaded) {
    $("#pCv").value = p.cv; $("#pTargets").value = p.targets; $("#pLocation").value = p.location; $("#pSalary").value = p.salary; $("#pLinks").value = p.links; $("#pNotes").value = p.notes;
    $("#pCv").dataset.loaded = "1";
    if (!p.cv && !p.cvFile) $("#profilePanel").open = true;
  }
  renderCvFile(p.cvFile);
  renderCareer(p);
  const f = $("#jobFilter").value;
  const closed = ["offer", "rejected", "withdrawn"];
  const list = J.jobs.filter((j) => f === "active" ? !closed.includes(j.status) : f === "closed" ? closed.includes(j.status) : f === "applying" ? ["apply_queued", "applying", "awaiting_submit"].includes(j.status) : !f || j.status === f)
    .sort((a, b) => (b.pack?.fitScore ?? -1) - (a.pack?.fitScore ?? -1));
  const count = (st) => J.jobs.filter((j) => j.status === st).length;
  const follow = J.jobs.filter((j) => j.followUp).length;
  $("#jobCount").hidden = !follow; $("#jobCount").textContent = follow;
  $("#jobKpis").innerHTML = [["To review", count("found")], ["Packs ready", count("ready")], ["Applied", count("applied")], ["Interviews", count("interview")], ["Offers", count("offer")], ["Need follow-up", follow]]
    .map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v}</div></div>`).join("");
  $("#jobList").innerHTML = list.map((j) => {
    const k = j.pack;
    return `<div class="ap ${j.followUp ? "pending" : ""}" id="job-${j.id}">
      <h3>${esc(j.title)} <span class="stage">${JLABEL[j.status] || j.status}</span>${k ? ` <span class="stage" style="background:${k.fitScore >= 70 ? "color-mix(in srgb,var(--ok) 22%,white)" : k.fitScore >= 45 ? "color-mix(in srgb,var(--btc) 22%,white)" : "color-mix(in srgb,var(--warn) 18%,white)"}">fit ${k.fitScore}/100 · ${REC[k.recommendation] || ""}</span>` : ""}${j.followUp ? ' <span class="stage pending_approval">follow up</span>' : ""}</h3>
      <div class="meta">${esc(j.company)}${j.location ? ` · ${esc(j.location)}` : ""}${k?.deadline ? ` · deadline ${esc(k.deadline)}` : ""}${j.appliedAt ? ` · applied ${esc(j.appliedAt.slice(0, 10))}` : ""} · <a href="${esc(j.url)}" target="_blank" rel="noopener">job page</a></div>
      ${j.why ? `<p class="muted">🔎 ${esc(j.why)}${j.posted ? ` · posted ${esc(j.posted)}` : ""}</p>` : ""}
      ${j.error && j.status === "error" ? `<p class="err">${esc(j.error)}</p>` : ""}
      ${k ? `<details><summary>Fit: why and gaps</summary><p><b>Strengths</b></p><ul>${k.fitReasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p><b>Gaps (and how to address them)</b></p><ul>${k.gaps.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>None noted</li>"}</ul>${k.salaryNotes ? `<p><b>Salary:</b> ${esc(k.salaryNotes)}</p>` : ""}</details>
      <details><summary>Application form checklist</summary><ul>${k.checklist.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
      <details><summary>Cover letter</summary><pre>${esc(k.coverLetter)}</pre><button class="btn" data-copyjob="${j.id}" data-part="cover">Copy cover letter</button></details>
      <details><summary>Screening answers (${k.answers.length})</summary>${k.answers.map((a, i) => `<p><b>${esc(a.q)}</b></p><pre>${esc(a.a)}</pre><button class="btn" data-copyjob="${j.id}" data-part="a${i}">Copy</button>`).join("")}</details>
      <details><summary>Tailored CV</summary><pre style="max-height:20rem;overflow:auto">${esc(k.cv)}</pre><div class="row"><button class="btn" data-copyjob="${j.id}" data-part="cv">Copy CV</button><button class="btn" data-printcv="${j.id}">Print / save as PDF</button></div></details>` : ""}
      <div class="row">
        ${["found", "error", "ready"].includes(j.status) ? `<button class="btn ${k ? "" : "primary"}" data-prepare="${j.id}">${k ? "Re-prepare pack" : "Prepare application pack"}</button>` : ""}
        ${j.status === "ready" ? `<button class="btn primary" data-applyai="${j.id}">🤖 Apply with AI</button>` : ""}
        ${["apply_queued", "applying", "awaiting_submit"].includes(j.status) ? `<button class="btn" data-applycancel="${j.id}">Cancel AI apply</button>` : ""}
        <a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open & apply myself ↗</a>
        ${[["applied", "I applied"], ["interview", "Interview"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Not for me"]].filter(([st]) => st !== j.status).map(([st, l]) => `<button class="btn" data-jobstatus="${st}" data-jid="${j.id}">${l}</button>`).join("")}
      </div>
      ${j.apply?.log?.length ? `<details ${["applying", "awaiting_submit"].includes(j.status) ? "open" : ""}><summary>Apply Agent log</summary><ul class="events">${j.apply.log.slice(-15).reverse().map((h) => `<li>${esc(h.at.slice(11, 16))} ${esc(h.text)}</li>`).join("")}</ul></details>` : ""}
      ${j.status === "awaiting_submit" ? `<p><b>👀 The form is filled in.</b> Review it in the tab that opened, then press <b>Submit for me</b> in the Altradits panel.</p>` : ""}
      ${j.apply?.confirmation ? `<p class="muted">✅ ${esc(j.apply.confirmation)}</p>` : ""}
      <details><summary class="muted">History</summary><ul class="events">${j.history.slice().reverse().map((h) => `<li>${esc(h.at.slice(0, 16).replace("T", " "))}: ${esc(h.text)}</li>`).join("")}</ul></details>
    </div>`;
  }).join("") || '<p class="muted">No jobs here yet. Paste a link above.</p>';
  clearTimeout(jobTimer);
  const busy = J.jobs.some((j) => ["preparing", "apply_queued", "applying", "awaiting_submit"].includes(j.status)) || J.profile.masterBuilding || J.profile.discovery?.running;
  if (busy) jobTimer = setTimeout(loadJobs, 5000);
}
function renderCareer(p) {
  $("#stepCv").innerHTML = p.cvFile ? `✅ ${esc(p.cvFile.name)}` : p.cv && p.cv.length >= 200 ? "✅ Profile text added" : "Upload your CV in <b>My profile</b> below.";
  const b = p.masterBuilding && Date.now() - Date.parse(p.masterBuilding.since) < 10 * 60e3;
  $("#buildCv").disabled = Boolean(b);
  $("#buildCv").textContent = b ? "Building…" : p.master ? "Refresh my Living CV" : "Build my Living CV";
  $("#cvStatus").textContent = b ? "The Career Agent is writing your CV (about a minute)…" : p.masterError ? `Error: ${p.masterError}` : p.master ? `Last built ${p.master.at.slice(0, 16).replace("T", " ")}` : "";
  const d = p.discovery || {};
  const running = d.running && Date.now() - Date.parse(d.startedAt || 0) < 15 * 60e3;
  $("#discover").disabled = Boolean(running);
  $("#discover").textContent = running ? "Searching…" : "Find jobs for me";
  $("#discStatus").textContent = running ? "Searching job boards and career pages (a few minutes)…" : d.error ? `Last search failed: ${d.error}` : d.lastRun ? `Last search ${d.lastRun.slice(0, 16).replace("T", " ")}: ${d.added} new job${d.added === 1 ? "" : "s"} found` : "";
  $("#autoDiscover").checked = Boolean(p.autoDiscover);
  const m = p.master;
  $("#masterBox").innerHTML = m ? `<details class="ap" style="margin-top:1rem" ${location.hash === "#cv" ? "open" : ""}><summary style="font-weight:700;cursor:pointer">📄 Your Living CV: ${esc(m.headline)}</summary>
    <p>${esc(m.summary)}</p>
    ${m.ats ? `<p><b>ATS check: ${m.ats.score}/100</b>${m.ats.issues.length ? ` · to fix: ${m.ats.issues.map(esc).join(" ")}` : " · reads cleanly in applicant tracking systems"}</p>` : ""}
    <p><b>Strongest highlights</b></p><ul>${m.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${m.missing.length ? `<p><b>Add these to make it stronger</b> (in My profile → notes):</p><ul>${m.missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <pre style="max-height:24rem;overflow:auto">${esc(m.cv)}</pre>
    <div class="row"><button class="btn" id="copyMaster">Copy CV</button><button class="btn" id="printMaster">Print / save as PDF</button>
      <span class="muted">Public at <a href="/cv" target="_blank" rel="noopener">altradits.com/cv</a></span></div></details>` : "";
}
function printCv(title, cvMd) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>CV – ${esc(title)}</title><style>body{font:11pt/1.45 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:20pt;margin:0 0 .3rem}h2{font-size:13pt;border-bottom:1px solid #999;margin:1.2rem 0 .4rem}h3{font-size:11.5pt;margin:.8rem 0 .2rem}ul{margin:.2rem 0 .4rem 1.1rem;padding:0}@media print{body{margin:0}}</style>${mdToHtml(cvMd)}`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
$("#goProfile").addEventListener("click", () => { $("#profilePanel").open = true; $("#profilePanel").scrollIntoView({ behavior: "smooth" }); });
$("#buildCv").addEventListener("click", async () => {
  try { await api("", { action: "job_master_build" }); $("#cvStatus").textContent = "Started…"; setTimeout(loadJobs, 1500); }
  catch (err) { $("#cvStatus").textContent = err.message; }
});
$("#discover").addEventListener("click", async () => {
  try { await api("", { action: "job_discover" }); $("#discStatus").textContent = "Started…"; setTimeout(loadJobs, 1500); }
  catch (err) { $("#discStatus").textContent = err.message; }
});
$("#autoDiscover").addEventListener("change", async (e) => {
  try { await api("", { action: "job_settings", autoDiscover: e.target.checked }); $("#discStatus").textContent = e.target.checked ? "Daily search on ✓" : "Daily search off"; }
  catch (err) { $("#discStatus").textContent = err.message; }
});
document.addEventListener("change", async (e) => {
  if (e.target.id !== "publishCv") return;
  try { const r = await api("", { action: "job_settings", publishCv: e.target.checked }); J.profile = r.profile; }
  catch (err) { e.target.checked = !e.target.checked; alert(err.message); }
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "copyMaster") {
    try { await navigator.clipboard.writeText(J.profile.master.cv); e.target.textContent = "Copied ✓"; } catch { e.target.textContent = "Select and copy above"; }
  } else if (e.target.id === "printMaster") printCv(J.profile.master.headline, J.profile.master.cv);
});
function renderCvFile(f) {
  $("#cvFileBox").innerHTML = f
    ? `<p>✅ <b>${esc(f.name)}</b> · ${(f.size / 1024).toFixed(0)} KB · uploaded ${esc(f.uploadedAt.slice(0, 10))}${f.ext === "pdf" ? " · attached as a PDF to every application" : ` · ${f.textChars.toLocaleString()} characters read`}</p>
       <div class="row" style="margin-top:0"><button class="btn" id="cvDownload">Download</button><button class="btn" id="cvRemove">Remove</button></div>`
    : '<p class="muted">No CV uploaded yet.</p>';
  $("#cvUpload").textContent = f ? "Replace CV" : "Upload CV";
}
$("#cvUpload").addEventListener("click", () => {
  const file = $("#cvFile").files[0];
  if (!file) { $("#cvMsg").textContent = "Choose a file first."; return; }
  if (file.size > 5 * 1024 * 1024) { $("#cvMsg").textContent = "Please keep it under 5 MB."; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    $("#cvUpload").disabled = true; $("#cvMsg").textContent = "Uploading…";
    try {
      const r = await api("", { action: "job_cv_upload", name: file.name, data: String(reader.result).split(",")[1] });
      J.profile = r.profile; renderCvFile(r.profile.cvFile);
      $("#cvMsg").textContent = "Uploaded ✓"; $("#cvFile").value = "";
    } catch (err) { $("#cvMsg").textContent = /413|too large/i.test(err.message) ? "That file is too large for the server; try a smaller PDF." : err.message; }
    $("#cvUpload").disabled = false;
  };
  reader.readAsDataURL(file);
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "cvRemove") {
    if (!e.target.dataset.armed) { e.target.dataset.armed = "1"; e.target.textContent = "Click again to remove"; return; }
    try { const r = await api("", { action: "job_cv_remove" }); J.profile = r.profile; renderCvFile(null); } catch (err) { $("#cvMsg").textContent = err.message; }
  } else if (e.target.id === "cvDownload") {
    const res = await fetch("/api/admin?view=cvfile", { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) { $("#cvMsg").textContent = "Couldn't download."; return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = J.profile.cvFile.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
});
$("#jobFilter").addEventListener("change", renderJobs);
$("#jobAdd").addEventListener("click", async () => {
  const url = $("#jobUrl").value.trim();
  if (!url) return;
  $("#jobAdd").disabled = true; $("#jobMsg").textContent = "Reading the page…";
  try {
    const r = await api("", { action: "job_add", url });
    $("#jobMsg").textContent = r.listing ? `Found ${r.found} openings; added ${r.added.length} new. Prepare packs for the ones you like.` : r.duplicate ? "Already in your list." : "Added. Prepare its application pack below.";
    $("#jobUrl").value = "";
    await loadJobs();
  } catch (err) { $("#jobMsg").textContent = err.message; }
  $("#jobAdd").disabled = false;
});
$("#pSave").addEventListener("click", async () => {
  try {
    await api("", { action: "job_profile", cv: $("#pCv").value, targets: $("#pTargets").value, location: $("#pLocation").value, salary: $("#pSalary").value, links: $("#pLinks").value, notes: $("#pNotes").value });
    $("#pMsg").textContent = "Saved ✓";
  } catch (err) { $("#pMsg").textContent = err.message; }
});
$("#pImport").addEventListener("click", async () => {
  try { const r = await api("", { action: "job_import_readme" }); $("#pCv").value = r.profile.cv; $("#pMsg").textContent = "Imported. Review it, add your work history, then Save."; }
  catch (err) { $("#pMsg").textContent = err.message; }
});
document.addEventListener("click", async (e) => {
  const d = e.target.dataset || {};
  if (d.prepare) {
    e.target.disabled = true; e.target.textContent = "Preparing…";
    try { await api("", { action: "job_prepare", id: d.prepare }); await loadJobs(); } catch (err) { e.target.disabled = false; e.target.textContent = err.message; }
  } else if (d.applyai) {
    if (!document.documentElement.dataset.altraditsApply) { e.target.textContent = "Install the Apply extension first (see the link above)"; return; }
    try {
      await api("", { action: "job_apply", id: d.applyai });
      // The extension (same browser) opens the job in a new tab and takes it from there.
      window.postMessage({ source: "altradits-dashboard", type: "apply", id: d.applyai }, location.origin);
      await loadJobs();
    } catch (err) { e.target.textContent = err.message; }
  } else if (d.applycancel) {
    try { await api("", { action: "job_apply_cancel", id: d.applycancel }); await loadJobs(); } catch (err) { e.target.textContent = err.message; }
  } else if (d.jobstatus) {
    try { await api("", { action: "job_status", id: d.jid, status: d.jobstatus }); await loadJobs(); } catch (err) { e.target.textContent = err.message; }
  } else if (d.copyjob) {
    const k = J.jobs.find((j) => j.id === d.copyjob).pack;
    const text = d.part === "cv" ? k.cv : d.part === "cover" ? k.coverLetter : k.answers[Number(d.part.slice(1))].a;
    try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied ✓"; } catch { e.target.textContent = "Select and copy above"; }
  } else if (d.printcv) {
    const j = J.jobs.find((x) => x.id === d.printcv);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>CV – ${esc(j.title)}</title><style>body{font:11pt/1.45 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:20pt;margin:0 0 .3rem}h2{font-size:13pt;border-bottom:1px solid #999;margin:1.2rem 0 .4rem}h3{font-size:11.5pt;margin:.8rem 0 .2rem}ul{margin:.2rem 0 .4rem 1.1rem;padding:0}@media print{body{margin:0}}</style>${mdToHtml(j.pack.cv)}`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
});

// ---- department inboxes (read-only)
let MB = null, mbSel = null;
async function loadInboxes(fresh = false) {
  $("#mailMeta").textContent = "checking…";
  try { MB = (await api(`?view=inboxes${fresh ? "&fresh=1" : ""}`)).boxes; } catch (err) { $("#mailMeta").textContent = err.message; return; }
  const unread = MB.reduce((n, b) => n + (b.unread || 0), 0);
  $("#mailCount").hidden = !unread; $("#mailCount").textContent = unread;
  $("#mailMeta").textContent = `${MB.filter((b) => b.connected).length} of ${MB.length} connected · ${unread} unread`;
  if (!mbSel || !MB.some((b) => b.id === mbSel)) mbSel = (MB.find((b) => b.connected) || MB[0]).id;
  renderInboxes();
}
function renderInboxes() {
  setTimeout(syncMbBulk);
  $("#mailBoxes").innerHTML = MB.map((b) => `<button class="mbox${b.id === mbSel ? " on" : ""}" data-mbox="${esc(b.id)}"><b>${esc(b.address)}</b><span class="muted sm">${esc(b.name)}</span>${b.connected ? (b.unread ? `<span class="badge">${b.unread}</span>` : "") : '<span class="sm muted">not connected</span>'}</button>`).join("");
  const b = MB.find((x) => x.id === mbSel);
  $("#mailRead").innerHTML = "";
  $("#mailList").innerHTML = !b.connected
    ? `<div class="ap"><b>${esc(b.address)} isn't connected.</b><p class="sm muted" style="margin:.3rem 0 0">${b.error ? esc(b.error) + "<br>" : ""}To see it here, add its password in DirectAdmin → Setup Node.js App as an environment variable named <code>${esc(b.env)}</code>, then restart the app.</p></div>`
    : b.messages.length ? `<table class="mlist"><tbody>${b.messages.map((m) => `<tr class="click${m.unread ? " unread" : ""}" data-muid="${m.uid}"><td class="selcell"><input type="checkbox" class="mbSel" value="${m.uid}" aria-label="Select this message"></td><td>${esc(m.from)}</td><td>${esc(m.subject)}</td><td class="sm muted">${m.date ? ago(m.date) : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No messages in ${esc(b.address)}.</p>`;
}
$("#mailFresh").addEventListener("click", async (e) => {
  const b = e.currentTarget; lastBtn = null; b.classList.add("busy"); toast("Checking mail…", false, 0);
  await loadInboxes(true); settle(b, true); toast(`Mail checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
});
// Select messages and move them to the mailbox's Trash (two clicks: the second confirms).
const mbChecked = () => [...document.querySelectorAll(".mbSel:checked")].map((c) => Number(c.value));
function syncMbBulk() {
  const b = MB?.find((x) => x.id === mbSel), n = mbChecked().length;
  $("#mbBulk").hidden = !(b?.connected && b.messages.length);
  $("#mbTrash").disabled = !n; delete $("#mbTrash").dataset.confirm;
  $("#mbTrash").textContent = n ? `Move ${n} to Trash` : "Move selected to Trash";
  $("#mbAll").checked = n > 0 && n === document.querySelectorAll(".mbSel").length;
}
$("#mbAll").addEventListener("change", (e) => { document.querySelectorAll(".mbSel").forEach((c) => (c.checked = e.target.checked)); syncMbBulk(); });
$("#mbTrash").addEventListener("click", async (e) => {
  const uids = mbChecked(); if (!uids.length) return;
  if (!e.target.dataset.confirm) { e.target.dataset.confirm = "1"; e.target.textContent = `Click again to move ${uids.length} to Trash`; return; }
  try {
    const r = await api("", { action: "mail_trash", box: mbSel, uids });
    $("#mbSelMsg").textContent = `Moved ${r.moved} to ${r.to}. You can restore them from Trash in webmail.`;
    await loadInboxes(true);
  } catch (err) { $("#mbSelMsg").textContent = err.message; syncMbBulk(); }
});
$("#mailRead").addEventListener("click", async (e) => {
  const uid = e.target.dataset.askstan; if (!uid) return;
  e.target.disabled = true;
  const hint = $("[data-replyhint]").value.trim();
  try {
    await api("", { action: "stan_instruct", box: mbSel, uid, text: `Draft a reply to this message${hint ? `: ${hint}` : "."}` });
    $("[data-replymsg]").textContent = "Stan is drafting it. It will appear in the Stan tab for your approval.";
  } catch (err) { e.target.disabled = false; $("[data-replymsg]").textContent = err.message; }
});
$("#mailBoxes").addEventListener("click", (e) => { const id = e.target.closest("[data-mbox]")?.dataset.mbox; if (id) { mbSel = id; renderInboxes(); } });
$("#mailList").addEventListener("click", async (e) => {
  if (e.target.closest(".selcell")) { if (e.target.matches(".mbSel")) syncMbBulk(); return; } // ticking a box doesn't open the message
  const uid = e.target.closest("[data-muid]")?.dataset.muid; if (!uid) return;
  $("#mailRead").innerHTML = '<p class="muted">Opening…</p>';
  try {
    const m = await api(`?view=message&box=${encodeURIComponent(mbSel)}&uid=${uid}`);
    $("#mailRead").innerHTML = `<div class="ap" style="margin-top:.8rem">${m.security ? `<p style="border:2px solid var(--warn);border-radius:.6rem;padding:.5rem .7rem;margin:0 0 .6rem;background:color-mix(in srgb,var(--warn) 8%,white)"><b>⚠ Security:</b> ${esc(m.security)}</p>` : ""}
      <h3>${esc(m.subject)}</h3><div class="meta">From ${esc(m.from)} · to ${esc(m.to)}${m.cc ? ` · cc ${esc(m.cc)}` : ""}${m.date ? ` · ${new Date(m.date).toLocaleString()}` : ""}</div>
      <pre style="white-space:pre-wrap;max-height:30rem;overflow:auto;margin-top:.6rem">${esc(m.text)}</pre>
      ${m.attachments.length ? `<p class="sm muted">Attachments (not opened here): ${m.attachments.map((a) => `${esc(a.name)} (${Math.ceil(a.size / 1024)} KB)`).join(", ")}</p>` : ""}
      <div class="row"><input placeholder="What should the reply say? (optional)" data-replyhint style="flex:1;min-width:12rem"><button class="btn primary" data-askstan="${uid}">Ask Stan to draft a reply</button></div><p class="muted sm" data-replymsg></p></div>`;
  } catch (err) { $("#mailRead").innerHTML = `<p class="err">${esc(err.message)}</p>`; }
});

// ---- Stan: instructions and approvals
let STAN_D = null;
const kb = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
async function loadArchives() {
  try {
    const { archives } = await api("", { action: "archives" });
    $("#archList").innerHTML = archives.length ? archives.map((a) => `<div class="row" style="margin:.25rem 0;align-items:center"><span style="flex:1">${esc(a.name.replace(/^fresh-|\.json$/g, "").replace(/T(\d\d)-(\d\d).*/, " $1:$2 UTC"))} · ${kb(a.bytes)}</span><button class="btn" data-arch="${esc(a.name)}">Delete</button></div>`).join("") : '<p class="muted" style="margin:0">No archives.</p>';
  } catch (err) { $("#archList").textContent = err.message; }
}
document.querySelectorAll('input[name="freshMode"]').forEach((r) => r.addEventListener("change", () => { $("#freshConfirm").placeholder = r.value === "delete" ? "Type DELETE FOREVER" : "Type START FRESH"; }));
// Finance: the statement of money received.
const satsF = (n) => `${Number(n || 0).toLocaleString("en-US")} sats`;
async function loadFinance() {
  let F; try { F = await api("?view=statement"); } catch (err) { $("#finKpis").textContent = err.message; return; }
  const kpi = (label, v, sub) => `<div class="kpi"><small>${esc(label)}</small><div>${v}</div>${sub ? `<small class="muted">${esc(sub)}</small>` : ""}</div>`;
  const n = (c, one) => `${c} ${one}${c === 1 ? "" : "s"}`;
  $("#finKpis").innerHTML = kpi("Total received", satsF(F.total.sats), n(F.total.count, "payment"))
    + kpi("Sales", satsF(F.sales.sats), n(F.sales.count, "order")) + kpi("Donations", satsF(F.donations.sats), n(F.donations.count, "donation"))
    + kpi("Lightning", satsF(F.channels.lightning.sats), n(F.channels.lightning.count, "payment")) + kpi("On-chain", satsF(F.channels.onchain.sats), n(F.channels.onchain.count, "payment"))
    + (F.custodial.count ? kpi("Received while the node was down", satsF(F.custodial.sats), `${n(F.custodial.count, "payment")} in ${[...new Set(F.payments.filter((x) => x.wallet).map((x) => x.wallet))].join(", ")}`) : "");
  const table = (rows, head) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : '<p class="muted">Nothing received yet.</p>';
  $("#finMonths").innerHTML = table(F.months.map((m) => `<tr><td>${esc(m.key)}</td><td>${satsF(m.sales)}</td><td>${satsF(m.donations)}</td><td><b>${satsF(m.sats)}</b></td></tr>`), ["Month", "Sales", "Donations", "Total"]);
  $("#finServices").innerHTML = table(F.services.map((s) => `<tr><td>${esc(s.key)}</td><td>${s.count}</td><td>${satsF(s.sats)}</td></tr>`), ["Service", "Orders", "Received"]);
  $("#finList").innerHTML = table(F.payments.map((x) => `<tr><td>${esc(new Date(x.at).toLocaleString())}</td><td>${rcpt(x.receipt)}</td><td>${esc(x.client)}</td><td>${esc(x.what)}${x.type === "donation" ? ' <span class="stage">donation</span>' : ""}</td><td>${satsF(x.sats)}</td><td>${x.channel === "onchain" ? "On-chain" : "Lightning"}${x.wallet ? `<br><small class="muted">${esc(x.wallet)}</small>` : ""}</td><td><code title="${esc(x.reference)}">${esc(x.reference.slice(0, 12))}…</code></td></tr>`), ["Date", "Receipt", "Client", "What", "Sats", "Channel", "Reference"]);
}
async function loadHeld() {
  let H; try { H = await api("?view=held"); } catch { return; }
  $("#heldPanel").hidden = !H.held.length && !H.moved.length;
  $("#heldList").innerHTML = H.held.map((x) => `<div class="ap" style="margin:0 0 .8rem"><span class="stage">${esc(x.code)}</span> <b>${esc(x.title)}</b> · ${esc(x.client)} · ${x.balanceDue ? `<b>${satsF(x.sats)}</b> of ${satsF(x.expected)} received on the node · balance of <b>${satsF(x.balanceDue)}</b> requested from the client ${x.balanceAt ? ago(x.balanceAt) : ""}` : `<b>${satsF(x.expected)}</b> order, in ${esc(x.wallet || "the backup wallet")} · ${ago(x.at)}`}
    ${x.sweep ? `<div class="row" style="align-items:flex-start;margin-top:.6rem"><div style="width:11rem;background:#fff;padding:.4rem;border-radius:.5rem">${x.sweep.qr}</div><div style="flex:1;min-width:14rem"><p class="sm" style="margin:0 0 .4rem">Order <b>${esc(x.code)}</b> only. Scan with ${esc(x.wallet || "the backup wallet")} and pay exactly ${satsF(x.sweep.sats)}; the wallet shows the note "Altradits ${esc(x.code)}". Valid until ${new Date(x.sweep.expiresAt).toLocaleString()}.</p><textarea readonly style="min-height:4rem;font-size:.75rem">${esc(x.sweep.bolt11)}</textarea></div></div>`
      : x.balanceDue ? `<p class="sm muted" style="margin:.4rem 0 0">The client has a QR for the balance; their official receipt goes out when it's paid.</p>`
      : `<div class="row" style="margin-top:.5rem;align-items:center"><label class="sm">The client sent <input type="number" min="1" step="1" value="${x.expected}" data-movesats="${esc(x.id)}" style="width:9rem"> sats</label><button class="btn primary" data-move="${esc(x.id)}">Make node invoice</button></div><p class="sm muted" style="margin:.3rem 0 0">Enter what ${esc(x.wallet || "the backup wallet")} shows they sent. Less than the order: they're asked for the balance. More: they get a credit code for the difference.</p>`}</div>`).join("") || '<p class="muted">Nothing waiting.</p>';
  $("#heldList").insertAdjacentHTML("beforeend", H.moved.length ? `<h3 style="font-size:1rem;margin:1rem 0 .4rem">Recently moved to the node</h3><table><thead><tr><th>Order</th><th>What</th><th>Sats</th><th>Confirmed</th><th>Receipt sent to</th></tr></thead><tbody>${H.moved.map((m) => `<tr><td><span class="stage">${esc(m.code)}</span></td><td>${esc(m.title)}</td><td>${satsF(m.sats)}</td><td class="sm">${ago(m.at)}</td><td>${m.to ? `${rcpt(m.receipt)} → ${esc(m.to)}` : '<span class="muted">waiting for the client\'s email</span>'}</td></tr>`).join("")}</tbody></table>` : "");
}
$("#heldList").addEventListener("click", async (e) => {
  const id = e.target.dataset.move; if (!id) return;
  const amt = document.querySelector(`[data-movesats="${CSS.escape(id)}"]`)?.value;
  try { await api("", { action: "move_to_node", id, sats: Number(amt) }); loadHeld(); } catch {}
});
$("#heldCheck").addEventListener("click", async () => { await loadHeld(); loadFinance(); });
// Sending power: spendable after channel reserves, what Ye₿ente owes, and node top-ups.
let spPoll = null;
async function loadPower() {
  let P; try { P = await api("?view=liquidity"); } catch (err) { $("#spNote").textContent = err.message; return; }
  const kpi = (label, v) => `<div class="kpi"><small>${esc(label)}</small><div>${esc(v)}</div></div>`;
  $("#spBadge").textContent = P.spendable < 1000 ? "can't send" : P.covered ? "covers every wallet" : "short";
  $("#spBadge").className = `stage ${P.spendable < 1000 || !P.covered ? "failed" : "posted"}`;
  $("#spKpis").innerHTML = kpi("Can send now", satsF(P.spendable)) + kpi("On our side", satsF(P.local)) + kpi("Locked as reserve", satsF(P.reserve))
    + kpi("Owed to Ye₿ente wallets", `${satsF(P.owedSats)} (${P.wallets})`) + kpi("Can still receive", satsF(P.inbound));
  $("#spNote").innerHTML = P.spendable < 1000 ? `<b class="err">The node can't send anything right now.</b> Ye₿ente payments out, including M-Pesa, fail until you top up.`
    : !P.covered ? `<b class="err">Short:</b> wallets hold more than the node can send. Top up so every balance can be paid out.` : "Enough to pay out every Ye₿ente balance.";
  if (!$("#spSats").value && P.suggested) $("#spSats").value = P.suggested;
  $("#spSats").min = P.min; $("#spSats").max = P.max;
  $("#spList").innerHTML = P.topups.length ? P.topups.map((t) => `<div>${esc(satsF(t.sats))} · <span class="stage ${t.state === "paid" ? "posted" : t.state === "expired" ? "" : "failed"}">${esc(t.state)}</span> <span class="muted">${esc(ago(t.at))}</span></div>`).join("") : '<p class="muted">No top-ups yet.</p>';
}
$("#spGo").addEventListener("click", async () => {
  $("#spErr").textContent = "";
  let T; try { T = await api("", { action: "node_topup", sats: Number($("#spSats").value) }); } catch (err) { $("#spErr").textContent = err.message; return; }
  $("#spInvoice").innerHTML = `<div class="ap" style="margin-top:.6rem"><p class="sm" style="margin:0 0 .4rem"><b>Pay ${esc(satsF(T.sats))} to your node</b> from any Lightning wallet. This page updates when it lands (the invoice works for an hour).</p>
    <div style="max-width:15rem;background:#fff;padding:.5rem;border-radius:8px">${T.qr}</div>
    <textarea readonly id="spBolt" rows="3" style="width:100%;margin-top:.5rem;font:12px ui-monospace,monospace">${esc(T.bolt11)}</textarea>
    <div class="row"><button class="btn" id="spCopy">Copy invoice</button><a class="btn" href="lightning:${esc(T.bolt11)}">Open in wallet</a></div>
    <p class="sm" id="spState" role="status">Waiting for payment…</p></div>`;
  $("#spCopy").onclick = () => navigator.clipboard?.writeText(T.bolt11).then(() => toast("Invoice copied."));
  clearInterval(spPoll);
  spPoll = setInterval(async () => {
    let s; try { s = await api(`?view=topup&hash=${encodeURIComponent(T.hash)}`); } catch { return; }
    if (s.state === "paid") { clearInterval(spPoll); $("#spState").innerHTML = `<b style="color:var(--ok)">Paid ✓</b> ${esc(satsF(s.sats))} landed on the node.`; toast("Top-up received."); loadPower(); loadChannels(); }
    else if (s.state === "expired") { clearInterval(spPoll); $("#spState").textContent = "This invoice expired. Make a new one."; loadPower(); }
  }, 4000);
});

async function loadChannels() {
  let L; try { L = await api("?view=channels"); } catch (err) { $("#lnAlerts").textContent = err.message; return; }
  const color = { critical: "#B42318", warning: "#B54708" };
  $("#lnAlerts").innerHTML = L.alerts.length ? L.alerts.map((a) => `<p style="margin:0 0 .6rem;padding:.6rem .8rem;border-radius:.6rem;border:1px solid ${color[a.level] || "var(--line)"};color:${color[a.level] || "inherit"}"><b>${a.level === "critical" ? "Action needed" : "Heads-up"}:</b> ${esc(a.text)}</p>`).join("") : '<p style="margin:0 0 .6rem;color:#067647"><b>All good:</b> enough inbound for what the website receives.</p>';
  if (L.receiveOnly !== null) $("#lnAlerts").insertAdjacentHTML("beforeend", L.receiveOnly ? '<p class="sm" style="margin:0 0 .6rem;color:#067647"><b>Website node key: receive only ✓</b> It can create invoices and read the node, and has no permission to send.</p>' : "");
  const T = L.totals;
  $("#lnKpis").innerHTML = T ? [["Can receive (inbound)", satsF(T.inbound)], ["Held on our side", satsF(T.local)], ["Total capacity", satsF(T.capacity)], ["Channels active", `${T.active} of ${T.channels}`], ["Received in 30 days", satsF(L.demand.month)]]
    .map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v}</div></div>`).join("") : "";
  const rows = [...L.channels, ...L.pending].map((c) => { const pct = c.capacity ? Math.round((c.local / c.capacity) * 100) : 0;
    return `<tr><td>${c.alias ? `<b>${esc(c.alias)}</b><br>` : ""}<code title="${esc(c.peer)}">${esc(c.peer.slice(0, 16))}…</code>${c.private ? ' <span class="stage">private</span>' : ""}</td><td>${satsF(c.capacity)}</td><td>${satsF(c.remote)}</td><td>${satsF(c.local)}</td><td><div style="background:#E4E9F0;border-radius:4px;height:8px;width:7rem"><div style="background:#2A5A8F;border-radius:4px;height:8px;width:${pct}%"></div></div><small class="muted">${pct}% ours</small></td><td>${c.status ? esc(c.status) : c.active ? "Active" : '<b style="color:#B42318">Offline</b>'}</td></tr>`; });
  $("#lnList").innerHTML = rows.length ? `<table><thead><tr><th>Peer</th><th>Capacity</th><th>Can receive</th><th>Ours</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : "";
  const A = L.advice;
  $("#lnAdvice").innerHTML = `<p style="margin:0 0 .5rem"><b>Suggested size: ${satsF(A.capacity)} of inbound.</b> ${esc(A.why)}</p>${A.fees ? `<p style="margin:0 0 .5rem">${esc(A.fees)}</p>` : ""}<b>Avoid</b><ul style="padding-left:1.1rem;margin:.3rem 0">${A.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("#lnLessons").innerHTML = L.lessons.map((l) => `<li><b>${esc(l.at)}</b> ${esc(l.text)}</li>`).join("");
}
$("#lnAdd").addEventListener("click", async () => {
  try { await api("", { action: "ln_lesson", text: $("#lnLesson").value }); $("#lnLesson").value = ""; loadChannels(); }
  catch (err) { $("#lnLessons").insertAdjacentHTML("afterbegin", `<li class="muted">${esc(err.message)}</li>`); }
});
$("#finCsv").addEventListener("click", async () => {
  const res = await fetch("/api/admin?view=statement&format=csv", { headers: { Authorization: "Bearer " + token } });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: `altradits-statement-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
});
// A clear button for each dashboard: same rules as Start fresh, one group at a time.
let CLEAN = null;
async function loadCleanup() {
  try { CLEAN = await api("?view=cleanup"); } catch { return; }
  $("#autoRules").innerHTML = CLEAN.retention.map((r) => `<li>${esc(r.text)}${r.days ? `: after <b>${r.days} days</b>` : ""}</li>`).join("");
  const L = CLEAN.last;
  $("#autoLast").textContent = L ? `Last run ${new Date(L.at).toLocaleString()}: ${L.removed} record${L.removed === 1 ? "" : "s"} removed${L.removed ? ` (${Object.entries(L.counts).map(([k, n]) => `${n} ${k}`).join(", ")})` : ""}.` : "Not run yet: the first clean-up happens tomorrow morning.";
  document.querySelectorAll(".clearbox").forEach((box) => {
    if (box.dataset.ready) return; box.dataset.ready = "1";
    const groups = box.dataset.groups.split(","), name = groups.map((g) => CLEAN.groups[g]).join(" and ");
    box.innerHTML = `<details><summary class="sm" style="cursor:pointer"><b>Clear ${esc(name)}</b></summary>
      <p class="sm muted" style="margin:.4rem 0">Clears this dashboard's records. Never touched: anything attached to a payment, live work (drafts waiting for you, pending approvals, open tasks, proposals awaiting an answer, unused coupons) and internal team details or settings.</p>
      <label class="sm"><input type="radio" name="m-${groups[0]}" value="archive" checked> <span>Archive first (can be restored)</span></label>
      <label class="sm"><input type="radio" name="m-${groups[0]}" value="delete"> <span><b>Delete for good</b> (frees the space, can't be undone)</span></label>
      <div class="row" style="margin-top:.5rem"><input class="cbConfirm" placeholder="Type START FRESH" style="max-width:14rem"><button class="btn cbGo">Clear</button></div>
      <p class="sm muted cbMsg" role="status"></p></details>`;
    box.querySelectorAll("input[type=radio]").forEach((r) => r.addEventListener("change", () => { box.querySelector(".cbConfirm").placeholder = r.value === "delete" ? "Type DELETE FOREVER" : "Type START FRESH"; }));
    box.querySelector(".cbGo").addEventListener("click", async (e) => {
      const mode = box.querySelector("input[type=radio]:checked").value, msg = box.querySelector(".cbMsg");
      e.target.disabled = true;
      try {
        const r = await api("", { action: "start_fresh", groups, mode, confirm: box.querySelector(".cbConfirm").value.trim() });
        msg.textContent = `${r.cleared ? `Done: ${r.cleared} cleared${r.file ? " and archived" : " for good"}` : "Nothing to clear"}${r.kept ? `; ${r.kept} kept (payments or live work)` : ""}.`;
        box.querySelector(".cbConfirm").value = ""; load(false);
      } catch (err) { msg.textContent = err.message; }
      e.target.disabled = false;
    });
  });
}
$("#freshGo").addEventListener("click", async (e) => {
  const groups = [...document.querySelectorAll(".freshG:checked")].map((c) => c.value);
  const mode = document.querySelector('input[name="freshMode"]:checked').value;
  e.target.disabled = true;
  try {
    const r = await api("", { action: "start_fresh", groups, mode, confirm: $("#freshConfirm").value.trim() });
    $("#freshMsg").textContent = r.file ? `Done: ${r.cleared} records cleared and archived.` : `Done: ${r.cleared} records deleted for good.`;
    if (r.kept) $("#freshMsg").textContent += ` ${r.kept} kept (payments or live work).`;
    $("#freshConfirm").value = ""; loadStan(); loadArchives();
  } catch (err) { $("#freshMsg").textContent = err.message; }
  e.target.disabled = false;
});
$("#archList").addEventListener("click", async (e) => {
  const name = e.target.dataset.arch; if (!name) return;
  try { await api("", { action: "archive_delete", name, confirm: $("#archConfirm").value.trim() }); $("#archConfirm").value = ""; loadArchives(); }
  catch (err) { $("#archList").insertAdjacentHTML("afterbegin", `<p class="muted" style="margin:0 0 .3rem">${esc(err.message)}</p>`); }
});
$("#stanGo").addEventListener("click", async (e) => {
  const text = $("#stanText").value.trim(); if (!text) { $("#stanMsg").textContent = "Write an instruction first."; return; }
  e.target.disabled = true; $("#stanMsg").textContent = "Stan is on it. Drafts appear below in a minute.";
  try { await api("", { action: "stan_instruct", text, dept: $("#stanDept").value, to: $("#stanTo").value }); $("#stanText").value = ""; setTimeout(() => { e.target.disabled = false; loadStan(); }, 45000); }
  catch (err) { e.target.disabled = false; $("#stanMsg").textContent = err.message; }
});
// Approve or reject several drafts at once, each with any edits made on its card.
const apChecked = () => [...document.querySelectorAll(".apSel:checked")].map((c) => c.closest("[data-apid]"));
function syncApBulk() {
  const n = apChecked().length;
  for (const id of ["apGoSel", "apNoSel"]) { $("#" + id).disabled = !n; delete $("#" + id).dataset.confirm; }
  $("#apGoSel").textContent = n ? `Approve ${n} & send` : "Approve selected";
  $("#apNoSel").textContent = n ? `Reject ${n}` : "Reject selected";
  $("#apAll").checked = n > 0 && n === document.querySelectorAll(".apSel").length;
}
$("#apAll").addEventListener("change", (e) => { document.querySelectorAll(".apSel").forEach((c) => (c.checked = e.target.checked)); syncApBulk(); });
$("#mailApprovals").addEventListener("change", (e) => { if (e.target.matches(".apSel")) syncApBulk(); });
for (const [id, approve] of [["apGoSel", true], ["apNoSel", false]]) $("#" + id).addEventListener("click", async (e) => {
  const cards = apChecked(); if (!cards.length) return;
  if (!e.target.dataset.confirm) { e.target.dataset.confirm = "1"; e.target.textContent = `Click again to ${approve ? "send" : "reject"} ${cards.length}`; return; }
  const items = cards.map((c) => ({ id: c.dataset.apid, subject: $("[data-apsubj]", c).value, text: $("[data-aptext]", c).value }));
  try {
    const r = await api("", { action: "mail_decide_bulk", approve, items });
    $("#apSelMsg").textContent = `${approve ? "Sent" : "Rejected"} ${r.done}${r.failed ? `; ${r.failed} failed: ${r.results.filter((x) => !x.ok).map((x) => x.error).join("; ")}` : ""}.`;
    loadStan();
  } catch (err) { $("#apSelMsg").textContent = err.message; syncApBulk(); }
});
$("#mailApprovals").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-apid]"); if (!card || !(e.target.dataset.apgo || e.target.dataset.apno)) return;
  e.target.disabled = true;
  try {
    await api("", { action: "mail_decide", id: card.dataset.apid, approve: Boolean(e.target.dataset.apgo), subject: $("[data-apsubj]", card).value, text: $("[data-aptext]", card).value });
    loadStan();
  } catch (err) { e.target.disabled = false; e.target.textContent = err.message; }
});

// ---- Stan's desk (read-only monitoring)
async function loadStan() {
  loadArchives(); loadCleanup();
  loadSecurity(); loadLibrary();
  let S; try { S = await api("?view=stan"); } catch { return; }
  STAN_D = S;
  $("#approvalCount").hidden = !S.approvals.length; $("#approvalCount").textContent = S.approvals.length;
  $("#approvalTotal").textContent = `${S.approvals.length} waiting`;
  $("#apBulk").hidden = S.approvals.length < 2; setTimeout(syncApBulk);
  if ($("#stanDept").options.length === 1) $("#stanDept").insertAdjacentHTML("beforeend", S.departments.map((d) => `<option value="${esc(d.id)}">${esc(d.address)} · ${esc(d.head)}</option>`).join(""));
  $("#stanInstrs").innerHTML = S.instructions.length ? `<details style="margin-top:.6rem"><summary class="sm" style="cursor:pointer"><b>Recent instructions</b></summary>${S.instructions.map((i) => `<div class="sm" style="margin:.4rem 0"><b>${esc(i.text.slice(0, 140))}</b> <span class="stage ${i.status === "drafted" ? "posted" : i.status === "error" || i.status === "needs you" ? "failed" : ""}">${esc(i.status)}</span> <span class="muted">${ago(i.at)}</span>${i.plan ? `<br>${esc(i.plan)}` : ""}${i.error ? `<br><span class="err">${esc(i.error)}</span>` : ""}${(i.questions || []).length ? `<br><b>Stan asks:</b> ${esc(i.questions.join(" · "))}` : ""}</div>`).join("")}</details>` : "";
  $("#mailApprovals").innerHTML = S.approvals.length ? S.approvals.map((e) => `<div class="ap pending" data-apid="${esc(e.id)}"><div class="meta"><input type="checkbox" class="apSel" aria-label="Select this email"> ${ago(e.at)} · From <b>${esc(e.from)}</b> → ${esc(e.to)}${e.cc ? ` · cc ${esc(e.cc)}` : ""}${e.bcc ? ` · bcc ${esc(e.bcc)}` : ""} · <span class="stage">${esc(e.kind)}</span></div>
      <input value="${esc(e.subject)}" data-apsubj style="margin:.4rem 0;font-weight:700">
      <textarea data-aptext style="min-height:9rem">${esc(e.text)}</textarea>
      ${e.cta ? `<p class="sm muted" style="margin:.3rem 0">Button: ${esc(e.cta.label)} → ${esc(e.cta.url)}</p>` : ""}
      ${e.qa ? `<div class="sm" style="margin:.3rem 0;padding:.4rem .6rem;border-radius:.5rem;background:${e.qa.pass ? "color-mix(in srgb,var(--ok) 10%,white)" : "color-mix(in srgb,var(--warn) 12%,white)"}"><b>${esc(e.qa.by || "QA")}: ${e.qa.pass ? "reconciled ✓" : "check before approving ✗"}</b> ${(e.qa.checks || []).map((c) => `${c.pass ? "✓" : "✗"} ${esc(c.check)}`).join(" · ")}</div>` : ""}
      <div class="row"><button class="btn ok" data-apgo="1">Approve &amp; send</button><button class="btn" data-apno="1">Reject</button></div></div>`).join("") : `<p class="muted">Nothing waiting. You're all caught up.</p>`;
  const day = (iso) => Date.now() - Date.parse(iso) < 864e5;
  const KIND = { team: "internal", payment: "payment confirmation", client: "client", kit: "free kit", owner: "to you" };
  $("#stanKpis").innerHTML = [
    ["In QA now", S.records.filter((r) => !r.final).length],
    ["Approved today", S.records.filter((r) => r.final?.approve && day(r.final.at)).length],
    ["Changes required today", S.reviews.filter((r) => day(r.at) && !r.pass).length],
    ["Sent by Stan today", S.sent.filter((e) => day(e.at)).length],
    ["Copied today", S.copied.filter((e) => day(e.at)).length],
    ["Escalated to you today", S.escalations.filter((e) => day(e.at)).length],
  ].map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v}</div></div>`).join("");
  const mail = (list, none) => list.length ? list.map((e) => `<details class="ap" style="padding:.6rem .8rem"><summary style="cursor:pointer"><b>${esc(e.subject)}</b> <span class="stage">${esc(KIND[e.kind] || e.kind)}</span><div class="muted sm">${ago(e.at)} · ${esc(e.from || "")} → ${esc(e.to)}${e.bcc ? ` · bcc ${esc(e.bcc)}` : ""} · ${esc(e.status)}</div></summary><pre class="sm" style="white-space:pre-wrap;margin:.4rem 0 0">${esc(e.text)}</pre></details>`).join("") : `<p class="muted">${none}</p>`;
  $("#stanSent").innerHTML = mail(S.sent, "Nothing sent yet.");
  $("#stanCopied").innerHTML = mail(S.copied, "No external emails yet.");
  $("#stanEsc").innerHTML = mail(S.escalations, "Nothing escalated.");
  $("#stanReviews").innerHTML = S.records.length ? S.records.map((r) => {
    const latest = (id) => [...r.rounds].reverse().find((x) => x.results[id])?.results[id];
    const state = r.final?.approve ? ["posted", "approved by Stan"] : r.final ? ["failed", "sent back by Stan"] : r.panel.every((p) => p.approved) ? ["", "awaiting Stan"] : ["", "in QA"];
    return `<details class="ap" style="padding:.6rem .8rem"><summary style="cursor:pointer"><b>${esc(r.task)}</b> <span class="stage ${state[0]}">${state[1]}</span><div class="muted sm">${esc(r.client || "")} · ${esc(r.department || "")} · ${r.rounds.length} round(s) · ${r.panel.map((p) => `${p.approved ? "✓" : "✗"} ${esc(p.name)}`).join(" · ")}</div></summary>
      ${r.panel.map((p) => { const l = latest(p.id); return `<div class="sm" style="margin:.5rem 0"><b>${esc(p.name)}</b> ${p.approved ? '<span class="stage posted">approved</span>' : '<span class="stage failed">changes required</span>'}<ul>${(l?.items || p.criteria.map((c) => ({ criterion: c, pass: false, evidence: "not reviewed yet" }))).map((i) => `<li>${i.pass ? "✓" : "✗"} ${esc(i.criterion)}<br><span class="muted">${esc(i.evidence || "")}${i.fix && !i.pass ? ` · Fix: ${esc(i.fix)}` : ""}</span></li>`).join("")}</ul></div>`; }).join("")}
      ${r.final ? `<div class="sm" style="border-top:1px solid var(--line);padding-top:.5rem"><b>Stan's decision:</b> ${esc(r.final.reason || "")}${r.final.issues?.length ? `<br>Issues: ${esc(r.final.issues.join("; "))}` : ""}${r.final.approve && r.final.subject ? `<br><b>Draft sent by the department head:</b> ${esc(r.final.subject)}<pre class="sm" style="white-space:pre-wrap;margin:.3rem 0 0">${esc(r.final.body || "")}</pre>` : ""}</div>` : ""}
    </details>`; }).join("") : `<p class="muted">No jobs reviewed yet.</p>`;
  const L = S.learning;
  if (L) {
    $("#learnBadge").textContent = `${L.totalRules || 0} rules · ${L.answerBankCount || 0} answers`;
    $("#learnKpis").innerHTML = [
      ["Learned rules", L.totalRules || 0],
      ["5★ exemplars", L.totalExemplars || 0],
      ["Answer bank", L.answerBankCount || 0],
      ["Recent events", (L.recentTrajectories || []).length],
    ].map(([k, v]) => `<div class="kpi"><small>${k}</small><div>${v}</div></div>`).join("");
    const dg = L.digests || {};
    $("#learnDigests").innerHTML = `${dg.daily ? `<details style="margin:.3rem 0"><summary style="cursor:pointer"><b>Daily digest (${esc(dg.daily.day)})</b></summary><ul>${(dg.daily.lines || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}${dg.weekly ? `<details style="margin:.3rem 0"><summary style="cursor:pointer"><b>Weekly consolidation (${esc(dg.weekly.week)})</b></summary><p class="muted" style="margin:.2rem 0">Answer bank: ${dg.weekly.answerBankCount || 0} verified answers</p></details>` : ""}`;
    $("#learnDepts").innerHTML = (L.departments || []).filter((d) => (d.rules || []).length || (d.exemplars || []).length).map((d) => `<details class="ap" style="padding:.5rem .7rem"><summary style="cursor:pointer"><b>${esc(d.dept)}</b>${d.head?.name ? ` · ${esc(d.head.name)}` : ""} <span class="stage">${(d.rules || []).length} rule(s)</span></summary><ul class="sm">${(d.rules || []).map((r) => `<li>${r.pinned ? "📌 " : ""}${esc(r.rule)} <span class="muted">(${esc(r.source || "learned")})</span></li>`).join("")}</ul></details>`).join("") || `<p class="muted sm">No distilled rules yet. Rules appear automatically as agents complete reviews or you pin them above.</p>`;
  }
}
$("#learnAdd")?.addEventListener("click", async () => {
  const note = $("#learnRule").value.trim();
  if (!note) { $("#learnMsg").textContent = "Write a rule to pin first."; return; }
  try {
    await api("", { action: "learning_rule", dept: $("#learnDept").value, note });
    $("#learnRule").value = "";
    $("#learnMsg").textContent = "Rule pinned to department playbook ✓";
    loadStan();
  } catch (err) { $("#learnMsg").textContent = err.message; }
});
$("#learnCons")?.addEventListener("click", async () => {
  try {
    const r = await api("", { action: "learning_consolidate" });
    $("#learnMsg").textContent = `Consolidated ${r.summary?.rules ?? 0} rules across departments ✓`;
    loadStan();
  } catch (err) { $("#learnMsg").textContent = err.message; }
});

// ---- marketing team: scheduler with platform previews, masters, repurposing
let M = null, mkDay = new Date().toISOString().slice(0, 10), mkEditing = null, mkPicked = false;
const MK_STATUS = { scheduled: "scheduled", planned: "scheduled", posting: "posting…", posted: "posted", failed: "failed", manual: "emailed to you", rejected: "blocked by review", cancelled: "cancelled" };
async function loadMarketing() {
  try { M = await api("?view=marketing"); renderMarketing(); } catch (err) { $("#mkMsg").textContent = err.message; }
}
const mkCh = (id) => M.channels.find((c) => c.id === id) || { name: id };
const nl = (t) => esc(t).replace(/\n/g, "<br>");
function preview(p) {
  const c = mkCh(p.channel), when = p.at.slice(11, 16) + " UTC", body = [p.text, p.shoutout, p.trace].filter(Boolean).join("\n\n");
  const text = mkEditing === p.id
    ? `<textarea class="pvedit" data-mkedittext="${p.id}">${esc(p.text)}</textarea><div class="pvcount">${p.trace ? "The hunt line is added below automatically." : ""}</div><div class="row"><button class="btn ok" data-mksave="${p.id}">Save</button><button class="btn" data-mkcancel-edit="1">Discard</button></div>`
    : null;
  let card;
  if (p.channel === "x") {
    card = `<div class="pv x"><div class="who"><span class="av brandav"><img src="/assets/logo.png" alt="Altradits"></span><div><b>Altradits</b> <span class="muted">@altradits · ${when}</span></div></div>
      ${text || `<div class="txt">${nl(body)}</div><div class="pvcount ${body.length > c.max + 20 ? "err" : ""}">${body.length}/280</div>`}
      <div class="acts">💬 &nbsp; 🔁 &nbsp; ♡ &nbsp; 📊</div></div>`;
  } else if (p.channel.startsWith("li_")) {
    const who = p.channel === "li_stan" ? ["S", "Stanley Chege Thuita", "Founder at Altradits"] : ["A", "Altradits", "Virtual assistance · Company page"];
    const cut = body.length > 210 && mkEditing !== p.id;
    card = `<div class="pv li"><div class="who">${p.channel === "li_co" ? '<span class="av brandav"><img src="/assets/logo.png" alt="Altradits"></span>' : `<span class="av">${who[0]}</span>`}<div><b>${who[1]}</b><div class="muted sm">${who[2]}<br>${when} · 🌐</div></div></div>
      ${text || `<div class="txt">${cut ? `${nl(body.slice(0, 210))}<span class="more">…see more</span><span class="rest" hidden>${nl(body.slice(210))}</span>` : nl(body)}</div>`}
      <div class="acts">👍 Like · 💬 Comment · 🔁 Repost · ✉ Send</div>
      ${p.link ? `<div class="cmt"><b>${who[1]}</b> · first comment<br>${esc(p.link)}</div>` : ""}</div>`;
  } else if (p.channel.startsWith("fb_")) {
    const who = p.channel === "fb_page" ? "Altradits" : "Stanley Chege Thuita";
    card = `<div class="pv fb"><div class="who">${p.channel === "fb_page" ? '<span class="av brandav"><img src="/assets/logo.png" alt="Altradits"></span>' : `<span class="av">${who[0]}</span>`}<div><b>${who}</b><div class="muted sm">${when} · 🌎</div></div></div>
      ${text || `<div class="txt">${nl(body)}</div>`}
      ${p.link ? `<div class="lp"><small>ALTRADITS.COM</small><b>Altradits: fixed-price jobs, done the same day</b></div>` : ""}
      <div class="acts">👍 Like · 💬 Comment · ↗ Share</div></div>`;
  } else if (p.channel === "ig") {
    card = `<div class="pv ig"><div class="who"><span class="av brandav"><img src="/assets/logo.png" alt="Altradits"></span><div><b>altradits</b><div class="muted sm">${when} · image post</div></div></div>
      ${text || `<div class="igimg">Image idea</div><div class="txt">${nl(body)}</div>`}<div class="acts">♡ &nbsp; 💬 &nbsp; ↗</div></div>`;
  } else {
    card = `<div class="pv tt"><div class="screen">${text || `<div class="txt">${nl(body)}</div>`}<div class="side">♥<br>💬<br>↗</div></div><div class="muted sm">${p.channel === "tt_stan" ? "@5tan_lee" : "@altradits"} · ${when} · video script</div></div>`;
  }
  const can = (s) => s.includes(p.status);
  return `<article class="pvwrap"><div class="pvhead"><b>${esc(c.name)}</b><span class="stage ${p.status}">${esc(MK_STATUS[p.status] || p.status)}</span></div>
    ${card}
    ${warmKit(p)}
    <div class="pvfoot">${p.format ? `<span class="muted sm">${esc(p.format)}</span>` : ""}
      ${["scheduled", "planned"].includes(p.status) ? `<span class="muted sm">${c.connected ? `Posts itself at ${when}` : c.mode === "manual" ? "Comes to your email that morning" : "Emailed to you unless connected by then"}</span>` : ""}
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">View post</a>` : ""}${p.error ? `<span class="err sm">${esc(p.error)}</span>` : ""}
      ${p.status === "rejected" && p.issues?.length ? `<span class="err sm">${esc(p.issues.join(" · "))}</span>` : ""}
      <div class="row">${can(["scheduled", "planned", "rejected", "failed", "manual"]) && mkEditing !== p.id ? `<button class="btn" data-mkedit="${p.id}">Edit</button>` : ""}
      ${can(["scheduled", "planned", "failed", "manual"]) && c.connected ? `<button class="btn ok" data-mkpost="${p.id}">Post now</button>` : ""}
      ${can(["scheduled", "planned", "manual", "failed", "rejected"]) ? `<button class="btn" data-mkcancel="${p.id}">Cancel</button>` : ""}
      <button class="btn" data-mkcopy="${p.id}">Copy</button></div></div></article>`;
}
// The warm-up kit for one post: search, real X posts to reply to, comments to leave.
function warmKit(p) {
  const w = p.warmup; if (!w) return "";
  const links = w.links || [];
  return `<details class="warm"${w.preparedAt && !["posted", "cancelled"].includes(p.status) ? " open" : ""}><summary>Warm-up kit${w.preparedAt ? " · ready" : ""}</summary>
    <p class="sm"><b>Search:</b> ${[...w.keywords, ...w.hashtags].map(esc).join(" · ")}${links.map((l) => ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</p>
    ${w.targets?.length ? `<p class="sm" style="margin:.4rem 0 .2rem"><b>Reply to these on X</b> (opens X with the reply filled in):</p>${w.targets.map((t) => `<div class="tgt"><div class="sm"><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.author)}</a>: ${esc(t.text.slice(0, 160))}</div><div class="sm"><i>${esc(t.reply)}</i></div><a class="btn ok" style="padding:.2rem .6rem;font-size:.8rem" href="${esc(t.replyUrl)}" target="_blank" rel="noopener">Reply on X</a></div>`).join("")}` : ""}
    <p class="sm" style="margin:.4rem 0 .2rem"><b>Comments to leave</b> on posts you find:</p>
    ${w.comments.map((c, i) => `<div class="cm"><span class="stage">${esc(c.style)}</span> ${esc(c.text)} <button class="btn" style="padding:.1rem .5rem;font-size:.78rem" data-mkcopywarm="${p.id}:${i}">Copy</button></div>`).join("")}
  </details>`;
}
function renderMarketing() {
  $("#mkState").textContent = !M.live ? "off: set ANTHROPIC_API_KEY" : M.settings.paused ? "paused" : "running";
  $("#mkPause").textContent = M.settings.paused ? "Resume posting" : "Pause posting";
  $("#mkErr").hidden = !M.lastError || Date.now() - Date.parse(M.lastError.at) > 864e5;
  $("#mkErr").textContent = M.lastError ? `Last problem (${ago(M.lastError.at)}): ${M.lastError.error}` : "";
  const h = M.hunt;
  $("#mkHunt").innerHTML = `<div class="kpi"><small>${esc(h.hashtag)} word this week</small><div style="font-size:1.3rem">${esc(h.word)}</div></div><div class="kpi"><small>Solved</small><div>${h.stats.solved}</div></div><div class="kpi"><small>Codes earned</small><div>${h.stats.earned}</div></div><div class="kpi"><small>Codes used</small><div>${h.stats.used}</div></div>
    <div class="kpi" style="grid-column:1/-1"><small>Shoutouts (approve before they're posted)</small><div style="font:500 .95rem Figtree,sans-serif">${h.shoutouts.length ? h.shoutouts.map((w) => `${esc(w.handle ? "@" + w.handle : "")}${w.handle && w.name ? " · " : ""}${esc(w.name || "")} ${w.approved ? '<span class="stage">approved: in the next post</span>' : `<button class="btn ok" style="padding:.1rem .5rem;font-size:.8rem" data-mkshoutok="${esc(w.claimId)}">Approve</button>`} <button class="btn" style="padding:.1rem .5rem;font-size:.8rem" data-mkshout="${esc(w.claimId)}">Remove</button>`).join(" &nbsp; ") : `<span class="muted">Nobody yet. Winners who opt in appear here, then in the next post with ${esc(h.hashtag)}.</span>`}</div></div>`;
  // First view: open the first day with posts still to go out.
  if (!mkPicked) mkDay = (M.days.slice(2).find((d) => d.posts.some((p) => ["scheduled", "planned"].includes(p.status))) || M.days[2]).date;
  $("#mkDayTabs").innerHTML = M.days.map((d) => { const n = d.posts.filter((p) => p.status !== "cancelled").length; const lbl = new Date(d.date + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); return `<button role="tab" data-mkday="${d.date}" aria-selected="${d.date === mkDay}">${lbl} <span class="muted">${n}</span></button>`; }).join("");
  const day = M.days.find((d) => d.date === mkDay) || M.days[2];
  $("#mkDay").innerHTML = day.posts.length ? day.posts.map(preview).join("") : `<p class="muted">Nothing scheduled for this day yet. The team fills the week automatically, or create a master below and repurpose it.</p>`;
  const opts = M.days.slice(2).map((d) => `<option value="${d.date}">${d.date}</option>`).join("");
  $("#mkMasters").innerHTML = M.masters.map((m) => `<div class="ap"><h3>${esc(m.title)} <span class="stage">${esc(m.status)}</span> <span class="muted sm">${m.by === "stanley" ? "your brief" : m.by === "plan" ? "written ahead" : "team"} · ${ago(m.createdAt)}</span></h3>
    <p style="margin:.4rem 0"><b>${esc(m.message)}</b></p><p class="muted sm" style="margin:0">For: ${esc(m.audience)}</p>
    <details><summary class="sm">Points, hooks and call to action</summary><ul>${m.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="sm"><b>Hooks:</b> ${m.hooks.map(esc).join(" · ")}</p><p class="sm"><b>Call to action:</b> ${esc(m.cta)}</p>${m.growthNote ? `<p class="sm muted">${esc(m.growthNote)}</p>` : ""}</details>
    ${m.scheduled?.length ? `<p class="sm muted" style="margin:.4rem 0 0">Scheduled: ${m.scheduled.join(", ")}</p>` : ""}
    <div class="row"><label class="sm">Start <select data-mkstart="${m.id}" style="width:auto">${opts}</select></label><label class="sm">Days <select data-mkdays="${m.id}" style="width:auto"><option>1</option><option>2</option><option>3</option></select></label><button class="btn primary" data-mkrep="${m.id}">Repurpose &amp; schedule</button></div></div>`).join("") || `<p class="muted">No masters yet.</p>`;
  $("#mkChannels").innerHTML = M.channels.map((c) => `<p style="margin:.3rem 0"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a> · ${esc(c.slots.join(", "))} UTC<br><span class="muted sm">${c.connected ? "✓ posts automatically" : c.mode === "manual" ? "No posting API: drafts come to your email" : `Not connected: set ${esc(c.env.join(", "))} in the hosting panel. Scheduled posts start going out as soon as you do.`}</span></p>`).join("");
  $("#mkWarmMail").textContent = M.settings.warmupEmails === false ? "Turn reminder emails on" : "Turn reminder emails off";
  const soon = M.days.flatMap((d) => d.posts).filter((p) => ["scheduled", "planned"].includes(p.status) && p.warmup && Date.parse(p.at) > Date.now() && Date.parse(p.at) - Date.now() < 3 * 3600e3);
  $("#mkEngage").innerHTML = soon.length ? soon.map((p) => `<div class="ap"><h3>${esc(mkCh(p.channel).name)} · drops at ${esc(p.at.slice(11, 16))} UTC</h3><p class="sm muted" style="margin:.2rem 0">${esc(p.text.slice(0, 180))}${p.text.length > 180 ? "…" : ""}</p>${warmKit({ ...p, warmup: { ...p.warmup, preparedAt: p.warmup.preparedAt || "soon" } })}</div>`).join("")
    : `<p class="muted">Nothing in the next 3 hours.</p>`;
  $("#mkReply").textContent = M.settings.autoReply === false ? "Turn replies on" : "Turn replies off";
  const ACT = { reply: "replied", escalate: "sent to you", ignore: "ignored" };
  $("#mkResponses").innerHTML = M.responses.length ? `<div style="overflow-x:auto"><table><thead><tr><th>When</th><th>Where</th><th>Comment</th><th>What Altradits did</th></tr></thead><tbody>${M.responses.map((r) => `<tr><td class="sm">${ago(r.at)}</td><td class="sm">${esc(mkCh(r.channel).name)}</td><td><b>${esc(r.author)}</b>: ${esc(r.comment)}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : ""}</td><td><span class="stage ${r.action === "escalate" ? "failed" : r.action === "reply" ? "posted" : ""}">${ACT[r.action]}</span>${r.reply ? `<div class="sm">${esc(r.reply)}</div>` : ""}<div class="muted sm">${esc(r.reason || "")}</div>${r.draft ? `<div class="sm"><i>Suggested: ${esc(r.draft)}</i></div>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No comments yet. Replies start once X, the Facebook Page or the LinkedIn company page is connected.</p>`;
  $("#mkTeam").innerHTML = M.team.map((m) => `<li><b>${esc(m.name)}</b>: ${esc(m.role)}</li>`).join("");
  $("#mkResults").innerHTML = M.channels.map((c) => { const r = M.results[c.id]; return `<tr><td>${esc(c.name)}</td><td>${r.posts}</td><td>${r.leads}</td><td>${r.paid}</td><td>${money(r.revenue)}</td></tr>`; }).join("");
}
$("#mkHunt").addEventListener("click", async (e) => {
  const ok = e.target.dataset.mkshoutok;
  if (ok) { try { await api("", { action: "mkt_shout_approve", id: ok }); loadMarketing(); } catch {} return; }
  const id = e.target.dataset.mkshout; if (!id) return;
  e.target.disabled = true;
  try { await api("", { action: "mkt_shout_remove", id }); loadMarketing(); } catch (err) { e.target.textContent = err.message; }
});
$("#mkWarmMail").addEventListener("click", async () => {
  try { await api("", { action: "mkt_warmmail", on: M.settings.warmupEmails === false }); loadMarketing(); } catch (err) { $("#mkMsg").textContent = err.message; }
});
// Copy buttons inside warm-up kits (scheduler and Engage now).
document.addEventListener("click", (e) => {
  const k = e.target.dataset?.mkcopywarm; if (!k || !M) return;
  const [id, i] = k.split(":");
  const p = M.days.flatMap((d) => d.posts).find((x) => x.id === id);
  navigator.clipboard?.writeText(p.warmup.comments[Number(i)].text).then(() => { e.target.textContent = "Copied ✓"; });
});
$("#mkReply").addEventListener("click", async () => {
  try { await api("", { action: "mkt_autoreply", on: M.settings.autoReply === false }); loadMarketing(); } catch (err) { $("#mkMsg").textContent = err.message; }
});
$("#mkPause").addEventListener("click", async () => {
  try { await api("", { action: "mkt_pause", paused: !M.settings.paused }); loadMarketing(); } catch (err) { $("#mkMsg").textContent = err.message; }
});
$("#mkNew").addEventListener("click", async (e) => {
  e.target.disabled = true; $("#mkMsg").textContent = "The team is writing a master (about a minute)…";
  try { await api("", { action: "mkt_master", brief: $("#mkBrief").value }); $("#mkBrief").value = ""; setTimeout(() => { e.target.disabled = false; $("#mkMsg").textContent = ""; loadMarketing(); }, 60000); }
  catch (err) { e.target.disabled = false; $("#mkMsg").textContent = err.message; }
});
$("#mkMasters").addEventListener("click", async (e) => {
  const id = e.target.dataset.mkrep; if (!id) return;
  e.target.disabled = true; e.target.textContent = "Repurposing… (1-2 minutes)";
  try { await api("", { action: "mkt_repurpose", id, start: $(`[data-mkstart="${id}"]`).value, days: $(`[data-mkdays="${id}"]`).value }); mkDay = $(`[data-mkstart="${id}"]`).value; mkPicked = true; setTimeout(loadMarketing, 100000); }
  catch (err) { e.target.disabled = false; e.target.textContent = err.message; }
});
$("#mkDayTabs").addEventListener("click", (e) => { const d = e.target.closest("[data-mkday]")?.dataset.mkday; if (d) { mkDay = d; mkPicked = true; mkEditing = null; renderMarketing(); } });
$("#mkDay").addEventListener("click", async (e) => {
  const d = e.target.dataset;
  if (e.target.classList.contains("more")) { e.target.hidden = true; e.target.nextElementSibling.hidden = false; return; }
  if (d.mkcancelEdit) { mkEditing = null; renderMarketing(); return; }
  const id = d.mkpost || d.mkcancel || d.mkcopy || d.mkedit || d.mksave;
  const post = id && M.days.flatMap((x) => x.posts).find((p) => p.id === id);
  if (!post) return;
  if (d.mkcopy) { navigator.clipboard?.writeText([post.text, post.shoutout, post.trace, post.link].filter(Boolean).join("\n\n")).then(() => { e.target.textContent = "Copied ✓"; }); return; }
  if (d.mkedit) { mkEditing = id; renderMarketing(); return; }
  e.target.disabled = true;
  try {
    if (d.mksave) { await api("", { action: "mkt_edit", id, text: $(`[data-mkedittext="${id}"]`).value }); mkEditing = null; }
    else await api("", { action: d.mkpost ? "mkt_post_now" : "mkt_cancel", id });
    loadMarketing();
  } catch (err) { e.target.disabled = false; e.target.textContent = err.message.slice(0, 120); }
});

async function load(navigate = true) {
  try {
    D = await api("?view=overview");
    $("#login").hidden = true; $("#app").hidden = false;
    render();
    if (!navigate) return;
    loadOps();
    if (location.hash === "#tasks") tab("tasks");
    if (location.hash === "#finance") tab("finance");
    loadCleanup();
    if (location.hash === "#marketing") tab("marketing");
    if (location.hash === "#stan") tab("stan"); else loadStan(); // approval count on the tab
    const h = location.hash.match(/^#(approval|lead)=(.+)$/);
    if (h?.[1] === "approval") { tab("approvals"); document.getElementById("ap-" + h[2])?.scrollIntoView(); }
    if (h?.[1] === "lead") openLead(h[2]);
  } catch (err) { if (!navigate) throw err; }
}
token ? load() : showLogin();

// Security watch (lib/attacks.js): counts per technique, recent events, what to improve, and the attack history.
async function loadSecurity() {
  let W; try { W = await api("?view=security"); } catch { return; }
  const T = W.techniques, kinds = Object.keys(T);
  const today = kinds.reduce((t, k) => t + W.counts[k].today, 0), week = kinds.reduce((t, k) => t + W.counts[k].week, 0);
  $("#secBadge").textContent = today ? `${today} today` : "quiet today";
  $("#secKpis").innerHTML = [["Today", today], ["Last 7 days", week], ...kinds.filter((k) => W.counts[k].week).sort((a, b) => W.counts[b].week - W.counts[a].week).slice(0, 4).map((k) => [T[k].name, W.counts[k].week])]
    .map(([k, v]) => `<div class="kpi"><small>${esc(k)}</small><div>${esc(v)}</div></div>`).join("");
  const s = W.solvency;
  $("#secSolvency").innerHTML = s ? `<b>Ye₿ente solvency</b> (${esc(ago(s.at))}): owed ${esc(sats(s.owedSats))} across ${esc(s.wallets)} wallets; the node can send ${s.outboundSats === null ? "an unknown amount" : esc(sats(s.outboundSats))}. ${s.covered === false ? '<span class="err"><b>Short: add outbound liquidity or pause buying.</b></span>' : s.covered ? "Covered." : ""}` : "";
  const sev = { high: "failed", medium: "", low: "posted" };
  $("#secEvents").innerHTML = W.events.length ? W.events.slice(0, 80).map((e) => `<div class="sm" style="border-bottom:1px solid var(--line);padding:.35rem 0"><span class="stage ${sev[T[e.kind]?.severity] || ""}">${esc(T[e.kind]?.name || e.kind)}</span> <span class="muted">${esc(ago(e.at))}${e.ip ? ` · conn ${esc(e.ip.slice(0, 8))}` : ""}</span><br>${esc(e.where)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ""}</div>`).join("") : '<p class="muted sm">Nothing turned away yet.</p>';
  $("#secTech").innerHTML = kinds.map((k) => `<div class="sm" style="margin:.5rem 0"><b>${esc(T[k].name)}</b> <span class="muted">(${esc(T[k].ref)}, ${esc(T[k].severity)}; ${esc(W.counts[k].week)} this week)</span><br>${esc(T[k].what)}<br><b>Improve:</b> ${esc(T[k].improve)}</div>`).join("");
  const st = { guarded: ["posted", "Guarded"], watch: ["", "Keep current"], action: ["failed", "Needs action"] };
  $("#secHistory").innerHTML = W.history.slice().sort((a, b) => a.year - b.year).map((a) => `<div class="sm" style="margin:.5rem 0"><span class="stage ${st[a.status][0]}">${st[a.status][1]}</span> <b>${esc(a.year)}: ${esc(a.name)}</b><br>${esc(a.what)}<br><b>Lesson:</b> ${esc(a.lesson)}<br><b>Our guard:</b> ${esc(a.guard)}</div>`).join("");
}

// Stan's library: open any document as a PDF in the viewer below (download or share from there).
async function loadLibrary() {
  if ($("#libList").dataset.loaded) return;
  let L; try { L = await api("?view=library"); } catch { return; }
  $("#libList").dataset.loaded = "1";
  const groups = [...new Set(L.docs.map((d) => d.group))];
  $("#libList").innerHTML = groups.map((g) => `<h3 style="font-size:1rem;margin:.8rem 0 .3rem">${esc(g)}</h3>${L.docs.filter((d) => d.group === g).map((d) => `<div class="sm" style="margin:.35rem 0"><button class="rcpt" data-libdoc="${esc(d.id)}" data-libtitle="${esc(d.title)}">${esc(d.title)}</button>${d.original ? ' <span class="stage">original</span>' : ""}<br><span class="muted">${esc(d.summary)}</span></div>`).join("")}`).join("");
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest?.("[data-libdoc]"); if (!b) return;
  const res = await fetch(`/api/admin?view=libdoc&id=${encodeURIComponent(b.dataset.libdoc)}`, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) { toast("Couldn't open that document.", true); return; }
  const name = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "altradits-document.pdf";
  const file = new File([await res.blob()], name, { type: "application/pdf" });
  if (rcptUrl) URL.revokeObjectURL(rcptUrl);
  rcptUrl = URL.createObjectURL(file);
  $("#rcptTitle").textContent = b.dataset.libtitle;
  $("#rcptView").src = rcptUrl;
  Object.assign($("#rcptDl"), { href: rcptUrl, download: file.name });
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));
  $("#rcptShare").hidden = !canShare;
  $("#rcptShare").onclick = () => navigator.share({ files: [file], title: b.dataset.libtitle }).catch(() => {});
  $("#rcptNote").textContent = "Made from the current code each time you open it.";
  $("#rcptBox").showModal();
});

// A receipt number anywhere in the admin opens that receipt: view, download, or
// share the PDF (WhatsApp, email or any app the device offers).
let rcptUrl = null;
document.addEventListener("click", async (e) => {
  const no = e.target.closest?.("[data-receipt]")?.dataset.receipt; if (!no) return;
  const res = await fetch(`/api/admin?view=receipt&no=${encodeURIComponent(no)}`, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) { toast("Couldn't open that receipt.", true); return; }
  const file = new File([await res.blob()], `altradits-receipt-${no}.pdf`, { type: "application/pdf" });
  if (rcptUrl) URL.revokeObjectURL(rcptUrl);
  rcptUrl = URL.createObjectURL(file);
  $("#rcptTitle").textContent = `Receipt ${no}`;
  $("#rcptView").src = rcptUrl;
  Object.assign($("#rcptDl"), { href: rcptUrl, download: file.name });
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));
  $("#rcptShare").hidden = !canShare;
  $("#rcptShare").onclick = () => navigator.share({ files: [file], title: `Receipt ${no}` }).catch(() => {});
  $("#rcptNote").textContent = canShare ? "Share sends the PDF to WhatsApp, email or any app on this device." : "To send it on WhatsApp, download it, then attach it in the chat.";
  $("#rcptBox").showModal();
});
$("#rcptClose").addEventListener("click", () => $("#rcptBox").close());
