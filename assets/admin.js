// The admin page's script: Stanley's node dashboard. Kept out of the HTML so
// the page's Content Security Policy allows only our own script files.
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Not shown inside a frame."); } // no clickjacking
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const satsF = (n) => (n === null || n === undefined ? "–" : `${Math.round(Number(n) || 0).toLocaleString("en-US")} sats`);
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const kpi = (label, v, warn) => `<div class="kpi${warn ? " warn" : ""}"><small>${esc(label)}</small><div>${esc(v)}</div></div>`;
let token = "";
try { token = sessionStorage.getItem("altra.admin") || ""; } catch {}

let toastTimer;
function toast(text, fail = false, ms = 2600) {
  const el = $("#toast");
  el.textContent = text; el.className = fail ? "fail" : ""; el.hidden = false;
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
async function api(path, body) {
  try {
    const res = await fetch("/api/admin" + path, { method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    if (res.status === 401) { showLogin(data.error); throw new Error(data.error); }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    throw new Error(err.message === "Failed to fetch" ? "No connection to the server. Check your internet and try again." : err.message);
  }
}
function showLogin(msg) { $("#app").hidden = true; $("#login").hidden = false; $("#loginErr").textContent = msg || ""; $("#tok").focus(); }
$("#login").addEventListener("submit", (e) => {
  e.preventDefault(); token = $("#tok").value.trim();
  try { sessionStorage.setItem("altra.admin", token); } catch {}
  load();
});
$("#logout").addEventListener("click", () => {
  try { sessionStorage.removeItem("altra.admin"); } catch {}
  token = ""; showLogin("Signed out on this device.");
});
$("#refresh").addEventListener("click", () => load());

// Node and chain: block height against the public tip, sync, peers and channels.
function renderNode(D) {
  const N = D.node;
  if (!N) { $("#nodeKpis").innerHTML = ""; $("#nodeNote").innerHTML = "The node isn't connected: set <code>LND_REST_URL</code> and the macaroons in DirectAdmin."; return; }
  if (N.error) { $("#nodeKpis").innerHTML = D.chainTip ? kpi("Chain tip (mempool.space)", D.chainTip.toLocaleString("en-US")) : ""; $("#nodeNote").textContent = N.error; return; }
  $("#nodeKpis").innerHTML = kpi("Block height", N.blockHeight.toLocaleString("en-US")) + kpi("Behind the tip", N.behind === null ? "–" : N.behind, N.behind > 2)
    + kpi("Synced to chain", N.synced ? "Yes" : "No", !N.synced) + kpi("Synced to graph", N.graphSynced ? "Yes" : "No", !N.graphSynced)
    + kpi("Channels active", `${N.activeChannels}${N.pendingChannels ? ` (+${N.pendingChannels} pending)` : ""}`, !N.activeChannels) + kpi("Peers", N.peers, !N.peers);
  $("#nodeNote").textContent = `${N.alias || "Your node"} · LND ${N.version}${N.network ? ` · ${N.network}` : ""}`;
}

// Ye₿ente and the settlement hooks: how payments reach the node and settle.
function renderSettlement(D) {
  const S = D.settlement, Y = D.yebente;
  $("#ybKpis").innerHTML = (Y && !Y.error ? kpi("Wallets", Y.wallets) + kpi("Owed to wallets", satsF(Y.owedSats)) + kpi("Node covers them", Y.covered === null ? "–" : Y.covered ? "Yes" : "No", Y.covered === false) : "")
    + kpi("Can send", satsF(D.liquidity.outboundSats)) + kpi("Can receive", satsF(D.liquidity.inboundSats)) + kpi("Open invoices", S.openInvoices);
  $("#hooks").innerHTML = [["Payments land on", S.mode], ["Ye₿ente wallets", S.wallets ? "on" : "off"], ["Lightning addresses (LNURL-pay)", S.lightningAddresses ? `${S.lightningAddresses} → ${S.lnurlp}` : "off"],
    ["Paid-invoice sweep", S.sweep], ["Payouts (send key)", S.payouts ? "set" : "not set"], ["Telebirr payouts", S.telebirr ? "on" : "off"]]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

function renderVisits(V) {
  if (!V) { $("#visits").innerHTML = '<p class="muted">No views counted yet.</p>'; return; }
  const max = Math.max(1, ...V.daily.map((d) => d.views));
  $("#visits").innerHTML = `<div class="kpis">${kpi("Views, 7 days", V.d7)}${kpi("Views, 30 days", V.d30)}</div>
    <div class="spark" aria-label="Views per day, last 14 days">${V.daily.map((d) => `<i title="${esc(d.day)}: ${d.views}" style="height:${Math.max(4, (d.views / max) * 100)}%"></i>`).join("")}</div>
    <table><thead><tr><th>Page</th><th>7 days</th><th>30 days</th></tr></thead><tbody>${Object.entries(V.byPage).sort((a, b) => b[1].d30 - a[1].d30).map(([p, v]) => `<tr><td>${esc(p)}</td><td>${v.d7}</td><td>${v.d30}</td></tr>`).join("")}</tbody></table>
    <p class="sm muted">Top sources: ${V.sources.map((s) => `${esc(s.source)} (${s.views})`).join(", ") || "none yet"}</p>`;
}

function renderStan(S) {
  $("#stanLast").textContent = S ? `Last report ${ago(S.at)}: “${S.subject}” (${S.status}).` : "No report sent yet. The first goes out tomorrow after 06:00 UTC.";
}
$("#stanGo").addEventListener("click", async () => {
  try { const r = await api("", { action: "stan_report" }); toast(r.status === "sent" ? "Stan's report is on its way." : `Report ${r.status}.`, r.status !== "sent"); renderStan({ at: new Date().toISOString(), subject: r.subject, status: r.status }); }
  catch (err) { toast(err.message, true, 6000); }
});

function renderSystem(D) {
  $("#system").innerHTML = `<dt>Email</dt><dd>${esc(D.system.email)}</dd><dt>Storage</dt><dd>${esc(D.system.storage)}</dd>`
    + (D.retired ? `<dt>Agency records</dt><dd>${esc(D.retired.removed)} moved out ${esc(ago(D.retired.at))}${D.retired.archive ? ` (archived as ${esc(D.retired.archive)})` : ""}</dd>` : "");
  $("#archives").innerHTML = D.archives.length ? D.archives.map((a) => `<div class="row sm"><span>${esc(a.name)} · ${esc(Math.round(a.bytes / 1024))} KB · ${esc(ago(a.at))}</span><button type="button" class="btn" data-archive="${esc(a.name)}">Delete</button></div>`).join("") : '<p class="muted sm">No archive files.</p>';
}
$("#archives").addEventListener("click", async (e) => {
  const name = e.target.closest("[data-archive]")?.dataset.archive; if (!name) return;
  const confirm = prompt(`Delete ${name} for good? Type DELETE to confirm.`); if (confirm === null) return;
  try { await api("", { action: "archive_delete", name, confirm }); toast("Archive deleted."); load(); } catch (err) { toast(err.message, true, 6000); }
});

// Sending power: spendable after channel reserves, what Ye₿ente owes, and node top-ups.
let spInfo = null, spPoll = null;
async function loadPower() {
  let P; try { P = await api("?view=liquidity"); } catch (err) { $("#spNote").textContent = err.message; return; }
  spInfo = P;
  $("#spNote").innerHTML = P.spendable < 1000 ? `<b class="err">The node can't send anything right now.</b> Ye₿ente payments out fail until you top up.`
    : !P.covered ? `<b class="err">Short:</b> wallets hold more than the node can send. Top up so every balance can be paid out.` : "Enough to pay out every Ye₿ente balance.";
  if (!$("#spSats").value && P.suggested) $("#spSats").value = P.suggested;
  $("#spSats").min = P.min; $("#spSats").max = P.max;
  $("#spPresets").innerHTML = P.presets.map((n) => `<button type="button" class="btn${n === P.suggested ? " primary" : ""}" data-sp="${n}">${esc(satsF(n))}${n === P.suggested ? " (suggested)" : ""}</button>`).join("");
  $("#spList").innerHTML = P.topups.length ? P.topups.map((t) => `<div class="sm">${esc(satsF(t.sats))} · ${esc(t.state)} <span class="muted">${esc(ago(t.at))}</span></div>`).join("") : '<p class="muted sm">No top-ups yet.</p>';
}
$("#spPresets").addEventListener("click", (e) => { const n = e.target.closest("[data-sp]")?.dataset.sp; if (n) $("#spSats").value = n; });
$("#spGo").addEventListener("click", async () => {
  $("#spErr").textContent = "";
  let T; try { T = await api("", { action: "node_topup", sats: Number($("#spSats").value) }); } catch (err) { $("#spErr").textContent = err.message; return; }
  $("#spInvoice").innerHTML = `<p class="sm"><b>Pay ${esc(satsF(T.sats))} to your node</b> from any Lightning wallet. This updates when it lands (the invoice works for an hour).</p>
    <div class="qr">${T.qr}</div>
    <textarea readonly rows="3" class="mono">${esc(T.bolt11)}</textarea>
    <div class="row"><button type="button" class="btn" id="spCopy">Copy invoice</button><a class="btn" href="lightning:${esc(T.bolt11)}">Open in wallet</a></div>
    <p class="sm" id="spState" role="status">Waiting for payment…</p>`;
  $("#spCopy").onclick = () => navigator.clipboard?.writeText(T.bolt11).then(() => toast("Invoice copied."));
  clearInterval(spPoll);
  spPoll = setInterval(async () => {
    let s; try { s = await api(`?view=topup&hash=${encodeURIComponent(T.hash)}`); } catch { return; }
    if (s.state === "paid") { clearInterval(spPoll); $("#spState").innerHTML = `<b class="ok">Paid ✓</b> ${esc(satsF(s.sats))} landed on the node.`; loadPower(); loadChannels(); }
    else if (s.state === "expired") { clearInterval(spPoll); $("#spState").textContent = "This invoice expired. Make a new one."; }
  }, 4000);
});

// Channels: alerts, balances, advice for the next channel, and the lessons log.
async function loadChannels() {
  let L; try { L = await api("?view=channels"); } catch (err) { $("#lnAlerts").textContent = err.message; return; }
  $("#lnAlerts").innerHTML = L.alerts.length ? L.alerts.map((a) => `<p class="alert ${a.level === "critical" ? "crit" : "warn"}"><b>${a.level === "critical" ? "Action needed" : "Heads-up"}:</b> ${esc(a.text)}</p>`).join("") : '<p class="ok"><b>All good:</b> enough inbound for what the node receives.</p>';
  const rows = [...L.channels, ...L.pending].map((c) => { const pct = c.capacity ? Math.round((c.local / c.capacity) * 100) : 0;
    return `<tr><td>${c.alias ? `<b>${esc(c.alias)}</b><br>` : ""}<code title="${esc(c.peer)}">${esc(c.peer.slice(0, 16))}…</code>${c.private ? " · private" : ""}</td><td>${satsF(c.capacity)}</td><td>${satsF(c.remote)}</td><td>${satsF(c.local)}</td><td><span class="bar"><i style="width:${pct}%"></i></span><small class="muted">${pct}% ours</small></td><td>${c.status ? esc(c.status) : c.active ? "Active" : '<b class="err">Offline</b>'}</td></tr>`; });
  $("#lnList").innerHTML = rows.length ? `<table><thead><tr><th>Peer</th><th>Capacity</th><th>Can receive</th><th>Ours</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : '<p class="muted">No channels yet.</p>';
  const A = L.advice;
  $("#lnAdvice").innerHTML = `<p><b>Suggested size: ${satsF(A.capacity)} of inbound.</b> ${esc(A.why)}</p>${A.fees ? `<p>${esc(A.fees)}</p>` : ""}<b>Avoid</b><ul>${A.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("#lnLessons").innerHTML = L.lessons.map((l) => `<li><b>${esc(l.at)}</b> ${esc(l.text)}</li>`).join("");
}
$("#lnAdd").addEventListener("click", async () => {
  try { await api("", { action: "ln_lesson", text: $("#lnLesson").value }); $("#lnLesson").value = ""; loadChannels(); } catch (err) { toast(err.message, true, 6000); }
});

// Security watch: what was turned away, and Bitcoin's attack history with our guards.
async function loadSecurity() {
  let W; try { W = await api("?view=security"); } catch { return; }
  const T = W.techniques, kinds = Object.keys(T);
  const today = kinds.reduce((t, k) => t + W.counts[k].today, 0), week = kinds.reduce((t, k) => t + W.counts[k].week, 0);
  $("#secKpis").innerHTML = kpi("Turned away today", today) + kpi("Last 7 days", week);
  const s = W.solvency;
  $("#secSolvency").innerHTML = s ? `<b>Ye₿ente solvency</b> (${esc(ago(s.at))}): owed ${esc(satsF(s.owedSats))} across ${esc(s.wallets)} wallets; the node can send ${esc(satsF(s.outboundSats))}. ${s.covered === false ? '<b class="err">Short.</b>' : s.covered ? "Covered." : ""}` : "";
  $("#secEvents").innerHTML = W.events.length ? W.events.slice(0, 40).map((e) => `<div class="sm ev"><b>${esc(T[e.kind]?.name || e.kind)}</b> <span class="muted">${esc(ago(e.at))}</span><br>${esc(e.where)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ""}</div>`).join("") : '<p class="muted sm">Nothing turned away yet.</p>';
  $("#secHistory").innerHTML = W.history.slice().sort((a, b) => a.year - b.year).map((a) => `<div class="sm ev"><b>${esc(a.year)}: ${esc(a.name)}</b><br>${esc(a.what)}<br><b>Lesson:</b> ${esc(a.lesson)}<br><b>Our guard:</b> ${esc(a.guard)}</div>`).join("");
}

async function loadEmails() {
  let E; try { E = await api("?view=emails"); } catch { return; }
  $("#emails").innerHTML = E.emails.length ? `<table><thead><tr><th>When</th><th>Kind</th><th>Subject</th><th>Status</th></tr></thead><tbody>${E.emails.slice(0, 40).map((e) => `<tr><td>${esc(ago(e.at))}</td><td>${esc(e.kind)}</td><td>${esc(e.subject)}</td><td>${esc(e.status)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No emails yet.</p>';
}

async function load() {
  let D;
  try { D = await api(""); } catch { return; }
  $("#login").hidden = true; $("#app").hidden = false;
  $("#checked").textContent = `Checked ${new Date().toLocaleTimeString()}`;
  renderStan(D.stan); renderNode(D); renderSettlement(D); renderVisits(D.visits); renderSystem(D);
  loadPower(); loadChannels(); loadSecurity(); loadEmails();
}
token ? load() : showLogin();
