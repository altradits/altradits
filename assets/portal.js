// The portal page's script (moved out of the HTML so the page's Content
// Security Policy can allow only our own script files).
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Not shown inside a frame."); } // no clickjacking
import { DEPARTMENTS } from "/data/playbooks.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const c = new URLSearchParams(location.search).get("c");
const LABEL = { new: "being assigned", assigned: "assigned", in_progress: "in progress", review: "ready for you", changes: "changes in progress", done: "done ✓", cancelled: "cancelled",
  queued: "in the queue", working: "being worked on", waiting_client: "question for you", owner: "final checks", follow_up: "done (we'll follow up)" };
let D = null;
const RATINGS = {};

async function api(body) {
  const res = await fetch(body ? "/api/portal" : `/api/portal?c=${encodeURIComponent(c)}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c, ...body }) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function onboardingForm() {
  const o = D.onboarding || {};
  return `<form class="card" id="onb"><h2>${D.onboarding ? "Your onboarding details" : "Start here: 3-minute onboarding"}</h2>
    <p class="note">This is how your assistant learns how you work. <b>Never type passwords here.</b> We use delegated access or a password-manager share.</p>
    <label>Top 3 priorities for the next month<textarea name="priorities">${esc(o.priorities)}</textarea></label>
    <label>Tools you use <small>(email, calendar, socials, store, docs…)</small><input name="tools" value="${esc(o.tools)}"></label>
    <label>How you'll grant access <small>(e.g. "delegate Gmail to the address we send", "Bitwarden share")</small><input name="access" value="${esc(o.access)}"></label>
    <label>Your voice <small>(3 words, or examples of messages you like)</small><input name="voice" value="${esc(o.voice)}"></label>
    <label>Your working hours and time zone<input name="hours" value="${esc(o.hours)}"></label>
    <label>Best way to reach you<select name="channel">${["Email", "WhatsApp", "Portal only"].map((x) => `<option ${(o.channel || (D.client.email ? "Email" : "Portal only")) === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    <label>Anything else<textarea name="notes">${esc(o.notes)}</textarea></label>
    <div class="row"><button class="btn primary">${D.onboarding ? "Update" : "Save and continue"}</button><span class="err" id="onbErr"></span></div></form>`;
}

function taskCard(t) {
  return `<div class="task ${t.status}"><h3>${esc(t.title)} <span class="st ${t.status}">${LABEL[t.status] || t.status}</span></h3>
    <div class="meta">${esc(DEPARTMENTS.find((d) => d.id === t.department)?.name || "")} · requested ${esc(t.createdAt.slice(0, 10))}${t.due ? ` · due ${esc(t.due)}` : ""}${t.hoursLogged ? ` · ${t.hoursLogged}h` : ""}</div>
    ${(t.messages || []).length ? `<details class="note" style="margin:.4rem 0"${t.status === "review" ? " open" : ""}><summary style="cursor:pointer"><b>Messages from us (${t.messages.length})</b></summary>${t.messages.slice().reverse().map((m) => `<div style="margin:.5rem 0"><b>${esc(m.subject)}</b> <span class="note">${new Date(m.at).toLocaleString()}</span><p style="white-space:pre-wrap;margin:.2rem 0">${esc(m.text)}</p></div>`).join("")}</details>` : ""}
    ${t.question ? `<div class="row" style="display:block"><p><b>Question for you:</b> ${esc(t.question)}</p>
      <input placeholder="Your answer" data-ans="${t.id}"><div class="row"><button class="btn primary" data-answer="${t.id}">Send answer</button></div></div>` : ""}
    ${t.deliverable ? `<p>${esc(t.deliverable.summary)}${t.deliverable.url ? `<br><a href="${esc(t.deliverable.url)}" target="_blank" rel="noopener">Open deliverable →</a>` : ""}</p>
      ${t.deliverable.files.length ? `<div class="files">${t.deliverable.files.map((f) => `<a class="btn" href="/api/portal?c=${encodeURIComponent(c)}&task=${t.id}&file=${f.i}">⬇ ${esc(f.name)}</a>`).join("")}</div>` : ""}
      ${t.deliverable.sources.length ? `<p class="note">Sources: ${t.deliverable.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc((() => { try { return new URL(u).hostname; } catch { return "source"; } })())}</a>`).join(", ")}</p>` : ""}` : ""}
    ${t.satisfaction ? `<p class="note">You rated this ${"★".repeat(t.satisfaction.rating)}${"☆".repeat(5 - t.satisfaction.rating)}</p>` : ""}
    ${t.status === "review" ? `<div class="row"><span>Rate it:</span><span class="stars" data-stars="${t.id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" data-for="${t.id}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</span>
      <input placeholder="Comment (optional)" data-cm="${t.id}" style="flex:1;min-width:10rem"><button class="btn ok" data-approve="${t.id}">Approve</button></div>
      <div class="row"><input placeholder="What should change?" data-cn="${t.id}" style="flex:1;min-width:12rem"><button class="btn" data-changes="${t.id}">Request changes</button></div>` : ""}
    <p class="err" data-err="${t.id}"></p></div>`;
}

function render() {
  const open = D.tasks.filter((t) => !["done", "cancelled"].includes(t.status));
  const done = D.tasks.filter((t) => t.status === "done");
  const pct = D.hours.plan ? Math.min(100, Math.round((D.hours.used / D.hours.plan) * 100)) : 0;
  $("#app").innerHTML = `<h1 style="font-size:1.7rem;margin-bottom:1.1rem">${D.client.orderName && !D.client.email ? `Your order <code>${esc(D.client.orderName)}</code>` : `Hi ${esc(D.client.name || "there")} 👋`}</h1>
    ${D.onboarding ? "" : onboardingForm()}
    <div class="grid"><div>
      <form class="card" id="newTask"><h2>Request a task</h2>
        <label>What do you need?<input name="title" maxlength="140" placeholder="e.g. Schedule next week's Instagram posts" required></label>
        <label>Details <small>(links, examples, who to contact)</small><textarea name="details"></textarea></label>
        <div class="fieldpair"><label>Department <small>(optional)</small><select name="department"><option value="">Let us route it</option>${DEPARTMENTS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label>
        <label>Due date <small>(optional)</small><input type="date" name="due"></label></div>
        <div class="row"><button class="btn primary">Send request</button><span class="err" id="taskErr"></span></div></form>
      <div class="card soft"><h2>Your tasks</h2>${open.map(taskCard).join("") || '<p class="muted">No open tasks. Request one above.</p>'}
        ${done.length ? `<details><summary>Done (${done.length})</summary>${done.map(taskCard).join("")}</details>` : ""}</div>
    </div><div>
      <div class="card soft"><h2>Hours this month</h2>
        ${D.hours.plan ? `<div class="meter"><i style="width:${pct}%"></i></div><p><b>${D.hours.used}h</b> of ${D.hours.plan}h used</p>` : `<p><b>${D.hours.used}h</b> logged this month</p>`}
        <p class="note">Hours are logged when you approve a task.</p></div>
      <div class="card ref"><h2>Refer a business, earn ${D.referral.pct}%</h2>
        <p>Share your link. When they become a client, you get ${D.referral.pct}% of their first month as credit.</p>
        <code id="refUrl">${esc(D.referral.url)}</code>
        <div class="row"><button class="btn" id="copyRef">Copy link</button>
        <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("I use Altradits for my admin and social media. They're great: " + D.referral.url)}">Share on WhatsApp</a></div>
        ${D.referral.creditUsd ? `<p>Your credit: <b>$${D.referral.creditUsd}</b></p>` : ""}</div>
      ${D.onboarding ? `<details class="card soft"><summary>Onboarding details</summary>${onboardingForm().replace('class="card"', 'class=""')}</details>` : ""}
    </div></div>`;
}

async function load() {
  try { D = await api(); render(); }
  catch (err) { $("#app").innerHTML = `<h1 style="font-size:1.5rem">Portal unavailable</h1><p>${esc(err.message)}</p>`; }
}

document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "onb") {
    e.preventDefault();
    const body = { action: "onboarding" };
    for (const k of ["priorities", "tools", "access", "voice", "hours", "channel", "notes"]) body[k] = f[k].value;
    try { D = await api(body); render(); } catch (err) { $("#onbErr").textContent = err.message; }
  } else if (f.id === "newTask") {
    e.preventDefault();
    try {
      D = await api({ action: "task", title: f.title.value, details: f.details.value, department: f.department.value, due: f.due.value });
      render();
    } catch (err) { $("#taskErr").textContent = err.message; }
  }
});
document.addEventListener("click", async (e) => {
  if (e.target.dataset.star) {
    const id = e.target.dataset.for, n = Number(e.target.dataset.star);
    RATINGS[id] = n;
    document.querySelectorAll(`[data-for="${id}"]`).forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= n));
    return;
  }
  if (e.target.dataset.answer) {
    const id = e.target.dataset.answer;
    try { D = await api({ action: "answer", task: id, answer: document.querySelector(`[data-ans="${id}"]`).value }); render(); }
    catch (err) { document.querySelector(`[data-err="${id}"]`).textContent = err.message; }
    return;
  }
  const a = e.target.dataset.approve, ch = e.target.dataset.changes;
  if (e.target.id === "copyRef") {
    try { await navigator.clipboard.writeText(D.referral.url); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select the link above"; }
    return;
  }
  if (!a && !ch) return;
  const id = a || ch;
  try {
    D = await api(a ? { action: "approve", task: id, rating: RATINGS[id], comment: document.querySelector(`[data-cm="${id}"]`)?.value || "" }
      : { action: "changes", task: id, note: document.querySelector(`[data-cn="${id}"]`).value });
    render();
  } catch (err) { document.querySelector(`[data-err="${id}"]`).textContent = err.message; }
});
load();
