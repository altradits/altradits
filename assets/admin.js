// The admin page's script: Stanley's node dashboard, built to learn from. Every
// reading says what it means and what good looks like ("Explain everything").
// Kept out of the HTML so the page's Content Security Policy allows only our own script files.
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Not shown inside a frame."); } // no clickjacking
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const satsF = (n) => (n === null || n === undefined ? "–" : `${num(n)} sats`);
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
// One reading: label, value, state ("good", "warn" or none) and what it means.
const kpi = (label, v, state, why) => `<div class="kpi${state ? ` ${state}` : ""}"><small>${esc(label)}</small><div>${esc(v)}</div>${why ? `<span class="why">${esc(why)}</span>` : ""}</div>`;
const judge = (ok) => (ok === null || ok === undefined ? "" : ok ? "good" : "warn");
let token = "";
try { token = sessionStorage.getItem("altra.admin") || ""; } catch {}

// "Explain everything": on by default, remembered on this device.
try { if (localStorage.getItem("altra.explain") === "off") { $("#explain").checked = false; document.body.classList.add("quiet"); } } catch {}
$("#explain").addEventListener("change", (e) => {
  document.body.classList.toggle("quiet", !e.target.checked);
  try { localStorage.setItem("altra.explain", e.target.checked ? "on" : "off"); } catch {}
});

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
// When signed in already, show the login card with a loading note until the first data arrives.
if (token) { $("#login").hidden = false; }
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

// Today's checklist: what an operator checks daily. true = fine, false = act, null = only Stanley can check.
function renderChecklist(D, L) {
  const N = D.node && !D.node.error ? D.node : null, Y = D.yebente && !D.yebente.error ? D.yebente : null, chain = D.details?.onchain;
  const items = [
    [N ? N.synced && (N.behind ?? 0) <= 2 : false, "Node in step with the chain", N ? `Block ${num(N.blockHeight)}, ${N.behind ?? "?"} behind the tip.` : "The website can't read the node."],
    [N ? N.activeChannels > 0 : false, "At least one channel active", N ? `${N.activeChannels} active. With none, Lightning payments can't move.` : "Unknown until the node can be read."],
    [Y ? Y.covered : null, "Node can pay every Ye₿ente wallet", Y ? `Owed ${satsF(Y.owedSats)}; can send ${satsF(D.liquidity.outboundSats)}.` : "Wallets are off, or the balance can't be read."],
    [chain ? chain.confirmed >= 10_000 : null, "Some sats on-chain for emergencies", chain ? `${satsF(chain.confirmed)} on-chain. Keep about 10,000+ to pay fees if a channel ever closes by force.` : "Needs the read-only key to check."],
    [D.stan ? Date.now() - Date.parse(D.stan.at) < 36 * 3600e3 : null, "Stan's report arrived", D.stan ? `Last one ${ago(D.stan.at)}.` : "The first goes out tomorrow morning."],
    [null, "Channel backup copied off this machine", "After every channel opens or closes, copy channel.backup to a safe place. With your 24 words, it gets your channel funds back."],
    [null, "24 recovery words safe on paper", "Never typed into a website or a phone. Only the node's own setup asks for them."],
  ];
  $("#checklist").innerHTML = items.map(([ok, title, why]) => `<li><span class="m ${ok === null ? "u" : ok ? "y" : "n"}" aria-label="${ok === null ? "check yourself" : ok ? "fine" : "needs attention"}">${ok === null ? "○" : ok ? "✓" : "✗"}</span><span><b>${esc(title)}</b><br><span class="sm muted">${esc(why)}</span></span></li>`).join("");
}

// 1. Node and chain: block height against the public tip, sync, peers and channels.
function renderNode(D) {
  const N = D.node;
  if (!N) { $("#nodeKpis").innerHTML = ""; $("#nodeNote").innerHTML = "The node isn't connected: set <code>LND_REST_URL</code> and the macaroons in DirectAdmin."; return; }
  if (N.error) { $("#nodeKpis").innerHTML = D.chainTip ? kpi("Chain tip (mempool.space)", num(D.chainTip), "", "The newest block the rest of the world sees.") : ""; $("#nodeNote").textContent = N.error; return; }
  $("#nodeKpis").innerHTML =
      kpi("Block height", num(N.blockHeight), "", "How many blocks your node has checked since 2009.")
    + kpi("Chain tip", D.chainTip ? num(D.chainTip) : "–", "", "The newest block, as mempool.space sees it.")
    + kpi("Behind the tip", N.behind ?? "–", judge(N.behind === null ? null : N.behind <= 2), "Good: 0–2. More means it's catching up or offline.")
    + kpi("Synced to chain", N.synced ? "Yes" : "No", judge(N.synced), "LND agrees with Bitcoin Core's newest block. Needed to pay safely.")
    + kpi("Synced to graph", N.graphSynced ? "Yes" : "No", judge(N.graphSynced), "LND knows the public map of channels. Needed to find routes when sending.")
    + kpi("Channels active", `${N.activeChannels}${N.pendingChannels ? ` (+${N.pendingChannels} opening)` : ""}`, judge(N.activeChannels > 0), "Channels whose peer is online right now.")
    + kpi("Peers", N.peers, judge(N.peers > 0), "Nodes you're connected to. A channel works only while its peer is connected.");
  $("#nodeNote").textContent = `${N.alias || "Your node"} · LND ${N.version}${N.network ? ` · ${N.network}` : ""}`;
}

// 2. Each channel drawn as one strip: their side, your locked reserve, what you can spend.
function drawChannels(L) {
  $("#chanDraw").innerHTML = L.channels.map((c) => {
    const reserve = Math.min(c.local, c.localReserve || 0), spend = Math.max(0, c.local - reserve), pct = (n) => (c.capacity ? (n / c.capacity) * 100 : 0);
    return `<div class="chan"><div class="sm"><b>${esc(c.alias || "Channel")}</b> · ${satsF(c.capacity)} in total${c.private ? " · private" : ""}${c.active ? "" : ' · <b class="err">offline</b>'}</div>
      <div class="strip" role="img" aria-label="You can send ${num(spend)} sats, ${num(reserve)} locked as reserve, you can receive ${num(c.remote)} sats">
        <span class="mine" style="width:${pct(spend)}%">${pct(spend) > 12 ? `send ${num(spend)}` : ""}</span><span class="res" style="width:${pct(reserve)}%"></span><span class="theirs" style="width:${pct(c.remote)}%">${pct(c.remote) > 12 ? `receive ${num(c.remote)}` : ""}</span>
      </div>
      <div class="key"><span><b style="background:var(--btc)"></b>You can send: ${satsF(spend)}</span><span><b class="res" style="background:#d9dee6"></b>Your reserve (locked): ${satsF(reserve)}</span><span><b style="background:#cfe0f3"></b>You can receive: ${satsF(c.remote)}</span></div>
      <p class="why sm muted">Paying someone moves sats from orange to blue. Getting paid moves them back. A top-up is getting paid by yourself.</p></div>`;
  }).join("");
}

// 4. On-chain wallet and chain fees.
function renderChain(D) {
  const C = D.details?.onchain, F = D.chainFees;
  $("#chainKpis").innerHTML =
      kpi("On-chain balance", C ? satsF(C.confirmed) : "–", C ? judge(C.confirmed >= 10_000) : "", C ? "Sats in the node's own Bitcoin wallet. Used to open channels and pay closing fees." : "Needs the read-only key.")
    + (C?.unconfirmed ? kpi("Waiting to confirm", satsF(C.unconfirmed), "", "Arrived but not yet in a block.") : "")
    + kpi("Fee now: fast", F ? `${F.fast} sat/vB` : "–", "", "Into the next block or two.")
    + kpi("Fee now: slow", F ? `${F.slow} sat/vB` : "–", "", "Within about an hour. Best for opening channels.");
}

// 5. Routing: fee policy per channel, and what passed through the node.
function renderRouting(D) {
  const R = D.details;
  $("#routeKpis").innerHTML =
      kpi("Forwarded, 30 days", R?.forwards ? `${R.forwards.count}` : "–", "", "Payments that passed through your node for others.")
    + kpi("Volume forwarded", R?.forwards ? satsF(R.forwards.volumeSats) : "–", "", "Their total size.")
    + kpi("Earned, 30 days", R?.earned ? satsF(R.earned.month) : "–", "", "Routing fees your node collected.");
  $("#feeList").innerHTML = R?.fees?.length ? `<table><thead><tr><th>Channel</th><th>Base fee</th><th>Rate</th><th>On 100,000 sats</th></tr></thead><tbody>${R.fees.map((f) =>
    `<tr><td><code>${esc(f.point.slice(0, 12))}…</code></td><td>${esc(num(f.baseMsat / 1000))} sat</td><td>${esc(f.ppm)} ppm</td><td>${esc((f.baseMsat / 1000 + (100_000 * f.ppm) / 1e6).toFixed(2))} sats</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">Fee policy needs the read-only key.</p>';
}

// 6. Ye₿ente and the settlement hooks: how payments reach the node and settle.
function renderSettlement(D) {
  const S = D.settlement, Y = D.yebente;
  $("#ybKpis").innerHTML = (Y && !Y.error ? kpi("Wallets", Y.wallets, "", "Ye₿ente wallets on this node.") + kpi("Owed to wallets", satsF(Y.owedSats), "", "What all wallets hold: sats the node owes.")
      + kpi("Node covers them", Y.covered === null ? "–" : Y.covered ? "Yes" : "No", judge(Y.covered), "Can send must be at least what's owed.") : "")
    + kpi("Can send", satsF(D.liquidity.outboundSats), "", "Your side of active channels, minus reserves.")
    + kpi("Can receive", satsF(D.liquidity.inboundSats), "", "Their side: room for incoming payments.")
    + kpi("Open invoices", S.openInvoices, "", "Asked for but not yet paid. Expired ones are cleared.");
  $("#hooks").innerHTML = [["Payments land on", S.mode], ["Ye₿ente wallets", S.wallets ? "on" : "off"], ["Lightning addresses (LNURL-pay)", S.lightningAddresses ? `${S.lightningAddresses} → ${S.lnurlp}` : "off"],
    ["Paid-invoice sweep", S.sweep], ["Payouts (send key)", S.payouts ? "set" : "not set"], ["Telebirr payouts", S.telebirr ? "on" : "off"]]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

// The words node operators use, in plain English.
const GLOSSARY = [
  ["Node", "A computer running Bitcoin software that checks every rule itself, instead of trusting anyone."],
  ["Bitcoin Core (bitcoind)", "The program that downloads and verifies the blockchain. LND asks it about blocks."],
  ["LND", "Lightning Network Daemon: the program that runs your Lightning channels and payments."],
  ["Block, block height", "A batch of transactions, about every 10 minutes. Height is how many blocks exist."],
  ["Mempool", "Transactions waiting for a block. When it's full, fees rise."],
  ["sat/vB", "Fee per unit of transaction size. Higher pays to be confirmed sooner."],
  ["Channel", "Bitcoin locked between two nodes so they can pay each other instantly, many times."],
  ["Capacity", "The channel's total. It only changes when the channel is opened or closed."],
  ["Local and remote balance", "Your side (what you can send) and their side (what you can receive)."],
  ["Inbound and outbound liquidity", "Room to receive (inbound) and to send (outbound), across all channels."],
  ["Channel reserve", "About 1% each side must keep. If someone cheats, there is something to take."],
  ["Invoice (BOLT11)", "A one-time payment request: amount, your node and a payment hash. Starts with lnbc."],
  ["Payment hash and preimage", "The invoice holds a hash; paying reveals the secret behind it. That's the receipt."],
  ["HTLC", "A payment in flight, locked by the hash, passed hop by hop. It settles or fails, never half."],
  ["Route, hop", "The path of channels a payment takes. Each node on it is one hop."],
  ["Private channel, route hints", "Not announced to the network. Your invoices carry hints so payers can still find you."],
  ["Base fee, ppm", "A router's price: a fixed fee per payment plus parts per million of the amount."],
  ["LNURL-pay, Lightning address", "name@domain: wallets look it up and ask your node for a fresh invoice."],
  ["Macaroon", "A permission key for LND. Invoice-only can't spend; read-only can't change anything; admin can do everything and never leaves the node."],
  ["Cooperative close", "Both sides agree to close; money returns on-chain quickly and cheaply."],
  ["Force close", "One side closes alone. Funds wait about two weeks, and fees are higher."],
  ["Anchor outputs", "Small outputs that let you add fee to a force close later. That's why on-chain sats matter."],
  ["channel.backup (SCB)", "A file that, with your 24 words, lets your peers return your channel funds after a disaster."],
  ["Seed (24 words)", "The master key to the node's wallet. Paper only. Anyone with it can take the funds."],
  ["Custodial", "Someone else holds the keys. Ye₿ente is custodial: your node holds its users' sats."],
];
function renderGlossary() {
  $("#glossary").innerHTML = GLOSSARY.map(([t, d]) => `<details><summary>${esc(t)}</summary><p>${esc(d)}</p></details>`).join("");
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

// 3. Sending power: spendable after channel reserves, what Ye₿ente owes, and node top-ups.
let spPoll = null;
async function loadPower() {
  let P; try { P = await api("?view=liquidity"); } catch (err) { $("#spNote").textContent = err.message; return; }
  $("#spNote").innerHTML = P.spendable < 1000 ? `<b class="err">The node can't send anything right now.</b> Ye₿ente payments out fail until you top up.`
    : !P.covered ? `<b class="err">Short:</b> wallets hold more than the node can send. Top up so every balance can be paid out.` : `Can send ${esc(satsF(P.spendable))}: enough to pay out every Ye₿ente balance.`;
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

// 2. Channels: the picture, alerts, the table, advice for the next channel, and the lessons log.
async function loadChannels() {
  let L; try { L = await api("?view=channels"); } catch (err) { $("#lnAlerts").textContent = err.message; return; }
  drawChannels(L);
  $("#lnAlerts").innerHTML = L.alerts.length ? L.alerts.map((a) => `<p class="alert ${a.level === "critical" ? "crit" : "warn"}"><b>${a.level === "critical" ? "Action needed" : "Heads-up"}:</b> ${esc(a.text)}</p>`).join("") : '<p class="ok"><b>All good:</b> enough inbound for what the node receives.</p>';
  const rows = [...L.channels, ...L.pending].map((c) => { const pct = c.capacity ? Math.round((c.local / c.capacity) * 100) : 0;
    return `<tr><td>${c.alias ? `<b>${esc(c.alias)}</b><br>` : ""}<code title="${esc(c.peer)}">${esc(c.peer.slice(0, 16))}…</code>${c.private ? " · private" : ""}</td><td>${satsF(c.capacity)}</td><td>${satsF(c.remote)}</td><td>${satsF(c.local)}</td><td><span class="bar"><i style="width:${pct}%"></i></span><small class="muted">${pct}% ours</small></td><td>${c.status ? esc(c.status) : c.active ? "Active" : '<b class="err">Offline</b>'}</td></tr>`; });
  $("#lnList").innerHTML = rows.length ? `<table><thead><tr><th>Peer</th><th>Capacity</th><th>Can receive</th><th>Ours</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : '<p class="muted">No channels yet.</p>';
  const A = L.advice;
  $("#lnAdvice").innerHTML = `<p><b>Suggested size for your next channel: ${satsF(A.capacity)} of inbound.</b> ${esc(A.why)}</p>${A.fees ? `<p>${esc(A.fees)}</p>` : ""}<b>Avoid</b><ul>${A.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("#lnLessons").innerHTML = L.lessons.map((l) => `<li><b>${esc(l.at)}</b> ${esc(l.text)}</li>`).join("");
}
$("#lnAdd").addEventListener("click", async () => {
  try { await api("", { action: "ln_lesson", text: $("#lnLesson").value }); $("#lnLesson").value = ""; loadChannels(); } catch (err) { toast(err.message, true, 6000); }
});

// 7. Security watch: what was turned away, and Bitcoin's attack history with our guards.
async function loadSecurity() {
  let W; try { W = await api("?view=security"); } catch { return; }
  const T = W.techniques, kinds = Object.keys(T);
  const today = kinds.reduce((t, k) => t + W.counts[k].today, 0), week = kinds.reduce((t, k) => t + W.counts[k].week, 0);
  $("#secKpis").innerHTML = kpi("Turned away today", today, "", "Every one was blocked. Counts show who's trying.") + kpi("Last 7 days", week);
  const s = W.solvency;
  $("#secSolvency").innerHTML = s ? `<b>Ye₿ente solvency</b> (${esc(ago(s.at))}): owed ${esc(satsF(s.owedSats))} across ${esc(s.wallets)} wallets; the node can send ${esc(satsF(s.outboundSats))}. ${s.covered === false ? '<b class="err">Short.</b>' : s.covered ? "Covered." : ""}` : "";
  $("#secEvents").innerHTML = W.events.length ? W.events.slice(0, 40).map((e) => `<div class="sm ev"><b>${esc(T[e.kind]?.name || e.kind)}</b> <span class="muted">${esc(ago(e.at))}</span><br>${esc(e.where)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ""}</div>`).join("") : '<p class="muted sm">Nothing turned away yet.</p>';
  $("#secHistory").innerHTML = W.history.slice().sort((a, b) => a.year - b.year).map((a) => `<div class="sm ev"><b>${esc(a.year)}: ${esc(a.name)}</b><br>${esc(a.what)}<br><b>Lesson:</b> ${esc(a.lesson)}<br><b>Our guard:</b> ${esc(a.guard)}</div>`).join("");
}

// Ye₿ente activity: deposits and transactions per wallet, most active first.
async function loadActivity() {
  let A; try { A = await api(`?view=activity&days=${encodeURIComponent($("#actDays").value)}`); } catch (err) { $("#actList").textContent = err.message; return; }
  const T = A.total;
  $("#actKpis").innerHTML = kpi("Active wallets", `${A.active} of ${A.wallets}`, "", "Wallets with at least one completed transaction in the period.")
    + kpi("Deposits", `${num(T.deposits)} · ${satsF(T.depositSats)}`, "", "Sats received from outside: Lightning and M-Pesa buys.")
    + kpi("Sent out", `${num(T.sends)} · ${satsF(T.sentSats)}`, "", "Payments that left Ye₿ente: Lightning and M-Pesa.")
    + kpi("Transfers", num(T.transfers), "", "Wallet-to-wallet, counted once for each side.");
  $("#actList").innerHTML = A.top.length ? `<table><thead><tr><th>#</th><th>Wallet</th><th>Transactions</th><th>Deposits</th><th>Sent</th><th>Transfers</th><th>Last active</th></tr></thead><tbody>${A.top.map((r, i) =>
    `<tr><td>${i + 1}</td><td><b>${esc(r.handle)}</b>@altradits.com</td><td>${num(r.transactions)}</td><td>${num(r.deposits)} · ${esc(satsF(r.depositSats))}</td><td>${num(r.sends)} · ${esc(satsF(r.sentSats))}</td><td>${num(r.transfers)}</td><td>${esc(ago(r.lastAt))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No completed transactions in this period.</p>';
}
$("#actDays").addEventListener("change", loadActivity);

// Money received through the website: totals, by month, every payment, and a CSV for the books.
async function loadMoney() {
  let S; try { S = await api("?view=statement"); } catch (err) { $("#moneyList").textContent = err.message; return; }
  $("#moneyKpis").innerHTML = kpi("Total received", satsF(S.total.sats), "", `${S.total.count} payment${S.total.count === 1 ? "" : "s"}.`)
    + kpi("Orders", satsF(S.orders.sats), "", `${S.orders.count}, before the agency moved out.`) + kpi("Donations", satsF(S.donations.sats), "", `${S.donations.count}.`)
    + kpi("Support (/donate)", satsF(S.support.sats), "", `${S.support.count}, paid to your node.`);
  $("#moneyList").innerHTML = S.payments.length ? `<table><thead><tr><th>Date</th><th>What</th><th>Sats</th><th>Via</th><th>Receipt</th></tr></thead><tbody>${S.payments.map((x) =>
    `<tr><td>${esc(String(x.at).slice(0, 10))}</td><td>${esc(x.what)}${x.payer ? `<br><span class="muted sm">${esc(x.payer)}</span>` : ""}</td><td>${esc(num(x.sats))}</td><td>${esc(x.channel)}</td><td>${esc(x.receipt || "")}</td></tr>`).join("")}</tbody></table>`
    + (S.months.length ? `<p class="sm muted">By month: ${S.months.map((m) => `${esc(m.month)} ${esc(satsF(m.sats))}`).join(" · ")}</p>` : "") : '<p class="muted sm">No payments recorded.</p>';
}
async function download(path, name) {
  const res = await fetch("/api/admin" + path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) { toast("Couldn't download that.", true); return; }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#moneyCsv").addEventListener("click", () => download("?view=statement&format=csv", `altradits-statement-${new Date().toISOString().slice(0, 10)}.csv`));

// Stanley's first CV (23 Oct 2026), and the CV file he uploaded, if it's still on the server.
let cvMd = "", cvNow = "", cvExt = "";
async function loadCv() {
  let C; try { C = await api("?view=cv"); } catch { return; }
  cvMd = C.initial; $("#cvText").textContent = C.initial;
  cvNow = C.current; $("#cvNowText").textContent = C.current;
  $("#cvUp").hidden = !C.uploaded; cvExt = C.uploaded?.ext || "";
  $("#cvNote").textContent = `Current: the open-source path. First: 23 October 2026, with the website numbers as they were then.${C.uploaded ? ` Your uploaded CV (.${C.uploaded.ext}, ${Math.round(C.uploaded.bytes / 1024)} KB) is also on the server.` : ""}`;
}
$("#cvDl").addEventListener("click", () => {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([cvMd], { type: "text/markdown" })), download: "stanley-cv-first.md" });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#cvNow").addEventListener("click", () => {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([cvNow], { type: "text/markdown" })), download: "stanley-cv.md" });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#cvUp").addEventListener("click", () => download("?view=cv&file=uploaded", `stanley-cv.${cvExt}`));

async function loadEmails() {
  let E; try { E = await api("?view=emails"); } catch { return; }
  $("#emails").innerHTML = E.emails.length ? `<table><thead><tr><th>When</th><th>Kind</th><th>Subject</th><th>Status</th></tr></thead><tbody>${E.emails.slice(0, 40).map((e) => `<tr><td>${esc(ago(e.at))}</td><td>${esc(e.kind)}</td><td>${esc(e.subject)}</td><td>${esc(e.status)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No emails yet.</p>';
}

async function load() {
  let D;
  $("#loginErr").textContent = "Loading… reading the node can take a few seconds.";
  try { D = await api(""); } catch (err) { if (!$("#login").hidden) $("#loginErr").textContent = err.message; else toast(err.message, true, 8000); return; }
  $("#loginErr").textContent = "";
  $("#login").hidden = true; $("#app").hidden = false;
  $("#checked").textContent = `Checked ${new Date().toLocaleTimeString()}`;
  renderChecklist(D); renderStan(D.stan); renderNode(D); renderChain(D); renderRouting(D); renderSettlement(D); renderVisits(D.visits); renderSystem(D); renderGlossary();
  loadPower(); loadChannels(); loadSecurity(); loadEmails(); loadMoney(); loadCv(); loadActivity();
}
token ? load() : showLogin();
