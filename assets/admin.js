// The admin page's script: Stanley's node dashboard, built to learn from. Every
// reading says what it means and what good looks like ("Explain everything").
// Kept out of the HTML so the page's Content Security Policy allows only our own script files.
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Not shown inside a frame."); } // no clickjacking
addEventListener("scroll",()=>{document.body.classList.toggle("scrolled",scrollY>24)},{passive:true});document.body.classList.toggle("scrolled",scrollY>24); // nav shadow on scroll
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const satsF = (n) => (n === null || n === undefined ? "–" : `${num(n)} sats`);
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
// One reading: label, value, state ("good", "warn" or none) and what it means.
const kpi = (label, v, state, why) => `<div class="kpi${state ? ` ${state}` : ""}"><small>${esc(label)}</small><div>${esc(v)}</div>${why ? `<span class="why">${esc(why)}</span>` : ""}</div>`;
// Shillings beside sats, at the rate the dashboard last read (BTC price × USD/KES).
let KES_PER_BTC = null;
let OVERVIEW = null, lastUtxos = null;
const ksh = (sats) => (KES_PER_BTC && sats !== null && sats !== undefined ? `KSh ${Math.round((Number(sats) / 1e8) * KES_PER_BTC).toLocaleString("en-US")}` : "");
const satsKsh = (sats) => `${satsF(sats)}${ksh(sats) ? ` (${ksh(sats)})` : ""}`;
const judge = (ok) => (ok === null || ok === undefined ? "" : ok ? "good" : "warn");
let token = "";
try { token = sessionStorage.getItem("altra.admin") || ""; } catch {}

// "Explain everything": on by default, remembered on this device.
try { if (localStorage.getItem("altra.explain") === "off") { $("#explain").checked = false; document.body.classList.add("quiet"); } } catch {}
$("#explain").addEventListener("change", (e) => {
  document.body.classList.toggle("quiet", !e.target.checked);
  try { localStorage.setItem("altra.explain", e.target.checked ? "on" : "off"); } catch {}
});

// Tabs: one area at a time, remembered in the address (#node, #channels…).
const TABS = [...document.querySelectorAll("[data-tab]")].map((b) => b.dataset.tab);
function tab(name) {
  if (!TABS.includes(name)) name = "overview";
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("on", p.dataset.pane === name));
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}
document.querySelector(".tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-tab]")?.dataset.tab; if (t) { tab(t); window.scrollTo(0, 0); } });
window.addEventListener("hashchange", () => tab(location.hash.slice(1)));
tab(location.hash.slice(1));

// What needs attention, from every part of the dashboard: { key: { level, text, go: "tab:sectionId" } }.
const ISSUES = {};
function issue(key, level, text, go) { if (level) ISSUES[key] = { level, text, go }; else delete ISSUES[key]; renderAlerts(); }
function renderAlerts() {
  const list = Object.values(ISSUES).sort((a, b) => (a.level === "crit" ? 0 : 1) - (b.level === "crit" ? 0 : 1));
  $("#health").textContent = list.length ? `${list.length} thing${list.length === 1 ? "" : "s"} need${list.length === 1 ? "s" : ""} you ▾` : "All good";
  $("#health").classList.toggle("bad", list.length > 0);
  $("#alertList").innerHTML = list.length ? list.map((x) => `<li><a href="#${esc(x.go.split(":")[0])}" data-go="${esc(x.go)}"><span class="lv ${x.level}">${x.level === "crit" ? "Act now" : "Soon"}</span><br>${esc(x.text)}</a></li>`).join("") : '<li class="sm muted">Nothing needs you right now.</li>';
}
function go(target) {
  const [t, id] = target.split(":");
  tab(t);
  const el = id && document.getElementById(id);
  if (el) { const box = el.closest(".panel") || el; box.scrollIntoView({ block: "start" }); window.scrollBy(0, -70); box.classList.add("flash"); setTimeout(() => box.classList.remove("flash"), 2500); }
}
$("#health").addEventListener("click", () => { const open = $("#alerts").hidden; $("#alerts").hidden = !open; $("#health").setAttribute("aria-expanded", String(open)); });
$("#alertList").addEventListener("click", (e) => { const a = e.target.closest("[data-go]"); if (!a) return; e.preventDefault(); $("#alerts").hidden = true; $("#health").setAttribute("aria-expanded", "false"); go(a.dataset.go); });
document.addEventListener("click", (e) => { if (!$("#alerts").hidden && !e.target.closest("#alerts, #health")) { $("#alerts").hidden = true; $("#health").setAttribute("aria-expanded", "false"); } });

let toastTimer;
function toast(text, fail = false, ms = 2600) {
  const el = $("#toast");
  el.textContent = text; el.className = fail ? "fail" : ""; el.hidden = false;
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
// "Updated 14:02:11" under a KPI group, so stale numbers never pass as fresh.
function stamp(id) { const el = $(id); if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()}`; }

// Full-width banner when the node can't be read: stale numbers must shout.
function nodeBannerHtml(err) {
  return `<p style="margin:0"><b>The node can't be read${err ? `: ${esc(err)}` : ""}.</b> Balances below may be stale or missing. Wake the Mac, make sure LND is running, then press Refresh.</p>`;
}
// end nodeBannerHtml

// Recent alerts and reports Stan emailed: subject, when, and whether it went out.
function stanHistoryHtml(alerts) {
  if (!alerts || !alerts.length) return '<p class="muted sm">No alerts or reports emailed yet.</p>';
  return `<table><thead><tr><th>When</th><th>Subject</th><th>Status</th></tr></thead><tbody>${alerts.map((a) =>
    `<tr><td>${esc(ago(a.at))}</td><td>${esc(a.subject)}</td><td>${/^sent/.test(a.status || "") ? "Sent" : esc(a.status || "–")}</td></tr>`).join("")}</tbody></table>`;
}
// end stanHistoryHtml

// Is the off-machine copy of channel.backup fresh? Compares the marked copy
// against today's channel set: any open or close since then makes it stale.
function backupHtml(B) {
  if (!B || (!B.markedAt && B.nodeRead === false)) return '<p class="muted sm">Unknown: the node could not be read, and no copy was ever marked.</p>';
  if (!B.markedAt) return '<p class="sm">No copy marked yet. Copy the file, then press <i>I copied the backup</i> so the dashboard can watch it.</p>';
  const head = B.nodeRead === false
    ? `<p class="sm">Last copy ${esc(ago(B.markedAt))}. The node could not be read just now, so freshness is unknown.</p>`
    : B.stale
      ? `<p class="sm"><b class="err">Stale.</b> Last copy ${esc(ago(B.markedAt))}, but the channels changed since: `
        + `${B.opened.length ? `${B.opened.length} opened` : ""}${B.opened.length && B.closed.length ? ", " : ""}${B.closed.length ? `${B.closed.length} closed` : ""}. Copy again.</p>`
      : `<p class="sm">Fresh. Last copy ${esc(ago(B.markedAt))} covers all ${num(B.current)} open channel${B.current === 1 ? "" : "s"}.</p>`;
  const det = (B.opened.length || B.closed.length) && B.nodeRead !== false
    ? `<p class="sm muted">${B.opened.map((p) => `opened <code>${esc(p)}</code>`).join(", ")}${B.opened.length && B.closed.length ? "; " : ""}${B.closed.map((p) => `closed <code>${esc(p)}</code>`).join(", ")}</p>` : "";
  return head + det;
}
// end backupHtml

// Channels whose peer is offline right now: flagged inactive, or absent from the peer list.
function offlineChannels(channels, peers) {
  const on = new Set((peers || []).map((p) => p.pubkey).filter(Boolean));
  return (channels || []).filter((c) => c.active === false || (c.pubkey && !on.has(c.pubkey)));
}
// end offlineChannels

// Routing fees earned per day, oldest first: one bar per day.
function trendHtml(trend) {
  if (!trend || !trend.length) return '<p class="muted sm">No routing history: the node could not be read.</p>';
  const max = Math.max(1, ...trend.map((d) => d.fees));
  const bars = trend.map((d) => `<div style="flex:1;min-width:2px;background:${d.fees ? "var(--btc)" : "var(--line)"};height:${Math.max(3, Math.round((d.fees / max) * 100))}%" title="${esc(d.day)}: ${esc(num(d.fees))} sats (${d.count})"></div>`).join("");
  const total = trend.reduce((t, d) => t + d.fees, 0);
  return `<div style="display:flex;align-items:flex-end;gap:2px;height:90px" role="img" aria-label="Routing fees per day, ${esc(num(total))} sats total">${bars}</div>`
    + `<p class="sm muted">${esc(num(total))} sats over ${trend.length} day${trend.length === 1 ? "" : "s"}. Hover a bar for its day.</p>`;
}
// end trendHtml
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
// Refresh: the button spins and is disabled until every part has reloaded, then says when.
$("#refresh").addEventListener("click", async () => {
  const b = $("#refresh");
  if (b.classList.contains("busy")) return;
  b.classList.add("busy"); b.disabled = true; b.setAttribute("aria-busy", "true"); b.lastChild.textContent = "Refreshing…";
  const t0 = Date.now();
  try { await load(); } finally {
    await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - t0)))); // long enough to see it worked
    b.classList.remove("busy"); b.disabled = false; b.removeAttribute("aria-busy"); b.lastChild.textContent = "Refresh";
    toast(`Updated ${new Date().toLocaleTimeString()}`);
  }
});

// Today's checklist: what an operator checks daily. true = fine, false = act, null = only Stanley can check.
function renderChecklist(D, L) {
  const N = D.node && !D.node.error ? D.node : null, Y = D.yebente && !D.yebente.error ? D.yebente : null, chain = D.details?.onchain;
  const B = D.backup, bkOk = !B || !B.markedAt ? null : B.nodeRead === false ? null : !B.stale;
  const bkWhy = !B || !B.markedAt ? "Copy channel.backup to a safe place, then press “I copied the backup” so the dashboard can watch it."
    : B.nodeRead === false ? `Last copy ${ago(B.markedAt)}; freshness unknown until the node can be read.`
    : B.stale ? `Last copy ${ago(B.markedAt)}, but channels changed since. Copy again or new channels are unrecoverable.`
    : `Last copy ${ago(B.markedAt)} covers all ${B.current} open channel${B.current === 1 ? "" : "s"}.`;
  const items = [
    [N ? N.synced && (N.behind ?? 0) <= 2 : false, "Node in step with the chain", N ? `Block ${num(N.blockHeight)}, ${N.behind ?? "?"} behind the tip.` : "The website can't read the node."],
    [N ? N.activeChannels > 0 : false, "At least one channel active", N ? `${N.activeChannels} active. With none, Lightning payments can't move.` : "Unknown until the node can be read."],
    [Y ? Y.covered : null, "Node can pay every Ye₿ente wallet", Y ? `Owed ${satsF(Y.owedSats)}; can send ${satsF(D.liquidity.outboundSats)}.` : "Wallets are off, or the balance can't be read."],
    [chain ? chain.confirmed >= 10_000 : null, "Some sats on-chain for emergencies", chain ? `${satsF(chain.confirmed)} on-chain. Keep about 10,000+ to pay fees if a channel ever closes by force.` : "Needs the read-only key to check."],
    [D.stan ? Date.now() - Date.parse(D.stan.at) < 36 * 3600e3 : null, "Stan's report arrived", D.stan ? `Last one ${ago(D.stan.at)}.` : "The first goes out tomorrow morning."],
    [bkOk, "Channel backup copy is fresh", bkWhy],
    [null, "24 recovery words safe on paper", "Never typed into a website or a phone. Only the node's own setup asks for them."],
  ];
  const where = ["node:hNode", "channels:hChan", "money:hPower", "money:hChain", "overview:hStan", "money:hBackup"];
  items.slice(0, 6).forEach(([ok, title, why], i) => issue(`check${i}`, ok === false ? (i < 3 || i === 5 ? "crit" : "warn") : null, `${title}: ${why}`, where[i]));
  $("#checklist").innerHTML = items.map(([ok, title, why]) => `<li><span class="m ${ok === null ? "u" : ok ? "y" : "n"}" aria-label="${ok === null ? "check yourself" : ok ? "fine" : "needs attention"}">${ok === null ? "○" : ok ? "✓" : "✗"}</span><span><b>${esc(title)}</b><br><span class="sm muted">${esc(why)}</span></span></li>`).join("");
}

// 1. Node and chain: block height against the public tip, sync, peers and channels.
function renderNode(D) {
  const N = D.node;
  if (!N) { $("#nodeKpis").innerHTML = ""; $("#nodeNote").innerHTML = "The node isn't connected: set <code>LND_REST_URL</code> and the macaroons in DirectAdmin."; stamp("#nodeAge"); return; }
  if (N.error) { $("#nodeKpis").innerHTML = D.chainTip ? kpi("Chain tip (mempool.space)", num(D.chainTip), "", "The newest block the rest of the world sees.") : ""; $("#nodeNote").textContent = N.error; stamp("#nodeAge"); return; }
  $("#nodeKpis").innerHTML =
      kpi("Block height", num(N.blockHeight), "", "How many blocks your node has checked since 2009.")
    + kpi("Chain tip", D.chainTip ? num(D.chainTip) : "–", "", "The newest block, as mempool.space sees it.")
    + kpi("Behind the tip", N.behind ?? "–", judge(N.behind === null ? null : N.behind <= 2), "Good: 0–2. More means it's catching up or offline.")
    + kpi("Synced to chain", N.synced ? "Yes" : "No", judge(N.synced), "LND agrees with Bitcoin Core's newest block. Needed to pay safely.")
    + kpi("Synced to graph", N.graphSynced ? "Yes" : "No", judge(N.graphSynced), "LND knows the public map of channels. Needed to find routes when sending.")
    + kpi("Channels active", `${N.activeChannels}${N.pendingChannels ? ` (+${N.pendingChannels} opening)` : ""}`, judge(N.activeChannels > 0), "Channels whose peer is online right now.")
    + kpi("Peers", N.peers, judge(N.peers > 0), "Nodes you're connected to. A channel works only while its peer is connected.");
  $("#nodeNote").textContent = `${N.alias || "Your node"} · LND ${N.version}${N.network ? ` · ${N.network}` : ""}`;
  stamp("#nodeAge");
}

function renderBanner(D) {
  const b = $("#nodeBanner"), err = !D.node ? "it isn't connected" : D.node.error;
  if (!err) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = nodeBannerHtml(err);
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
    + kpi("Fee now: slow", F ? `${F.slow} sat/vB` : "–", "", F && F.fast === F.slow
      ? "Same price as fast: the network is quiet, so even the cheapest transaction confirms quickly. Best time to open channels."
      : "Within about an hour. Best for opening channels.");
  // One synchronous replace-then-add: reloading never stacks duplicates.
  if (lastUtxos) $("#chainKpis").insertAdjacentHTML("beforeend", kpi("Coins (UTXOs)", num(lastUtxos.count), "", "Separate pieces of bitcoin in the on-chain wallet. Each one costs fees to spend."));
  stamp("#chainAge");
}
// end renderChain
// Deposit QR: paste an address made on the Mac, get a scannable code back.
// The page checks the shape first for instant feedback; the server checks again.
const BC1Q = /^bc1q[02-9ac-hj-np-z]{38,58}$/;
$("#chAddrShow").addEventListener("click", async () => {
  const pasted = $("#chAddrPaste").value.trim();
  if (!BC1Q.test(pasted)) { $("#chAddrErr").textContent = "That isn't a bc1q address. On the Mac run lncli --lnddir=$HOME/.lnd-altradits --network=mainnet newaddress p2wkh and paste the whole address."; return; }
  $("#chAddrErr").textContent = "";
  const btn = $("#chAddrShow"); btn.disabled = true;
  try {
    const r = await api("", { action: "address_qr", address: pasted });
    $("#chAddrOut").innerHTML = `<p class="sm"><b>Send to this address.</b> Check the first and last 6 characters match your Mac's screen. First time: send a tiny test amount, press Check again, and only then send the rest.</p>
      <div class="qr">${r.qr}</div>
      <textarea readonly rows="2" class="mono">${esc(r.address)}</textarea>
      <div class="row"><button type="button" class="btn" id="chAddrCopy">Copy address</button><a class="btn" href="https://mempool.space/address/${esc(r.address)}" target="_blank" rel="noopener">Watch on mempool.space</a></div>`;
    $("#chAddrCopy").onclick = () => navigator.clipboard?.writeText(r.address).then(() => toast("Address copied."));
  } catch (err) { $("#chAddrErr").textContent = err.message; }
  btn.disabled = false;
});
$("#chRefresh").addEventListener("click", async () => {
  const btn = $("#chRefresh"); btn.disabled = true;
  try { OVERVIEW = await api(""); renderBanner(OVERVIEW); renderChecklist(OVERVIEW); renderChain(OVERVIEW); await loadExplorer(); toast("Balances rechecked."); }
  catch (err) { toast(err.message, true, 6000); }
  btn.disabled = false;
});

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
  ["Rebalancing", "Shifting sats between the two sides without closing: spend to move sats out (more room to receive), receive in to move sats to your side (more to send)."],
  ["Top-up", "Paying one of your node's own invoices from another Lightning wallet. The sats land on your side: sending power rises, receiving room shrinks by the same amount."],
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
  ["Sweep", "Sending a wallet's whole balance to one address in a single transaction: the last step of a liquidation."],
  ["Gap limit", "Wallets watch the newest 20 unused addresses. Make more than that without using them and funds can hide until you rescan."],
];
function renderGlossary() {
  $("#glossary").innerHTML = GLOSSARY.map(([t, d]) => `<details><summary>${esc(t)}</summary><p>${esc(d)}</p></details>`).join("");
}

function renderStan(S, alerts) {
  $("#stanLast").textContent = S ? `Last report ${ago(S.at)}: “${S.subject}” (${S.status}).` : "No report sent yet. The first goes out tomorrow after 06:00 UTC.";
  $("#stanHistory").innerHTML = stanHistoryHtml(alerts);
}
$("#stanGo").addEventListener("click", async () => {
  try {
    const r = await api("", { action: "stan_report" });
    toast(r.status === "sent" ? "Stan's report is on its way." : `Report ${r.status}.`, r.status !== "sent");
    const fresh = { at: new Date().toISOString(), subject: r.subject, status: r.status };
    OVERVIEW.alerts = [fresh, ...(OVERVIEW?.alerts || [])].slice(0, 20);
    renderStan(fresh, OVERVIEW.alerts);
  }
  catch (err) { toast(err.message, true, 6000); }
});

// Channel backup freshness: the button confirms a fresh off-machine copy.
function renderBackup(B) { $("#backupBody").innerHTML = backupHtml(B); }
$("#backupMark").addEventListener("click", async () => {
  $("#backupErr").textContent = "";
  try {
    const r = await api("", { action: "backup_marked" });
    toast(`Copy marked: covers ${r.channels} open channel${r.channels === 1 ? "" : "s"}.`);
    OVERVIEW = await api("");
    renderChecklist(OVERVIEW); renderBackup(OVERVIEW.backup);
  }
  catch (err) { $("#backupErr").textContent = err.message; }
});

// 3. Sending power: spendable after channel reserves, what Ye₿ente owes, and node top-ups.
let spPoll = null, lastPower = null;
// Where your money is: on-chain, your side of channels, minus what wallets are owed.
function renderMap(P) {
  const on = OVERVIEW?.details?.onchain || {};
  const conf = Number(on.confirmed) || 0, unconf = Number(on.unconfirmed) || 0;
  const spend = Number(P.spendable) || 0, reserve = Number(P.reserve) || 0;
  const local = Number(P.local) || spend + reserve;
  const owed = Number(P.owedSats) || 0, inbound = Number(P.inbound) || 0;
  const yours = conf + local - owed, total = Math.max(conf + local, 1);
  const seg = (v, cls, label) => v > 0 ? `<i class="${cls}" style="width:${Math.max(Math.round((v / total) * 100), 2)}%" title="${esc(label)}"></i>` : "";
  const row = (what, sats, note, muted) => `<tr${muted ? ' class="muted"' : ""}><td>${what}</td><td>${sats}</td><td class="sm">${note}</td></tr>`;
  $("#mapBody").innerHTML = `<span class="stack" role="img" aria-label="On-chain ${esc(satsF(conf))}, spendable ${esc(satsF(spend))}, locked ${esc(satsF(reserve))}">${seg(conf, "s-on", `On-chain: ${satsF(conf)}`)}${seg(spend, "s-sp", `Spendable: ${satsF(spend)}`)}${seg(reserve, "s-re", `Locked: ${satsF(reserve)}`)}</span>`
    + `<table><thead><tr><th>Where</th><th>Sats</th><th>What it means</th></tr></thead><tbody>`
    + row("On-chain wallet", esc(satsF(conf)), unconf > 0 ? `Plus ${esc(satsF(unconf))} waiting for confirmations. Pays for channels and fees.` : "Pays for channels and fees.")
    + row("Your side of channels, spendable", esc(satsF(spend)), "Can send right now.")
    + row("Locked in channel reserves", esc(satsF(reserve)), "Unlocks when each channel closes.")
    + row("Minus: owed to Ye₿ente wallets", "−" + esc(satsF(owed)), "Users' money, held by your node.")
    + row("<b>Yours in total</b>", `<b>${esc(satsF(yours))}</b>`, KES_PER_BTC ? esc(ksh(yours)) : "On-chain plus your side, minus what's owed.")
    + row("Peer's side (not yours)", esc(satsF(inbound)), "The peer's money in the channels. Never count it.", true)
    + `</tbody></table>`;
}

async function loadPower() {
  let P; try { P = await api("?view=liquidity"); } catch (err) { $("#spNote").textContent = err.message; return null; }
  lastPower = P;
  renderMap(P);
  $("#spNote").innerHTML = `<span class="kpis" style="display:grid;margin:0 0 .6rem">${kpi("Can send now", satsF(P.spendable), judge(P.spendable >= 1000), ksh(P.spendable))}${kpi("Owed to wallets", satsF(P.owedSats), "", ksh(P.owedSats))}${kpi("Can still receive", satsF(P.inbound), "", `${ksh(P.inbound)} · after the peer's reserve`)}</span>`
    + (P.spendable < 1000 ? `<b class="err">The node can't send anything right now.</b> Ye₿ente payments out fail until you top up.`
    : !P.covered ? `<b class="err">Short:</b> wallets hold more than the node can send. Top up so every balance can be paid out.` : "Enough to pay out every Ye₿ente balance.")
    + (KES_PER_BTC ? `<br><span class="muted">Rate: 1 BTC ≈ KSh ${esc(num(KES_PER_BTC))}, so 1,000 sats ≈ ${esc(ksh(1000))}.</span>` : "");
  if (!$("#spSats").value && P.suggested) $("#spSats").value = P.suggested;
  spKsh();
  $("#spSats").min = P.min; $("#spSats").max = P.max;
  $("#spPresets").innerHTML = P.presets.map((n) => `<button type="button" class="btn${n === P.suggested ? " primary" : ""}" data-sp="${n}">${esc(satsF(n))}${ksh(n) ? ` · ${esc(ksh(n))}` : ""}${n === P.suggested ? " (suggested)" : ""}</button>`).join("");
  $("#spList").innerHTML = P.topups.length ? P.topups.map((t) => `<div class="sm">${esc(satsKsh(t.sats))} · ${esc(t.state)} <span class="muted">${esc(ago(t.at))}</span></div>`).join("") : '<p class="muted sm">No top-ups yet.</p>';
  return P;
}
$("#spPresets").addEventListener("click", (e) => { const n = e.target.closest("[data-sp]")?.dataset.sp; if (n) { $("#spSats").value = n; spKsh(); } });
// The amount typed, in shillings too.
function spKsh() { const n = Math.floor(Number($("#spSats").value)); $("#spSats").title = n ? ksh(n) : ""; $("#spKsh").textContent = n && ksh(n) ? `≈ ${ksh(n)}` : ""; }
$("#spSats").addEventListener("input", spKsh);
$("#spGo").addEventListener("click", async () => {
  $("#spErr").textContent = "";
  let T; try { T = await api("", { action: "node_topup", sats: Number($("#spSats").value) }); } catch (err) { $("#spErr").textContent = err.message; return; }
  $("#spInvoice").innerHTML = `<p class="sm"><b>Pay ${esc(satsKsh(T.sats))} to your node</b> from any Lightning wallet. This updates when it lands (the invoice works for an hour).</p>
    <div class="qr">${T.qr}</div>
    <textarea readonly rows="3" class="mono">${esc(T.bolt11)}</textarea>
    <div class="row"><button type="button" class="btn" id="spCopy">Copy invoice</button><a class="btn" href="lightning:${esc(T.bolt11)}">Open in wallet</a></div>
    <p class="sm" id="spState" role="status">Waiting for payment…</p>`;
  $("#spCopy").onclick = () => navigator.clipboard?.writeText(T.bolt11).then(() => toast("Invoice copied."));
  clearInterval(spPoll);
  spPoll = setInterval(async () => {
    let s; try { s = await api(`?view=topup&hash=${encodeURIComponent(T.hash)}`); } catch { return; }
    if (s.state === "paid") {
      clearInterval(spPoll);
      const before = s.spendableBefore ?? lastPower?.spendable ?? null;
      const now = await loadPower(); loadChannels();
      $("#spState").innerHTML = `<b class="ok">Paid ✓</b> ${esc(satsF(s.sats))} landed on the node.`
        + (now && before !== null ? ` Can send now: <b>${esc(satsF(now.spendable))}</b> (was ${esc(satsF(before))}). Can still receive: ${esc(satsF(now.inbound))}.` : "");
    }
    else if (s.state === "expired") { clearInterval(spPoll); $("#spState").textContent = "This invoice expired. Make a new one."; }
  }, 4000);
});

// 2. Channels: the picture, alerts, the table, advice for the next channel, and the lessons log.
async function loadChannels() {
  let L; try { L = await api("?view=channels"); } catch (err) { $("#lnAlerts").textContent = err.message; return; }
  drawChannels(L);
  Object.keys(ISSUES).filter((k) => k.startsWith("ch:")).forEach((k) => delete ISSUES[k]);
  L.alerts.forEach((a, i) => issue(`ch:${i}`, a.level === "critical" ? "crit" : "warn", a.text, "channels:hChan"));
  $("#lnAlerts").innerHTML = L.alerts.length ? L.alerts.map((a) => `<p class="alert ${a.level === "critical" ? "crit" : "warn"}"><b>${a.level === "critical" ? "Action needed" : "Heads-up"}:</b> ${esc(a.text)}</p>`).join("") : '<p class="ok"><b>All good:</b> enough inbound for what the node receives.</p>';
  const rows = [...L.channels, ...L.pending].map((c) => { const pct = c.capacity ? Math.round((c.local / c.capacity) * 100) : 0;
    return `<tr><td>${c.alias ? `<b>${esc(c.alias)}</b><br>` : ""}<code title="${esc(c.peer)}">${esc(c.peer.slice(0, 16))}…</code>${c.private ? " · private" : ""}</td><td>${satsF(c.capacity)}</td><td>${satsF(c.remote)}</td><td>${satsF(c.local)}</td><td><span class="bar"><i style="width:${pct}%"></i></span><small class="muted">${pct}% ours</small></td><td>${c.status ? esc(c.status) : c.active ? "Active" : '<b class="err">Offline</b>'}</td></tr>`; });
  $("#lnList").innerHTML = rows.length ? `<table><thead><tr><th>Peer</th><th>Capacity</th><th>Can receive</th><th>Ours</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : '<p class="muted">No channels yet.</p>';
  const A = L.advice;
  $("#lnAdvice").innerHTML = `<p><b>Suggested size for your next channel: ${satsF(A.capacity)} of inbound.</b> ${esc(A.why)}</p>${A.fees ? `<p>${esc(A.fees)}</p>` : ""}<b>Avoid</b><ul>${A.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const T = L.totals;
  if (!T) { $("#liqKpis").innerHTML = ""; $("#liqNow").innerHTML = '<p class="muted sm">The node couldn\'t be read, so live numbers are unavailable.</p>'; }
  else {
    const cover = T.want > 0 ? Math.round((T.inbound / T.want) * 100) : null;
    $("#liqKpis").innerHTML = kpi("Can send", satsF(T.spendable), judge(T.spendable >= 10000), "Your side, minus the 1% reserves.")
      + kpi("Can receive", satsF(T.inbound), judge(T.inbound >= (T.want || 0)), "Peer sides added up, minus their reserves.")
      + kpi("30-day need covered", cover === null ? "–" : `${cover}%`, judge(cover === null ? null : cover >= 100), `Need: about ${satsF(T.want)} of room for the next two weeks.`);
    const ex = 100_000;
    $("#liqNow").innerHTML = `<p><b>Right now, a ${satsF(ex)} payment in</b> would leave receiving room at ${satsF(Math.max(0, T.inbound - ex))} and sending power at ${satsF(T.spendable + ex)}. <b>A ${satsF(ex)} payment out</b> would do the reverse. Watch coverage stay above 100% — the alerts above email you before it runs dry.</p>`;
  }
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
  const high = W.events.filter((e) => T[e.kind]?.severity === "high" && Date.now() - Date.parse(e.at) < 864e5);
  issue("sec", high.length ? "warn" : null, `${high.length} high-severity attempt${high.length === 1 ? "" : "s"} turned away today. Check what and where.`, "security:hSec");
  $("#secKpis").innerHTML = kpi("Turned away today", today, "", "Every one was blocked. Counts show who's trying.") + kpi("Last 7 days", week);
  const s = W.solvency;
  $("#secSolvency").innerHTML = s ? `<b>Ye₿ente solvency</b> (${esc(ago(s.at))}): owed ${esc(satsF(s.owedSats))} across ${esc(s.wallets)} wallets; the node can send ${esc(satsF(s.outboundSats))}. ${s.covered === false ? '<b class="err">Short.</b>' : s.covered ? "Covered." : ""}` : "";
  $("#secEvents").innerHTML = W.events.length ? W.events.slice(0, 40).map((e) => `<div class="sm ev"><b>${esc(T[e.kind]?.name || e.kind)}</b> <span class="muted">${esc(ago(e.at))}</span><br>${esc(e.where)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ""}</div>`).join("") : '<p class="muted sm">Nothing turned away yet.</p>';
  $("#secHistory").innerHTML = attackHistoryHtml(W.history);
}
// Attack history: one closed accordion per attack, oldest first, each with its guard status.
const HIST_STATUS = { guarded: ["ok", "Guarded"], watch: ["warn", "Watch"], action: ["err", "Needs you"] };
function attackHistoryHtml(list) {
  return list.slice().sort((a, b) => a.year - b.year).map((a) => {
    const [cls, word] = HIST_STATUS[a.status] || ["", ""];
    return `<details><summary>${esc(a.year)}: ${esc(a.name)}${word ? ` <b class="${cls}">${word}</b>` : ""}</summary>`
      + `<p><b>What happened:</b> ${esc(a.what)}</p><p><b>Lesson:</b> ${esc(a.lesson)}</p><p><b>Our guard:</b> ${esc(a.guard)}</p></details>`;
  }).join("");
}
// end attackHistoryHtml
$("#eraseGo").addEventListener("click", async () => {
  try {
    const r = await api("", { action: "erase_person", email: $("#eraseEmail").value.trim(), confirm: $("#eraseConfirm").value.trim() });
    $("#eraseMsg").textContent = `Erased: ${r.anonymized} message${r.anonymized === 1 ? "" : "s"} anonymized, ${r.deleted} record${r.deleted === 1 ? "" : "s"} deleted, ${r.kept} kept for the books.`;
    $("#eraseEmail").value = ""; $("#eraseConfirm").value = "";
  } catch (err) { $("#eraseMsg").textContent = err.message; }
});

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
    + kpi("Support (/donate)", satsF(S.support.sats), "", `${S.support.count}, paid to your node.`)
    + kpi("Contact ($1)", satsF((S.contact || {}).sats || 0), "", `${(S.contact || {}).count || 0}, each with a receipt.`);
  PAYMENTS = S.payments;
  $("#moneyList").innerHTML = S.payments.length ? `<table><thead><tr><th>Date</th><th>What</th><th>Sats</th><th>Via</th><th>Receipt</th></tr></thead><tbody>${S.payments.map((x, i) =>
    `<tr><td>${esc(String(x.at).slice(0, 10))}</td><td>${esc(x.what)}${x.payer ? `<br><span class="muted sm">${esc(x.payer)}</span>` : ""}</td><td>${esc(num(x.sats))}</td><td>${esc(x.channel)}</td><td><button type="button" class="linkbtn" data-receipt="${i}">${esc(x.receipt || "View")}</button></td></tr>`).join("")}</tbody></table>`
    + (S.months.length ? `<p class="sm muted">By month: ${S.months.map((m) => `${esc(m.month)} ${esc(satsF(m.sats))}`).join(" · ")}</p>` : "") : '<p class="muted sm">No payments recorded.</p>';
}
async function download(path, name) {
  const res = await fetch("/api/admin" + path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) { toast("Couldn't download that.", true); return; }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#moneyList").addEventListener("click", (e) => { const i = e.target.closest("[data-receipt]")?.dataset.receipt; if (i !== undefined) openReceipt(Number(i)); });
$("#moneyCsv").addEventListener("click", () => download("?view=statement&format=csv", `altradits-statement-${new Date().toISOString().slice(0, 10)}.csv`));

// Profit and loss: what the node earned and spent, and what is yours after Ye₿ente's wallet holders.
async function loadPnl() {
  let L; try { L = await api(`?view=pnl&days=${encodeURIComponent($("#pnlDays").value)}`); } catch (err) { $("#pnlTable").textContent = err.message; return; }
  const E = L.earned, S = L.spent;
  $("#pnlKpis").innerHTML = kpi("Earned", satsF(E.total), "", ksh(E.total)) + kpi("Spent", satsF(S.total), "", ksh(S.total))
    + kpi(L.net >= 0 ? "Profit" : "Loss", satsF(Math.abs(L.net)), L.net >= 0 ? "good" : "warn", ksh(Math.abs(L.net)));
  const row = (what, sats, why, sign = "") => `<tr><td>${esc(what)}<br><span class="muted sm">${esc(why)}</span></td><td>${sign}${esc(satsF(sats))}</td><td>${esc(ksh(sats))}</td></tr>`;
  $("#pnlTable").innerHTML = `<table><thead><tr><th>Item</th><th>Sats</th><th>Shillings</th></tr></thead><tbody>
    ${row("Routing fees earned", E.routing, `${E.routed} payment${E.routed === 1 ? "" : "s"} passed through you. A private channel routes few or none.`, "+")}
    ${row("M-Pesa buy spread", E.spread, E.spreadPct ? `${E.spreadPct}% on ${E.buys} buy${E.buys === 1 ? "" : "s"} (KSh ${num(E.buyKes)} paid in).` : `Off: YEBENTE_BUY_SPREAD_PCT is 0, so buys earn nothing. ${E.buys} buy${E.buys === 1 ? "" : "s"}, KSh ${num(E.buyKes)}.`, "+")}
    ${row("Support payments", E.support, `${E.supportCount} on /donate.`, "+")}
    ${row("Routing fees you paid", S.routeFees, `Your own payments. Of ${num(S.routeFeesAll)} sats in fees, Ye₿ente users repaid ${num(S.routeFeesRepaid)}.`, "−")}
    ${row("On-chain fees", S.onchain, "Opening or closing channels, moving coins.", "−")}
  </tbody></table>${L.nodeRead ? "" : '<p class="sm err">The node couldn\'t be read, so node figures show 0. Wake the Mac, make sure LND is running, and check LND_READONLY_MACAROON on the server.</p>'}`;
  $("#pnlYours").innerHTML = pnlYoursHtml(L);
  $("#pnlTrend").innerHTML = trendHtml(L.trend);
  stamp("#pnlAge");
}
// "What's yours right now": unknown (never a 0) when the node couldn't be read.
function pnlYoursHtml(L) {
  const Y = L.yours;
  const nodeWhy = L.nodeRead ? `${ksh(Y.assets)} · your side of channels ${num(Y.channelSats)} + on-chain ${num(Y.onchainSats)}` : "Unknown: the node couldn't be read. See the red note above.";
  const netWhy = (Y.net === null || Y.net === undefined) ? "Unknown until the node can be read." : `${ksh(Y.net)} · on the node minus what wallets hold. Below 0 means wallets hold more than the node has.`;
  return kpi("On the node", satsF(Y.assets), L.nodeRead ? "" : "warn", nodeWhy)
    + kpi("Owed to Ye₿ente wallets", satsF(Y.owed), "", ksh(Y.owed))
    + kpi("Yours", satsF(Y.net), judge(Y.net === null ? null : Y.net >= 0), netWhy);
}
// end pnlYoursHtml
$("#pnlDays").addEventListener("change", loadPnl);

// Each dashboard number, the read-only command that shows it, and where to look.
const VERIFY = [
  ["Block height, synced, channels, peers", "ln-ro getinfo | jq '{block_height, synced_to_chain, synced_to_graph, num_active_channels, num_peers}'"],
  ["Chain tip", "curl -s https://mempool.space/api/blocks/tip/height"],
  ["Can send (your side minus reserve)", "ln-ro listchannels | jq '[.channels[] | select(.active) | (.local_balance|tonumber) - (.local_constraints.chan_reserve_sat|tonumber)] | add'"],
  ["Can receive (Ye₿ente tab: the peer's whole side)", "ln-ro channelbalance | jq .remote_balance.sat"],
  ["Can still receive (Sending power: after the peer's reserve)", "ln-ro listchannels | jq '[.channels[] | select(.active) | (.remote_balance|tonumber) - (.remote_constraints.chan_reserve_sat|tonumber)] | add'"],
  ["On your side of channels", "ln-ro channelbalance | jq .local_balance.sat"],
  ["On-chain balance", "ln-ro walletbalance | jq .confirmed_balance"],
  ["Coins (UTXOs)", "ln-ro listunspent | jq '.utxos | length'"],
  ["Each coin: address, size, confirmations", "ln-ro listunspent | jq '.utxos[] | {address, amount_sat, confirmations}'"],
  ["Make a fresh receive address", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet newaddress p2wkh"],
  ["Channel backup file date", "ls -l $HOME/.lnd-altradits/data/chain/bitcoin/mainnet/channel.backup"],
  ["Find each channel's close ID", "ln-ro listchannels | jq -r '.channels[] | [.peer_alias, .channel_point] | @tsv'"],
  ["Close one channel (add --force if stuck)", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet closechannel <CHANNEL_POINT>"],
  ["Track closing channels and unlock waits", "ln-ro pendingchannels | jq '{limbo: .total_limbo_balance, closing: [.pending_closing_channels[].channel.channel_point], force: [.pending_force_closing_channels[] | {cp: .channel.channel_point, blocks_left: .blocks_til_maturity}]}'"],
  ["Sweep everything to one address", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet sendcoins --sweepall <YOUR_ADDRESS> --sat_per_vbyte <FEE>"],
  ["Fee policy", "ln-ro feereport | jq '.channel_fees[] | {base_fee_msat, fee_per_mil}'"],
  ["Routing fees earned, 30 days", "ln-ro fwdinghistory --start_time=-30d | jq '[.forwarding_events[].fee|tonumber] | add // 0'"],
  ["Payments sent and fees paid, 30 days", "ln-ro listpayments --max_payments 2000 | jq '[.payments[] | select(.status==\"SUCCEEDED\")] | {count: length, fees: (map(.fee_sat|tonumber)|add)}'"],
  ["Invoices made and paid", "ln-ro listinvoices --max_invoices 1000 | jq '[.invoices[].state] | group_by(.) | map({(.[0]): length}) | add'"],
  ["Latest top-ups: which settled", "ln-ro listinvoices --max_invoices 5 | jq '.invoices[] | {memo: .memo, sats: .value, state}'"],
  ["Preview a route's fee before a node send (divide by 1000 for sats)", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet queryroutes --dest <NODE_PUBKEY> --amt <SATS> | jq '.routes[0] | {hops: (.hops | length), fee_msat: .total_fees_msat}'"],
  ["Send sats out over Lightning (withdraw)", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet payinvoice <BOLT11>"],
  ["Send sats out on-chain (withdraw)", "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet sendcoins <ADDRESS> <SATS> --sat_per_vbyte <FEE>"],
  ["On-chain fees paid", "ln-ro listchaintxns | jq '[.transactions[].total_fees|tonumber] | add // 0'"],
  ["Each channel: updates, uptime, force-close wait", "ln-ro listchannels | jq '.channels[] | {peer_alias, num_updates, uptime, lifetime, csv_delay, commitment_type}'"],
  ["Each channel: your side vs peer's side", "ln-ro listchannels | jq '.channels[] | {peer: .peer_alias, ours: .local_balance, theirs: .remote_balance}'"],
  ["Inbound per peer, biggest first", "ln-ro listchannels | jq '.channels | sort_by(.remote_balance|tonumber) | reverse | .[] | {peer: .peer_alias, inbound: .remote_balance}'"],
  ["Payments in flight (pending HTLCs)", "ln-ro listchannels | jq '[.channels[].pending_htlcs | length] | add'"],
  ["Peers: ping and reconnections", "ln-ro listpeers | jq '.peers[] | {ping_ms: ((.ping_time|tonumber)/1000), flap_count}'"],
  ["Network size", "ln-ro getnetworkinfo | jq '{num_nodes, num_channels, graph_diameter}'"],
  ["Closed channels", "ln-ro closedchannels | jq '.channels[] | {close_type, capacity, settled_balance}'"],
  ["BTC price used for KSh", "curl -s https://api.coinbase.com/v2/prices/BTC-USD/spot | jq -r .data.amount; curl -s https://open.er-api.com/v6/latest/USD | jq .rates.KES"],
  ["Wallets owed (server record, needs ADMIN_TOKEN)", "curl -s -H \"Authorization: Bearer $ADMIN_TOKEN\" https://altradits.com/api/admin?view=wallets | jq '{wallets: .count, owed_sats: .total}'"],
  ["Money received (server record, needs ADMIN_TOKEN)", "curl -s -H \"Authorization: Bearer $ADMIN_TOKEN\" https://altradits.com/api/admin?view=statement | jq '.total | {sats, count}'"],
  ["Most active wallets, 30 days (needs ADMIN_TOKEN)", "curl -s -H \"Authorization: Bearer $ADMIN_TOKEN\" \"https://altradits.com/api/admin?view=activity&days=30\" | jq '{active, total}'"],
  ["Owed to Ye₿ente wallets, profit from buys", "Only on the server: the wallet records live there, not on the node."],
];
function renderVerify() {
  $("#verify").innerHTML = `<table><thead><tr><th>On the dashboard</th><th>On the Mac</th></tr></thead><tbody>${VERIFY.map(([what, cmd]) => `<tr><td>${esc(what)}</td><td>${/^(ln-ro|lncli|curl)/.test(cmd) ? `<code>${esc(cmd)}</code>` : `<span class="muted">${esc(cmd)}</span>`}</td></tr>`).join("")}</tbody></table>`;
}

// The node explorer: what a new operator can learn from the node itself.
const blocksToDays = (b) => `${num(b)} blocks ≈ ${Math.round((b * 10) / 60 / 24 * 10) / 10} days`;
const typeWhy = { ANCHORS: "Anchor channel: fees to close are added when closing, so a force close can still confirm when fees rise.", STATIC_REMOTE_KEY: "Static remote key: an older type; funds return to a fixed key on close.", SIMPLE_TAPROOT: "Taproot channel: newer; looks like a normal payment on-chain." };
const closeWhy = { COOPERATIVE_CLOSE: "Cooperative: both sides agreed. Fast and cheap.", LOCAL_FORCE_CLOSE: "Force close by you: funds waited out the delay.", REMOTE_FORCE_CLOSE: "Force close by the peer.", BREACH_CLOSE: "Breach: a cheat was punished.", FUNDING_CANCELED: "Funding cancelled: the channel never opened.", ABANDONED: "Abandoned." };
async function loadExplorer() {
  let X; try { X = await api("?view=explore"); } catch (err) { $("#exInfo").textContent = err.message; return; }
  if (X.error) { $("#exInfo").textContent = X.error; $("#coinList").innerHTML = '<p class="muted">The node couldn\'t be read, so the coin list is unavailable.</p>'; return; }
  const flappy = (X.peers || []).filter((p) => p.flaps > 50);
  issue("peers", flappy.length ? "warn" : null, `Your peer connection keeps dropping (${flappy.map((p) => p.flaps).join(", ")} reconnections). Payments can fail during a drop: check the internet and tunnel.`, "node:hNet");
  const off = offlineChannels(X.channels, X.peers);
  issue("peer_off", off.length ? "crit" : null, off.length ? `Peer offline now on ${off.length} channel${off.length === 1 ? "" : "s"} (${off.map((c) => c.alias || "Channel").join(", ")}). Payments there can't move until the peer is back.` : "", "channels:hInside");
  const I = X.info, G = X.graph;
  $("#exInfo").innerHTML = I ? kpi("Last block seen", ago(I.lastBlockAt), judge(Date.now() - Date.parse(I.lastBlockAt) < 3600e3), "Blocks come about every 10 minutes. Over an hour may mean the node is stuck.")
      + kpi("Inactive channels", I.inactive, judge(I.inactive === 0), "Channels whose peer is offline. They can't move payments until it's back.")
      + `<div class="kpi"><small>Public key</small><div style="font:600 .78rem/1.35 ui-monospace,Menlo,monospace">${esc(I.pubkey)}</div><span class="why">Your node's address on the Lightning Network. Safe to share.</span></div>`
      + kpi("LND build", I.commit || "–", "", "The exact code your node runs. Compare it with the release notes before upgrading.") : "";
  $("#exGraph").innerHTML = G ? kpi("Nodes in the network", num(G.nodes), "", "Every public Lightning node your node knows about.")
      + kpi("Public channels", num(G.channels), "", "Every channel announced to the network.")
      + kpi("Network diameter", `${G.diameter} hops`, "", "The longest shortest path between two nodes. Most payments need far fewer hops.")
      + kpi("Channels per node", G.avgOutDegree, "", "On average. Well-connected nodes have many; yours has one private channel.") : "";
  $("#exPeers").innerHTML = X.peers?.length ? `<table><thead><tr><th>Peer</th><th>Ping</th><th>Reconnections</th><th>Sent</th><th>Received</th><th>Who connected</th></tr></thead><tbody>${X.peers.map((p) =>
    `<tr><td><code title="${esc(p.pubkey)}">${esc(p.pubkey.slice(0, 16))}…</code></td><td>${esc(num(p.pingMs))} ms${p.pingMs > 500 ? ' <span class="err">slow</span>' : ""}</td><td>${esc(num(p.flaps))}${p.flaps > 50 ? ' <span class="err">unstable</span>' : ""}</td><td>${esc(satsF(p.satSent))}</td><td>${esc(satsF(p.satRecv))}</td><td>${p.inbound ? "They did" : "You did"}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No peers connected.</p>';
  const offPts = new Set(off.map((c) => c.point));
  stamp("#exAge");
  $("#exChans").innerHTML = (X.channels || []).map((c) => { const txid = c.point.split(":")[0];
    return `<div class="inside"><h3>${esc(c.alias || "Channel")}${offPts.has(c.point) ? ' <span class="err">peer offline</span>' : ""}</h3><div class="kpis">`
      + kpi("Short channel ID", c.scid || "private alias", "", c.scid ? "Block × transaction × output of the funding transaction." : "Private channels can use an alias instead of their on-chain position.")
      + kpi("Updates", num(c.updates), "", "Every payment, sent or received, is one signed update.")
      + kpi("Sent through it", satsF(c.sent), "", "All-time, from your side.") + kpi("Received through it", satsF(c.received), "", "All-time, into your side.")
      + kpi("Closing fee set aside", satsF(c.commitFee), "", "Kept from your balance to pay for closing on-chain.")
      + kpi("Wait if force-closed", blocksToDays(c.csvDelay), "", "If a channel is closed by one side alone, that side's sats wait this long.")
      + kpi("Uptime", c.uptimePct === null ? "–" : `${c.uptimePct}%`, judge(c.uptimePct === null ? null : c.uptimePct >= 95), "Share of its life the peer was online. Below 95% means missed payments.")
      + kpi("Payments in flight", c.pendingHtlcs, "", "HTLCs not yet settled. Usually 0; many stuck ones need attention.")
      + `</div><p class="why sm">${esc(typeWhy[c.type] || c.type)} ${c.initiator ? "You opened it." : "The peer opened it."} ${txid ? `<a href="https://mempool.space/tx/${esc(txid)}" target="_blank" rel="noopener">See the funding transaction on mempool.space</a>.` : ""}</p></div>`; }).join("") || '<p class="muted sm">No channels.</p>';
  $("#exClosed").innerHTML = X.closed?.length ? `<table><thead><tr><th>How</th><th>Capacity</th><th>Came back to you</th><th>Block</th></tr></thead><tbody>${X.closed.map((c) => `<tr><td>${esc(closeWhy[c.type] || c.type)}</td><td>${esc(satsF(c.capacity))}</td><td>${esc(satsF(c.settled))}</td><td>${esc(num(c.height))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No channel has closed yet.</p>';
  const P = X.payments, V = X.invoices;
  $("#exPays").innerHTML = P ? kpi("Payments sent", `${P.succeeded} of ${P.count}`, "", `${P.failed} failed. Failures are normal when no route has enough room.`)
      + kpi("Sats sent", satsF(P.sats), "", "Total paid out over Lightning.")
      + kpi("Routing fees paid", satsF(P.feeSats), "", P.sats ? `About ${Math.round((P.feeSats / P.sats) * 1e6)} ppm of what you sent.` : "Paid to the nodes that carried your payments.") : "";
  $("#exInvs").innerHTML = V ? kpi("Invoices made", num(V.count), "", "Payment requests your node created.") + kpi("Paid", num(V.settled), "", `${satsF(V.sats)} received.`)
      + kpi("Expired unpaid", num(V.expired), "", "Normal: people open a QR and don't pay.") : "";
  lastUtxos = X.utxos || null;
  if (OVERVIEW) renderChain(OVERVIEW);
  if (X.utxos) $("#coinList").innerHTML = X.utxos.coins?.length ? `<table><thead><tr><th>Address holding it</th><th>Sats</th><th>Confirmations</th></tr></thead><tbody>${X.utxos.coins.map((c) =>
    `<tr><td><a href="https://mempool.space/address/${esc(c.address)}" target="_blank" rel="noopener"><code title="${esc(c.outpoint || c.address)}">${esc(c.address.slice(0, 14))}…${esc(c.address.slice(-6))}</code></a></td><td>${esc(satsF(c.sats))}</td><td>${c.confs > 0 ? esc(num(c.confs)) : '<b class="err">waiting</b>'}</td></tr>`).join("")}</tbody></table>
    <p class="muted">Each address links to its page on mempool.space, where you can watch for confirmations.</p>` : '<p class="muted">No coins: the on-chain wallet is empty. Fund it with the guide below.</p>';
}

// Ye₿ente wallets: your own (receive, history, send in the app), every balance, and where payments go.
const KIND = { receive: "Received", buy: "Bought with M-Pesa", send: "Sent", transfer_in: "From a Ye₿ente wallet", transfer_out: "To a Ye₿ente wallet" };
async function loadWallets() {
  let W; try { W = await api("?view=wallets"); } catch (err) { $("#allList").textContent = err.message; return; }
  $("#allKpis").innerHTML = kpi("Wallets", num(W.count), "", "Every Ye₿ente wallet on your node.") + kpi("Owed to wallets", satsF(W.total), "", ksh(W.total));
  $("#allList").innerHTML = W.wallets.length ? `<table><thead><tr><th>Wallet</th><th>Balance</th><th>Shillings</th><th>Last active</th><th>Recovery email</th></tr></thead><tbody>${W.wallets.map((w) =>
    `<tr><td><b>${esc(w.handle)}</b>@altradits.com</td><td>${esc(satsF(w.balance))}</td><td>${esc(ksh(w.balance))}</td><td>${w.lastAt ? esc(ago(w.lastAt)) : "never"}</td><td>${w.email ? "Yes" : '<span class="muted">No</span>'}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No wallets yet.</p>';
  $("#mineList").innerHTML = W.mine.length ? W.mine.map((w) => w.missing ? `<div class="minew"><b>${esc(w.handle)}</b>: no longer exists. <button type="button" class="linkbtn" data-remove="${esc(w.handle)}">Remove</button></div>` : `<div class="minew">
      <h3>${esc(w.address)}</h3>
      <div class="kpis">${kpi("Balance", satsF(w.balance), "", ksh(w.balance))}</div>
      <div class="row"><input type="number" inputmode="numeric" min="1" placeholder="Sats to receive" aria-label="Sats to receive into ${esc(w.handle)}" data-amt="${esc(w.handle)}" style="max-width:12rem"><button type="button" class="btn primary" data-recv="${esc(w.handle)}">Receive</button><a class="btn" href="/yebente#login" target="_blank" rel="noopener">Send in the app</a><button type="button" class="linkbtn sm" data-remove="${esc(w.handle)}">Remove from my list</button></div>
      <div data-inv="${esc(w.handle)}"></div>
      ${w.history.length ? `<table style="margin-top:.6rem"><thead><tr><th>When</th><th>What</th><th>Sats</th><th>With</th><th>Receipt</th></tr></thead><tbody>${w.history.map((e) =>
        `<tr><td>${esc(ago(e.at))}</td><td>${esc(KIND[e.kind] || e.kind)}${e.status !== "completed" ? ` <span class="muted">(${esc(e.status)})</span>` : ""}</td><td>${esc(num(e.sats))}${e.fee ? ` <span class="muted">+${esc(num(e.fee))} fee</span>` : ""}</td><td>${esc(e.counterparty)}</td><td>${e.receiptUrl ? `<a href="${esc(e.receiptUrl)}" target="_blank" rel="noopener">View receipt</a>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No transactions yet.</p>'}
    </div>`).join("") : '<p class="muted sm" style="margin-top:.6rem">No wallets on your list yet. Create one, or add a handle you own.</p>';
  const first = W.mine.find((w) => !w.missing)?.handle;
  if (first) document.querySelectorAll("#cliSteps .h").forEach((x) => { x.textContent = first; });
}
$("#mineAdd").addEventListener("click", async () => {
  try { await api("", { action: "my_wallet_add", handle: $("#mineHandle").value }); $("#mineHandle").value = ""; toast("Added."); loadWallets(); } catch (err) { toast(err.message, true, 6000); }
});
let recvPoll = null;
$("#mineList").addEventListener("click", async (e) => {
  const rm = e.target.closest("[data-remove]")?.dataset.remove;
  if (rm) { try { await api("", { action: "my_wallet_remove", handle: rm }); loadWallets(); } catch (err) { toast(err.message, true); } return; }
  const h = e.target.closest("[data-recv]")?.dataset.recv; if (!h) return;
  const box = document.querySelector(`[data-inv="${CSS.escape(h)}"]`), sats = Number(document.querySelector(`[data-amt="${CSS.escape(h)}"]`).value);
  let R; try { R = await api("", { action: "wallet_invoice", handle: h, sats }); } catch (err) { box.innerHTML = `<p class="err sm">${esc(err.message)}</p>`; return; }
  box.innerHTML = `<p class="sm"><b>Pay ${esc(satsKsh(R.satsAmount))} into ${esc(h)}</b> from any Lightning wallet. This updates when it's paid.</p><div class="qr">${R.qr}</div>
    <textarea readonly rows="3" class="mono">${esc(R.invoice)}</textarea><p class="sm" data-state>Waiting for payment…</p>
    <p class="sm muted">Learn: <code>ln-ro decodepayreq ${esc(R.invoice.slice(0, 24))}…</code> shows this invoice; after paying, <code>ln-ro listinvoices --max_invoices 1</code> shows it SETTLED.</p>`;
  clearInterval(recvPoll);
  recvPoll = setInterval(async () => {
    let s; try { s = await api(`?view=walletinvoice&hash=${encodeURIComponent(R.paymentHash)}`); } catch { return; }
    if (s.state === "settled") { clearInterval(recvPoll); box.querySelector("[data-state]").innerHTML = `<b class="ok">Received ✓</b> ${esc(satsF(s.sats))} added to ${esc(h)}.`; setTimeout(loadWallets, 1500); }
    else if (s.state === "expired") { clearInterval(recvPoll); box.querySelector("[data-state]").textContent = "Expired unpaid. Make a new one."; }
  }, 4000);
});
async function loadDestinations() {
  let D; try { D = await api(`?view=destinations&days=${encodeURIComponent($("#destDays").value)}`); } catch (err) { $("#destList").textContent = err.message; return; }
  $("#destList").innerHTML = D.destinations.length ? `<table><thead><tr><th>Received by</th><th>Payments</th><th>Sats</th><th>From wallets</th><th>Last</th><th>Receipts</th></tr></thead><tbody>${D.destinations.map((d) =>
    `<tr><td>${esc(d.to)}${d.mpesa ? ' <span class="muted sm">M-Pesa</span>' : ""}</td><td>${num(d.payments)}</td><td>${esc(satsF(d.sats))}<span class="ksh">${esc(ksh(d.sats))}</span></td><td>${num(d.from)}</td><td>${esc(ago(d.lastAt))}</td><td>${d.receipts.map((r, i) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">Receipt ${i + 1}</a>`).join(" · ")}</td></tr>`).join("")}</tbody></table>` : '<p class="muted sm">No payments out of Ye₿ente in this period.</p>';
}
$("#destDays").addEventListener("change", loadDestinations);

// A receipt from the statement, to read, print or save as PDF.
let PAYMENTS = [];
function openReceipt(i) {
  const x = PAYMENTS[i]; if (!x) return;
  $("#rcptTitle").textContent = "Receipt";
  $("#rcptNo").textContent = x.receipt ? `No. ${x.receipt}` : "Payment record";
  const via = { onchain: "Bitcoin on-chain", lightning: "Lightning" }[x.channel] || String(x.channel || "—");
  $("#rcptBody").innerHTML = [["Date", String(x.at).replace("T", " ").slice(0, 16) + " UTC"], ["For", x.what], ["Amount", satsKsh(x.sats)], ["Paid by", x.payer || "—"], ["Via", via], ["Received by", "Altradits · altradits.com"]]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("#rcptResend").hidden = x.type !== "contact";
  $("#rcptResend").dataset.id = x.type === "contact" ? (x.id || "") : "";
  $("#rcpt").showModal();
}
$("#rcptClose").addEventListener("click", () => $("#rcpt").close());
$("#rcptPrint").addEventListener("click", () => window.print());
$("#rcptResend").addEventListener("click", async () => {
  const id = $("#rcptResend").dataset.id;
  if (!id) return;
  if (!confirm("Re-send this receipt email from finance with the current receipt number and link?")) return;
  try {
    await api("", { action: "contact_resend", id });
    toast("Receipt re-sent from finance.");
  } catch (err) { toast(err.message, true, 6000); }
});

// Choumi Yakunte tab: Deadman's Switch, department power buttons, AI status,
// the 5 departments, approvals waiting for Stanley, learning engine, and settling-in report.
// The server's own checklist keys (lib/deadman.js CHECKLIST_KEYS).
const DM_CHECK_LABELS = [
  ["attackStopped15m", "The attack has stopped: no new intrusion signs for 15 minutes"],
  ["solvencyConfirmed", "Node balances and Ye₿ente wallet records reconciled"],
  ["forensicBackupSaved", "Encrypted forensic backup saved"],
  ["secretsRotatedIfNeeded", "Exposed secrets rotated from a clean device (keys, macaroons, ADMIN_TOKEN)"],
  ["stanleyConfirmed", "I confirm the way in is found and closed"],
];
const FROZEN_LABELS = {
  yebenteSends: "Ye₿ente sends",
  yebenteTransfers: "Ye₿ente transfers",
  yebenteBuys: "M-Pesa buys",
  nonOwnerEmail: "Email (except to you and wallet security notices)",
  nodeTopup: "Node top-ups",
};

function usdF(n) { return `$${(Number(n) || 0).toFixed(4)}`; }

// Marketing: the X schedule. Static data files (one manifest, one file per
// month) rendered into downloadable posts. A new month needs no code change.
let MKT_POSTS = [], MKT_MONTHS = [], MKT_MONTH = "", MKT_SEL = "";
async function loadMarketing() {
  const sel = $("#mktMonth");
  try {
    MKT_MONTHS = await (await fetch("/assets/marketing/months.json", { cache: "no-store" })).json();
  } catch (err) { $("#mktPosts").innerHTML = `<p class="sm">Schedule unavailable: ${esc(err.message)}</p>`; return; }
  sel.innerHTML = MKT_MONTHS.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
  sel.value = MKT_MONTHS[MKT_MONTHS.length - 1];
  const isel = $("#mktIMonth");
  if (isel) { isel.innerHTML = sel.innerHTML; isel.value = sel.value; }
  sel.onchange = () => renderMarketing(sel.value);
  $("#mktPrev").onclick = () => stepMonth(-1);
  $("#mktNext").onclick = () => stepMonth(1);
  await renderMarketing(MKT_MONTHS[MKT_MONTHS.length - 1]);
  await loadTemplates();
  if (MKT_TPL.length) editTemplate(0, false);
}
function stepMonth(d) {
  const i = MKT_MONTHS.indexOf(MKT_MONTH) + d;
  if (i < 0 || i >= MKT_MONTHS.length) return;
  $("#mktMonth").value = MKT_MONTHS[i];
  renderMarketing(MKT_MONTHS[i]);
}
async function renderMarketing(month) {
  MKT_MONTH = month;
  let data;
  try {
    data = await (await fetch(`/assets/marketing/${encodeURIComponent(month)}.json`, { cache: "no-store" })).json();
  } catch (err) { $("#mktPosts").innerHTML = `<p class="sm">Schedule unavailable: ${esc(err.message)}</p>`; return; }
  MKT_POSTS = data.posts || [];
  try {
    const extra = await api(`?view=mktcustom&month=${encodeURIComponent(month)}`);
    const byDate = new Map(MKT_POSTS.map((p) => [p.date, p]));
    for (const c of extra.posts || []) byDate.set(c.date, { ...c, custom: true });
    MKT_POSTS = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch { /* the schedule still shows without custom posts */ }
  if (!MKT_POSTS.some((p) => p.date === MKT_SEL)) MKT_SEL = MKT_POSTS.length ? MKT_POSTS[0].date : "";
  renderCalendar();
  renderXPost();
}
// Blank templates: branded backgrounds with no words baked in. Download one,
// add the words in the X composer or any editor, post. New files need only a
// templates.json line: the gallery picks them up with no code change.
async function loadTemplates() {
  const box = $("#mktTpl");
  let list;
  try {
    list = await (await fetch("/assets/marketing/templates.json", { cache: "no-store" })).json();
  } catch (err) { box.innerHTML = `<p class="sm">Templates unavailable: ${esc(err.message)}</p>`; return; }
  MKT_TPL = list;
  box.innerHTML = `<div class="mktTpl">` + list.map((t, i) =>
    `<figure data-mkt-edit="${i}"><img src="/${esc(t.file)}" alt="${esc(t.name)} blank template" title="Customize ${esc(t.name)}" loading="lazy">`
    + `<figcaption>${esc(t.name)} <span><a class="btn" href="/${esc(t.file)}" download="${esc(String(t.file).split("/").pop())}">Download</a> `
    + `<button type="button" class="btn">Customize</button></span></figcaption></figure>`
  ).join("") + `</div>`;
}
let MKT_TPL = [];
// The words editor: headline plus one smaller line, drawn on the template's
// clean background in the browser, with the logo as a third layer. All three
// drag with the pointer and nudge with the arrow keys; the layout is kept
// per template while the page is open. Nothing leaves the page until
// Download or Place is pressed.
const MKT_LOGO_W = 290, MKT_LOGO_H = Math.round(MKT_LOGO_W * 119 / 325);
const MKT_FONTS = {
  hbrand: { f: '"Bricolage Grotesque", Figtree, sans-serif', w: 800 },
  hsoft: { f: '"Bricolage Grotesque", Figtree, sans-serif', w: 600 },
  hplain: { f: 'Figtree, sans-serif', w: 700 },
  hserif: { f: 'Georgia, "Times New Roman", serif', w: 700 },
  sbrand: { f: 'Figtree, sans-serif', w: 600 },
  ssoft: { f: '"Bricolage Grotesque", Figtree, sans-serif', w: 500 },
  sserif: { f: 'Georgia, "Times New Roman", serif', w: 400, st: 'italic ' },
  smono: { f: 'ui-monospace, Menlo, Consolas, monospace', w: 600 },
};
function mktLayout() { return { head: { x: 120, y: 270 }, sub: null, logo: { x: 96, y: 1085 } }; }
let MKT_EDIT = { file: "", bg: "", name: "", img: null, logoImg: null, logoWhite: null, sel: null, ...mktLayout() };
let MKT_HIT = [];
let MKT_SUBFLOW = { x: 120, y: 306 };
const MKT_LAYOUTS = {};
function loadImg(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}
function editTemplate(i, scroll = true) {
  const t = MKT_TPL[i];
  if (!t) return;
  if (MKT_EDIT.file) MKT_LAYOUTS[MKT_EDIT.file] = { head: MKT_EDIT.head, sub: MKT_EDIT.sub, logo: MKT_EDIT.logo };
  MKT_EDIT = { file: t.file, bg: t.bg, name: t.name, img: null, logoImg: null, logoWhite: null, sel: null, ...(MKT_LAYOUTS[t.file] || mktLayout()) };
  const lbl = $("#mktEditName");
  if (lbl) lbl.textContent = t.name;
  if ($("#mktLight")) $("#mktLight").checked = t.light === true;
  if ($("#mktLogoWhite")) $("#mktLogoWhite").checked = t.ink === "white";
  drawCustom().then(() => { if (scroll) $("#hMktEdit")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
}
function paintLine(ctx, line, x, y, halo) {
  if (halo) { ctx.save(); ctx.lineWidth = 10; ctx.strokeStyle = "rgba(15,27,45,.55)"; ctx.strokeText(line, x, y); ctx.restore(); }
  ctx.fillText(line, x, y);
}
function wrapPaint(ctx, text, x, y, maxW, lh, maxLines, halo) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let line = "", yy = y, n = 0, w = 0;
  const paint = (s, py) => { paintLine(ctx, s, x, py, halo); w = Math.max(w, ctx.measureText(s).width); };
  for (const wd of words) {
    if (n >= maxLines) break;
    const t = line ? line + " " + wd : wd;
    if (ctx.measureText(t).width > maxW && line) { paint(line, yy); line = wd; yy += lh; n++; }
    else line = t;
  }
  if (line && n < maxLines) { paint(line, yy); yy += lh; }
  return { y: yy, w };
}
function fitFont(ctx, text, maxW, start, min, spec) {
  let size = start;
  ctx.font = `${spec.st || ""}${spec.w} ${size}px ${spec.f}`;
  while (size > min && String(text).split(/\s+/).some((wd) => ctx.measureText(wd).width > maxW)) {
    size -= 10;
    ctx.font = `${spec.st || ""}${spec.w} ${size}px ${spec.f}`;
  }
  return size;
}
async function drawCustom(outline = true) {
  const cv = $("#mktCanvas");
  if (!cv) return; // older cached page without the editor panel
  const ctx = cv.getContext("2d");
  if (!MKT_EDIT.img) {
    try { MKT_EDIT.img = await loadImg("/" + MKT_EDIT.bg); }
    catch { cv.parentElement.innerHTML = `<p class="sm">Template picture unavailable. Reload and try again.</p>`; return; }
  }
  ctx.drawImage(MKT_EDIT.img, 0, 0, 1920, 1280);
  try { await Promise.all([document.fonts.load('800 170px "Bricolage Grotesque"'), document.fonts.load('600 76px Figtree'), document.fonts.load('700 76px Figtree')]); } catch { /* system fonts stand in */ }
  const light = $("#mktLight")?.checked;
  const whiteLogo = $("#mktLogoWhite")?.checked;
  const head = $("#mktHead")?.value.trim() || "", sub = $("#mktSub")?.value.trim() || "";
  const hs = MKT_FONTS[$("#mktHFont")?.value] || MKT_FONTS.hbrand;
  const ss = MKT_FONTS[$("#mktSFont")?.value] || MKT_FONTS.sbrand;
  ctx.textBaseline = "top";
  MKT_HIT = [];
  const lp = MKT_EDIT.logo;
  let logoOk = false;
  try {
    if (!MKT_EDIT.logoImg || MKT_EDIT.logoWhite !== whiteLogo) {
      MKT_EDIT.logoImg = await loadImg(whiteLogo ? "/assets/logo-white.png" : "/assets/logo.png");
      MKT_EDIT.logoWhite = whiteLogo;
    }
    ctx.drawImage(MKT_EDIT.logoImg, lp.x, lp.y, MKT_LOGO_W, MKT_LOGO_H);
    logoOk = true;
  } catch { /* the wordmark below stands in */ }
  if (!logoOk) {
    ctx.font = '800 64px "Bricolage Grotesque", Figtree, sans-serif';
    ctx.fillStyle = whiteLogo ? "#ffffff" : "#0f1b2d";
    ctx.fillText("Altradits", lp.x, lp.y);
  }
  MKT_HIT.push({ id: "logo", x: lp.x, y: lp.y, w: MKT_LOGO_W, h: MKT_LOGO_H });
  const hp = MKT_EDIT.head;
  let hy = hp.y;
  if (head) {
    const size = fitFont(ctx, head, 1680, 170, 80, hs);
    ctx.fillStyle = light ? "#ffffff" : "#0f1b2d";
    const r = wrapPaint(ctx, head, hp.x, hp.y, 1680, Math.round(size * 1.08), 3, light);
    hy = r.y;
    MKT_HIT.push({ id: "head", x: hp.x, y: hp.y, w: Math.max(r.w, 40), h: Math.max(hy - hp.y, 40) });
  }
  if (sub) {
    ctx.font = `${ss.st || ""}${ss.w} 76px ${ss.f}`;
    ctx.fillStyle = "#ea5158";
    const sp = MKT_EDIT.sub || { x: hp.x, y: hy + 36 };
    const r = wrapPaint(ctx, sub, sp.x, sp.y, 1680, 92, 2, false);
    MKT_SUBFLOW = { x: hp.x, y: hy + 36 };
    MKT_HIT.push({ id: "sub", x: sp.x, y: sp.y, w: Math.max(r.w, 40), h: Math.max(r.y - sp.y, 40) });
  }
  if (outline && MKT_EDIT.sel) {
    const h = MKT_HIT.find((b) => b.id === MKT_EDIT.sel);
    if (h) {
      ctx.save();
      ctx.setLineDash([16, 12]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#0f1b2d";
      ctx.strokeRect(h.x - 8, h.y - 8, h.w + 16, h.h + 16);
      ctx.lineDashOffset = 16;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(h.x - 8, h.y - 8, h.w + 16, h.h + 16);
      ctx.restore();
    }
  }
}
let MKT_DRAG = null;
function mktPos(e) {
  const r = $("#mktCanvas").getBoundingClientRect();
  return { x: (e.clientX - r.left) * 1920 / r.width, y: (e.clientY - r.top) * 1280 / r.height };
}
function mktHit(p) {
  return [...MKT_HIT].reverse().find((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) || null;
}
function mktPlaceOf(id) {
  if (id === "head") return MKT_EDIT.head;
  if (id === "logo") return MKT_EDIT.logo;
  if (!MKT_EDIT.sub) MKT_EDIT.sub = { ...MKT_SUBFLOW };
  return MKT_EDIT.sub;
}
$("#mktCanvas")?.addEventListener("pointerdown", (e) => {
  const h = mktHit(mktPos(e));
  MKT_EDIT.sel = h ? h.id : null;
  if (h) {
    const p = mktPos(e), o = mktPlaceOf(h.id);
    MKT_DRAG = { w: h.w, h: h.h, dx: p.x - o.x, dy: p.y - o.y };
    e.target.setPointerCapture?.(e.pointerId);
  }
  drawCustom();
});
$("#mktCanvas")?.addEventListener("pointermove", (e) => {
  const cv = $("#mktCanvas"), p = mktPos(e);
  if (!MKT_DRAG || !MKT_EDIT.sel) { cv.style.cursor = mktHit(p) ? "grab" : "default"; return; }
  const o = mktPlaceOf(MKT_EDIT.sel);
  o.x = Math.round(Math.min(Math.max(p.x - MKT_DRAG.dx, 0), 1920 - MKT_DRAG.w));
  o.y = Math.round(Math.min(Math.max(p.y - MKT_DRAG.dy, 0), 1280 - MKT_DRAG.h));
  cv.style.cursor = "grabbing";
  drawCustom();
});
for (const ev of ["pointerup", "pointercancel"]) $("#mktCanvas")?.addEventListener(ev, () => { MKT_DRAG = null; const cv = $("#mktCanvas"); if (cv) cv.style.cursor = "default"; });
$("#mktCanvas")?.addEventListener("keydown", (e) => {
  if (!MKT_EDIT.sel) return;
  const step = e.shiftKey ? 20 : 4;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  const h = MKT_HIT.find((b) => b.id === MKT_EDIT.sel), o = mktPlaceOf(MKT_EDIT.sel);
  const w = h ? h.w : 200, hh = h ? h.h : 100;
  o.x = Math.round(Math.min(Math.max(o.x + d[0], 0), 1920 - w));
  o.y = Math.round(Math.min(Math.max(o.y + d[1], 0), 1280 - hh));
  drawCustom();
});
$("#mktCanvas")?.addEventListener("dblclick", (e) => {
  const h = mktHit(mktPos(e));
  if (!h || h.id === "logo") return;
  const box = h.id === "head" ? $("#mktHead") : $("#mktSub");
  if (!box) return;
  box.focus();
  box.select();
});
function renderCalendar() {
  const [y, m] = MKT_MONTH.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const has = new Set(MKT_POSTS.map((p) => p.date));
  let cells = "";
  for (let i = 0; i < first; i++) cells += "<td></td>";
  for (let d = 1; d <= days; d++) {
    const iso = `${MKT_MONTH}-${String(d).padStart(2, "0")}`;
    cells += has.has(iso)
      ? `<td><button type="button" class="${iso === MKT_SEL ? "mktSel" : ""}" data-mkt-day="${iso}">${d}<span class="dot">●</span></button></td>`
      : `<td class="muted">${d}</td>`;
    if ((first + d) % 7 === 0) cells += "</tr><tr>";
  }
  $("#mktCal").innerHTML = `<table class="mktCal"><caption class="sm">${esc(MKT_MONTH)}: ${MKT_POSTS.length} posts</caption>`
    + `<tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr><tr>${cells}</tr></table>`;
}
function renderXPost() {
  const box = $("#mktPosts");
  const i = MKT_POSTS.findIndex((p) => p.date === MKT_SEL);
  if (i < 0) { box.innerHTML = `<p class="sm muted">Pick a dotted day on the calendar to preview its post.</p>`; return; }
  const p = MKT_POSTS[i];
  const src = p.imageData || `/${p.image}`;
  const base = p.imageData ? `custom-${p.date}` : String(p.image).split("/").pop().replace(/\.jpg$/, "");
  const media = p.video
    ? `<video src="/${esc(p.video)}" poster="/${esc(p.image)}" controls muted loop playsinline preload="metadata"></video>`
    : `<img src="${p.imageData ? p.imageData : esc(src)}" alt="${esc(p.alt)}" loading="lazy">`;
  const dl = p.video
    ? `<a class="btn" href="/${esc(p.video)}" download="${esc(base)}.mp4">Download video</a>`
    : `<a class="btn" href="${p.imageData ? p.imageData : esc(src)}" download="${esc(base)}.jpg">Download image</a>`;
  const custom = p.custom ? ` <span class="muted">· Custom</span>` : ``;
  box.innerHTML = `<div class="xpost"><div class="who"><span class="ava">A</span><div><b>Altradits</b> <span class="muted">@altradits · ${esc(p.date)}</span>${custom}</div></div>`
    + `<p class="cap">${esc(p.caption)}</p>`
    + media
    + `<p class="acts">Reply · Repost · Like &nbsp;·&nbsp; ${p.caption.length} / 280 characters</p>`
    + `<div class="row">${dl}`
    + `<button type="button" class="btn" data-mkt-copy="${i}">Copy caption</button>`
    + `<button type="button" class="btn" data-mkt-txt="${i}">Download caption</button></div></div>`;
}
$("#mktCal").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mkt-day]");
  if (!b) return;
  MKT_SEL = b.dataset.mktDay;
  renderCalendar();
  renderXPost();
});
$("#mktTpl").addEventListener("click", (e) => {
  if (e.target.closest("a")) return; // downloads stay downloads
  const b = e.target.closest("[data-mkt-edit]");
  if (!b) return;
  editTemplate(Number(b.dataset.mktEdit));
});
for (const id of ["mktHead", "mktSub"]) $(`#${id}`)?.addEventListener("input", () => drawCustom());
for (const id of ["mktLight", "mktLogoWhite"]) $(`#${id}`)?.addEventListener("change", () => drawCustom());
for (const id of ["mktHFont", "mktSFont"]) $(`#${id}`)?.addEventListener("change", () => drawCustom());
$("#mktReset")?.addEventListener("click", () => {
  if (MKT_EDIT.file) delete MKT_LAYOUTS[MKT_EDIT.file];
  Object.assign(MKT_EDIT, mktLayout(), { sel: null });
  drawCustom();
});
$("#mktDl")?.addEventListener("click", async () => {
  const keep = MKT_EDIT.sel;
  MKT_EDIT.sel = null;
  await drawCustom(false);
  const a = document.createElement("a");
  a.href = $("#mktCanvas").toDataURL("image/jpeg", 0.9);
  a.download = `altradits-${MKT_EDIT.name.toLowerCase()}-custom.jpg`;
  a.click();
  MKT_EDIT.sel = keep;
  drawCustom();
});
$("#mktPlace")?.addEventListener("click", async () => {
  const st = $("#mktIStatus");
  st.textContent = "Placing…";
  const month = $("#mktIMonth").value, day = String($("#mktIDay").value).padStart(2, "0");
  const keep = MKT_EDIT.sel;
  MKT_EDIT.sel = null;
  try {
    await drawCustom(false);
    const r = await api("", { action: "mkt_place", month, date: `${month}-${day}`,
      caption: $("#mktICap").value, alt: `${MKT_EDIT.name} template with custom words`,
      imageData: $("#mktCanvas").toDataURL("image/jpeg", 0.88) });
    st.textContent = `Placed on ${r.placed}.`;
    await renderMarketing(month);
  } catch (err) { st.textContent = err.message; }
  MKT_EDIT.sel = keep;
  drawCustom();
});
$("#mktUnplace")?.addEventListener("click", async () => {
  const st = $("#mktIStatus");
  st.textContent = "Removing…";
  const month = $("#mktIMonth").value, day = String($("#mktIDay").value).padStart(2, "0");
  try {
    await api("", { action: "mkt_remove", month, date: `${month}-${day}` });
    st.textContent = `Removed ${month}-${day}.`;
    await renderMarketing(month);
  } catch (err) { st.textContent = err.message; }
});
$("#mktPosts").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-mkt-copy]"), t = e.target.closest("[data-mkt-txt]");
  if (!c && !t) return;
  const p = MKT_POSTS[Number(c ? c.dataset.mktCopy : t.dataset.mktTxt)];
  if (!p) return;
  if (c) {
    try { await navigator.clipboard.writeText(p.caption); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = p.caption; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast("Caption copied.");
  } else {
    const base = String(p.image).split("/").pop().replace(/\.jpg$/, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([p.caption], { type: "text/plain" }));
    a.download = `${base}.txt`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast("Caption downloaded.");
  }
});
async function loadChoumi() {
  let C; try { C = await api("?view=choumi"); } catch (err) { $("#dmReason").textContent = err.message; return; }
  const dm = C.deadman || {}, ai = C.ai || {}, status = ai.status || {};
  const cl = dm.checklist || {};
  const done = DM_CHECK_LABELS.filter(([k]) => cl[k]).length;

  // 1. Deadman's Switch
  issue("deadman", dm.active ? "crit" : null, dm.active ? `Deadman's Switch TRIGGERED (${dm.trigger || "manual"}): ${dm.reason || "lockdown active"}` : "", "choumi:hDeadman");
  $("#dmKpis").innerHTML =
      kpi("Switch state", dm.active ? "TRIGGERED" : "Armed", dm.active ? "warn" : "good", dm.active ? `Since ${dm.trippedAt ? ago(dm.trippedAt) : "?"} (${dm.trigger || "manual"}).` : "Watching for intrusion 24/7.")
    + kpi("Neutralized checklist", `${done} / ${DM_CHECK_LABELS.length}`, dm.active ? (done === DM_CHECK_LABELS.length ? "good" : "warn") : "", "Every item must be ticked before you can lift the lockdown.")
    + kpi("Incident override", ai.incidentOverrideActive ? "Active" : "Standby", ai.incidentOverrideActive ? "warn" : "", "Powers on response departments during lockdown.")
    + kpi("Last drill", dm.lastDrill?.at ? ago(dm.lastDrill.at) : "None yet", dm.lastDrill?.ok ? "good" : "", dm.lastDrill?.scenario || "Run monthly on a local copy.");
  $("#dmReason").innerHTML = dm.active
    ? `<b class="err">Lockdown active:</b> ${esc(dm.reason || "Triggered")} ${dm.detail ? `<span class="muted">(${esc(dm.detail)})</span>` : ""}`
    : "All triggers quiet. Money-out and external actions are operating normally.";
  const frozenEntries = Object.entries(dm.frozen || {}).filter(([, v]) => v).map(([k]) => FROZEN_LABELS[k] || k);
  $("#dmFrozen").innerHTML = frozenEntries.length
    ? `<p class="alert crit"><b>Frozen right now:</b> ${frozenEntries.map(esc).join(" · ")}</p>`
    : "";
  $("#dmChecklist").innerHTML = DM_CHECK_LABELS.map(([k, label]) =>
    `<label class="switch" style="display:flex;margin:.3rem 0"><input type="checkbox" data-dm-check="${esc(k)}"${cl[k] ? " checked" : ""}> ${esc(label)}</label>`
  ).join("");
  const toggleBtn = $("#dmToggle");
  toggleBtn.textContent = dm.active ? "Lift Deadman's Switch" : "Trip Deadman's Switch";
  toggleBtn.dataset.active = dm.active ? "1" : "0";
  if (dm.lastDrill) {
    $("#dmDrillNote").textContent = `Last local drill (${dm.lastDrill.scenario}): ${dm.lastDrill.lesson || "completed"} · ${ago(dm.lastDrill.at)}.`;
  }

  // 2. AI status & circuit breaker
  const inc = status.incidentOverride;
  const anyOn = (ai.departments || []).some((d) => d.on);
  issue("ai_paused", status.paused && anyOn ? "warn" : null, `AI is paused (${status.kind || "unavailable"}) while departments are switched on: their tasks wait.`, "choumi:hAiStatus");
    $("#aiKpis").innerHTML =
      kpi("AI status", status.paused ? "Paused" : "Running", status.paused ? "warn" : "good", status.paused ? (status.reason || status.kind || "paused") : `The ${(status.provider === "meta" ? "Meta" : "Anthropic")} key (${status.model || "default model"}) works and every budget has room.`)
    + kpi("Calls today", `${num(status.todayCalls)} / ${num(status.dailyCallLimit)}`, "", `${usdF(status.todayUsd)} today`)
    + kpi("Month spend", `${usdF(status.monthUsd)} / $${Number(status.monthlyUsdCap || 0).toFixed(2)}`, (status.monthUsd || 0) < (status.monthlyUsdCap || 0) ? "good" : "warn", `${num(status.monthCalls)} calls this month`)
    + kpi("Incident spend", inc ? `${usdF(inc.usd)} / $${Number(status.incidentUsdCap || 0).toFixed(2)}` : "No incident", inc ? "warn" : "", inc ? `${num(inc.calls)} calls in incident ${inc.incidentId}` : `Cap per incident: $${Number(status.incidentUsdCap || 0).toFixed(2)}.`);
  $("#aiNote").textContent = status.paused
    ? `Paused (${status.kind || "unavailable"}): ${String(status.reason || "").replace(/\.$/, "")}${status.retryAt ? ` · Retries after ${new Date(status.retryAt).toLocaleTimeString()}` : ""}. The site keeps running.`
    : "Healthy. If credit runs out or the key fails, AI pauses and the site keeps running.";

  // 3. Department power buttons
  const pRows = (ai.departments || []).map((d) =>
    `<tr><td><code>${esc(d.id)}</code></td>`
    + `<td><button type="button" class="btn${d.on ? " primary" : ""}" data-dept-power="${esc(d.id)}" data-on="${d.on ? "1" : "0"}" aria-pressed="${d.on}">${d.on ? "ON" : "OFF"}</button></td>`
    + `<td>${num(d.today?.calls)} · ${esc(usdF(d.today?.usd))}</td>`
    + `<td>${num(d.month?.calls)} · ${esc(usdF(d.month?.usd))}</td></tr>`
  ).concat((ai.permanentlyDisabled || []).map((d) => `<tr><td><code>${esc(d.id)}</code></td><td class="muted sm">Disabled in code</td><td>–</td><td>–</td></tr>`));
  $("#deptPowerList").innerHTML = pRows.length
    ? `<table><thead><tr><th>Department</th><th>Power</th><th>Today</th><th>This month</th></tr></thead><tbody>${pRows.join("")}</tbody></table>`
      + (ai.updatedAt ? `<p class="sm muted">Last changed ${esc(ago(ai.updatedAt))}${ai.updatedBy ? ` by ${esc(ai.updatedBy)}` : ""}.</p>` : "")
      + (ai.incidentOverride ? '<p class="sm"><b>Incident override:</b> the response departments are on until the switch is lifted; your settings come back then.</p>' : "")
    : '<p class="muted sm">No department power records.</p>';

  // 4. The 5 departments (queue, last output, QA verdict)
  const dRows = (C.departments || []).map((d) => {
    const lt = d.lastTask;
    const verdict = lt?.qaVerdict
      ? `<span class="${lt.qaVerdict === "approve" ? "ok" : "err"}"><b>${esc(lt.qaVerdict.toUpperCase())}</b>${lt.qaRounds ? ` (${num(lt.qaRounds)} round${lt.qaRounds === 1 ? "" : "s"})` : ""}</span>${lt.qaHeadline ? `<br><span class="muted sm">${esc(lt.qaHeadline)}</span>` : ""}`
      : '<span class="muted sm">No QA run yet</span>';
    const lastOut = lt
      ? `<b>${esc(lt.title)}</b> <span class="muted sm">(${esc(lt.status)})</span>${lt.lastOutput ? `<br><span class="sm">${esc(lt.lastOutput)}</span>` : ""}`
      : '<span class="muted sm">No output yet</span>';
    return `<tr>`
      + `<td><b>${esc(d.name)}</b><br><span class="sm muted">${esc(d.agent?.name)} · ${esc(d.agent?.title)}</span><br><span class="sm">${esc(d.currentWork)}</span></td>`
      + `<td>${d.power?.on ? '<b class="ok">ON</b>' : '<span class="muted">OFF</span>'}</td>`
      + `<td>${num(d.queue)} queued<br><span class="muted sm">${num(d.waiting)} waiting · ${num(d.doneCount)} done</span></td>`
      + `<td>${lastOut}</td>`
      + `<td>${verdict}</td>`
      + `</tr>`;
  });
  $("#choumiDepts").innerHTML = dRows.length
    ? `<table><thead><tr><th>Department &amp; specialist</th><th>Power</th><th>Queue</th><th>Last output</th><th>Choumi QA verdict</th></tr></thead><tbody>${dRows.join("")}</tbody></table>`
    : '<p class="muted sm">No departments configured.</p>';

  // Active / held / waiting tasks
  const ops = C.ops || {};
  const activeTasks = (ops.recent || []).slice(0, 20);
  const heldCount = ops.counts?.held || 0;
  issue("choumi_held", heldCount ? "warn" : null, `${heldCount} task(s) held by the security screen waiting for your review.`, "choumi:hDepts");
  $("#choumiTasks").innerHTML = activeTasks.length
    ? `<table><thead><tr><th>Task</th><th>Dept</th><th>Status</th><th>Summary / Notes</th><th>Actions</th></tr></thead><tbody>${activeTasks.map((t) => {
        const btns = [];
        if (t.status === "held") {
          btns.push(`<button type="button" class="btn" data-task-act="release" data-id="${esc(t.id)}">Release</button>`);
          btns.push(`<button type="button" class="btn" data-task-act="cancel" data-id="${esc(t.id)}">Cancel</button>`);
        } else if (t.status === "queued") {
          btns.push(`<button type="button" class="btn primary" data-task-work="${esc(t.id)}">Run queue</button>`);
          btns.push(`<button type="button" class="btn" data-task-act="cancel" data-id="${esc(t.id)}">Cancel</button>`);
        } else if (["owner", "review", "follow_up"].includes(t.status)) {
          btns.push(`<button type="button" class="btn primary" data-task-act="approve" data-id="${esc(t.id)}">Approve 5★</button>`);
          btns.push(`<button type="button" class="btn" data-task-act="rerun" data-id="${esc(t.id)}">Revise</button>`);
          btns.push(`<button type="button" class="btn" data-task-act="close" data-id="${esc(t.id)}">Close</button>`);
        }
        const summary = t.deliverable?.summary || (t.held?.reasons || []).join(", ") || t.details || "";
        return `<tr><td><b>${esc(t.title)}</b><br><code class="muted">${esc(t.id)}</code></td><td>${esc(t.department)}</td><td><b>${esc(t.status)}</b></td><td class="sm">${esc(summary.slice(0, 200))}</td><td><div class="row" style="margin:0">${btns.join("")}</div></td></tr>`;
      }).join("")}</tbody></table>`
    : '<p class="muted sm">No tasks in the queue right now.</p>';

  // 4b. Paid contact messages waiting for the team
  const inbox = C.contact || [];
  const fresh = inbox.filter((m) => !m.handled);
  issue("contact_inbox", fresh.length ? "warn" : null, `${fresh.length} paid contact message(s) waiting for the team.`, "choumi:hContact");
  $("#contactInbox").innerHTML = inbox.length
    ? inbox.map((m) => `<div class="inside">
        <h3>${esc(m.label || m.topic)} <span class="muted sm">· ${esc(m.dept)} · ${esc(m.name)} &lt;${esc(m.email)}&gt; · ${esc(ago(m.at))} · ${esc(String(m.sats))} sats paid${m.handled ? " · handled" : ""}${m.ack ? ` · ack ${esc(m.ack)}` : ""}${m.held ? ` · <b>hold: ${(m.held.reasons || []).map(esc).join(", ")}</b>` : ""}</span></h3>
        <p class="sm" style="white-space:pre-wrap">${esc(m.message)}</p>
        ${m.handled ? "" : `<div class="row">
          ${m.held ? "" : `<button type="button" class="btn primary" data-contact-ack="${esc(m.id)}">Queue acknowledgment</button>`}
          <button type="button" class="btn" data-contact-read="${esc(m.id)}">Mark handled</button>
        </div>`}
      </div>`).join("")
    : '<p class="muted sm">No contact messages yet.</p>';

  // 4c. Screened email replies
  const replies = C.replies || [];
  const heldReplies = replies.filter((m) => m.held && !m.handled);
  issue("reply_inbox", heldReplies.length ? "warn" : null, `${heldReplies.length} email ${heldReplies.length === 1 ? "reply" : "replies"} on security hold.`, "choumi:hReplies");
  $("#replyInbox").innerHTML = replies.length
    ? replies.map((m) => `<div class="inside">
        <h3>${esc(m.from)} <span class="muted sm">· ${esc(m.dept || "office")} · ${esc(ago(m.at))}${m.handled ? " · handled" : ""}${m.rejected ? ` · rejected (${esc(m.rejected.dept)})` : ""}${m.held ? ` · <b>hold: ${(m.held.reasons || []).map(esc).join(", ")}</b>` : " · clean"}</span></h3>
        <p class="sm" style="white-space:pre-wrap">${esc(m.text)}</p>
        ${m.handled ? "" : `<div class="row"><button type="button" class="btn primary" data-reply-reject="${esc(m.id)}">Reject with ${esc(m.dept || "office")} message</button><button type="button" class="btn" data-reply-read="${esc(m.id)}">Mark handled</button></div>`}
      </div>`).join("")
    : '<p class="muted sm">No screened replies yet.</p>';

  // 5. Approvals waiting for Stanley
  const approvals = C.approvals || [];
  issue("choumi_approvals", approvals.length ? "warn" : null, `${approvals.length} draft(s) from Choumi's team waiting for your approval.`, "choumi:hApprovals");
  $("#choumiApprovals").innerHTML = approvals.length
    ? approvals.map((a) => `<div class="inside">
        <h3>${esc(a.subject || a.title || "Draft")} <span class="muted sm">· ${esc(a.dept)} ${a.to ? `→ ${esc(a.to)}` : ""} · ${esc(ago(a.at || a.createdAt))}</span></h3>
        <p class="sm" style="white-space:pre-wrap">${esc(a.body || a.text || "")}</p>
        <div class="row">
          <button type="button" class="btn primary" data-draft-decide="${esc(a.id)}" data-approve="1">${String(a.to || "").toLowerCase() === "altradits@gmail.com" ? "Approve &amp; send to me" : "Approve &amp; send"}</button>
          <button type="button" class="btn" data-draft-decide="${esc(a.id)}" data-approve="0">Reject</button>
        </div>
      </div>`).join("")
    : '<p class="muted sm">No drafts waiting for approval right now.</p>';

  // 6. Continual learning engine
  const L = C.learning || {};
  $("#learnKpis").innerHTML =
      kpi("Active rules", num(L.totalRules || 0), "", "Distilled rules injected into specialist briefs.")
    + kpi("5★ exemplars", num(L.totalExemplars || 0), "", "Approved deliverables kept as gold standards.")
    + kpi("Answer Bank", num(L.answerBankCount || 0), "", "Stanley's past answers reused across tasks.");
  const byDept = (L.departments || []).map((d) => `${esc(d.dept)}: <b>${num((d.rules || []).length)}</b>`).join(" · ");
  $("#learnByDept").innerHTML = byDept ? `Rules by department: ${byDept}` : "";
  const allRules = (L.departments || []).flatMap((d) => (d.rules || []).map((r) => ({ ...r, dept: d.dept }))).slice(0, 20);
  $("#learnRules").innerHTML = allRules.length
    ? allRules.map((r) => `<div class="sm ev"><b>[${esc(r.dept)}]</b> ${esc(r.rule)} <span class="muted">(${esc(r.source || "distilled")})</span></div>`).join("")
    : '<p class="muted sm">No distilled rules yet. Pin a rule above or complete a review cycle.</p>';

  // 7. Settling-in report & open questions
  const S = C.settlingIn || {}, lesson = C.report?.lesson;
  $("#choumiSettling").innerHTML =
      `<p>${esc(S.summary || "")}</p>`
    + `<p><b>References:</b> <a href="${esc(S.issueUrl || "https://github.com/altradits/altradits/issues/248")}" target="_blank" rel="noopener">Settling-in report (#${esc(S.issueNumber || 248)})</a> · <a href="${esc(S.workingMemoryUrl || "https://github.com/altradits/altradits/issues/253")}" target="_blank" rel="noopener">Working memory (#${esc(S.workingMemoryIssue || 253)})</a></p>`
    + (S.decisions?.length ? `<b>Agreed guardrails</b><ul>${S.decisions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "")
    + (S.openQuestions?.length ? `<b>Open items for Stanley</b><ul>${S.openQuestions.map((q) => `<li>${esc(q.text)}</li>`).join("")}</ul>` : "")
    + (lesson ? `<div class="learn" style="margin-top:.8rem"><b>Today's security lesson:</b> ${esc(typeof lesson === "string" ? lesson : lesson.lesson || "")}</div>` : "");
}

function readDmChecklistInputs() {
  const out = {};
  document.querySelectorAll("[data-dm-check]").forEach((el) => { out[el.dataset.dmCheck] = el.checked; });
  return out;
}

$("#dmSaveCheck").addEventListener("click", async () => {
  try {
    await api("", { action: "deadman_checklist", checklist: readDmChecklistInputs() });
    toast("Neutralized checklist saved.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#dmToggle").addEventListener("click", async () => {
  const active = $("#dmToggle").dataset.active === "1";
  const note = $("#dmNote").value.trim();
  try {
    if (active) {
      await api("", { action: "deadman_lift", note: note || "Lifted from Choumi admin tab", checklist: readDmChecklistInputs() });
      toast("Deadman's Switch lifted.");
    } else {
      await api("", { action: "deadman_trip", reason: note || "Manual trigger from Choumi admin tab" });
      toast("Deadman's Switch tripped: lockdown active.");
    }
    $("#dmNote").value = "";
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#dmDrill").addEventListener("click", async () => {
  try {
    const r = await api("", { action: "deadman_drill", scenario: "monthly_admin_drill", lesson: $("#dmNote").value.trim() });
    toast("Local security drill passed.");
    $("#dmDrillNote").textContent = `Drill passed (${r.scenario}): ${r.lesson}`;
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#aiRecheck").addEventListener("click", async () => {
  try {
    await api("", { action: "ai_resume" });
    toast("AI circuit breaker re-checked.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

// Turning everything on spends credit in every department: it takes a second click.
let allOnArmed = 0;
$("#deptAllOn").addEventListener("click", async () => {
  const b = $("#deptAllOn");
  if (!allOnArmed) { allOnArmed = setTimeout(() => { allOnArmed = 0; b.textContent = "Turn all on"; }, 5000); b.textContent = "Click again to turn all on"; return; }
  clearTimeout(allOnArmed); allOnArmed = 0; b.textContent = "Turn all on";
  try { await api("", { action: "dept_power_all", on: true }); toast("All departments powered ON."); loadChoumi(); }
  catch (err) { toast(err.message, true, 6000); }
});

$("#deptAllOff").addEventListener("click", async () => {
  try { await api("", { action: "dept_power_all", on: false }); toast("All departments powered OFF."); loadChoumi(); }
  catch (err) { toast(err.message, true, 6000); }
});

$("#deptPowerList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-dept-power]");
  if (!btn) return;
  const dept = btn.dataset.deptPower, nextOn = btn.dataset.on !== "1";
  try {
    await api("", { action: "dept_power", dept, on: nextOn });
    toast(`${dept} turned ${nextOn ? "ON" : "OFF"}.`);
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#choumiQueueBtn").addEventListener("click", async () => {
  const title = $("#choumiInput").value.trim(), department = $("#choumiTaskDept").value;
  if (!title) { toast("Give the task a title first.", true); return; }
  try {
    const r = await api("", { action: "task_create", title, department });
    $("#choumiInput").value = "";
    $("#choumiActionReply").textContent = `Task ${r.task.id} (${r.task.department}): ${r.task.status}`;
    toast(`Task ${r.task.status} (${r.task.department}).`);
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#choumiWorkBtn").addEventListener("click", async () => {
  try {
    const r = await api("", { action: "task_work", budgetMs: 5000 });
    toast(r.count ? `Ran ${r.count} task(s).` : "No queued tasks to run (check department power buttons).");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#choumiTasks").addEventListener("click", async (e) => {
  const workBtn = e.target.closest("[data-task-work]");
  if (workBtn) {
    try {
      const r = await api("", { action: "task_work", budgetMs: 5000 });
      toast(r.count ? `Ran ${r.count} task(s).` : "No queued tasks ran (check department power buttons).");
      loadChoumi();
    } catch (err) { toast(err.message, true, 6000); }
    return;
  }
  const actBtn = e.target.closest("[data-task-act]");
  if (!actBtn) return;
  try {
    await api("", { action: "task_decide", id: actBtn.dataset.id, subaction: actBtn.dataset.taskAct, note: $("#choumiInput").value.trim() });
    toast(`Task ${actBtn.dataset.taskAct} complete.`);
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#choumiApprovals").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-draft-decide]");
  if (!btn) return;
  const id = btn.dataset.draftDecide, approve = btn.dataset.approve === "1";
  try {
    await api("", { action: "draft_decide", id, approve });
    toast(approve ? "Draft approved." : "Draft rejected.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#replyScreenBtn").addEventListener("click", async () => {
  try {
    const r = await api("", { action: "reply_screen", from: $("#replyFrom").value.trim(), dept: $("#replyDept").value, text: $("#replyText").value });
    toast(r.held ? `Held: ${(r.held.reasons || []).join(", ")}.` : "Clean. Safe to act on.");
    $("#replyFrom").value = ""; $("#replyText").value = "";
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#replyInbox").addEventListener("click", async (e) => {
  const rej = e.target.closest("[data-reply-reject]");
  if (rej) {
    if (!confirm("Send this department's fixed rejection message? Replies are never answered any other way.")) return;
    try {
      await api("", { action: "reply_reject", id: rej.dataset.replyReject });
      toast("Rejection sent. The writer was pointed to the contact form.");
      loadChoumi();
    } catch (err) { toast(err.message, true, 6000); }
    return;
  }
  const btn = e.target.closest("[data-reply-read]");
  if (!btn) return;
  try {
    await api("", { action: "reply_read", id: btn.dataset.replyRead });
    toast("Marked handled.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#contactInbox").addEventListener("click", async (e) => {
  const ack = e.target.closest("[data-contact-ack]"), read = e.target.closest("[data-contact-read]");
  if (!ack && !read) return;
  try {
    if (ack) { const r = await api("", { action: "contact_ack", id: ack.dataset.contactAck }); toast(`Acknowledgment queued for approval (${r.draft}).`); }
    else { await api("", { action: "contact_read", id: read.dataset.contactRead }); toast("Marked handled."); }
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#learnAddBtn").addEventListener("click", async () => {
  const note = $("#learnRuleText").value.trim(), dept = $("#learnDept").value;
  if (!note) { toast("Write a rule to pin first.", true); return; }
  try {
    await api("", { action: "learning_rule", dept, note });
    $("#learnRuleText").value = "";
    toast("Rule pinned to the learning engine.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

$("#learnConsolidateBtn").addEventListener("click", async () => {
  try {
    await api("", { action: "learning_consolidate" });
    toast("Learning rules consolidated.");
    loadChoumi();
  } catch (err) { toast(err.message, true, 6000); }
});

async function load() {
  let D;
  $("#loginErr").textContent = "Loading… reading the node can take a few seconds.";
  try { D = await api(""); } catch (err) { if (!$("#login").hidden) $("#loginErr").textContent = err.message; else toast(err.message, true, 8000); return; }
  $("#loginErr").textContent = "";
  $("#login").hidden = true; $("#app").hidden = false;
  KES_PER_BTC = D.kesPerBtc;
  OVERVIEW = D;
  renderChecklist(D); renderStan(D.stan, D.alerts); renderNode(D); renderChain(D); renderRouting(D); renderSettlement(D); renderGlossary(); renderBanner(D); renderBackup(D.backup);
  renderVerify();
  await Promise.allSettled([loadPower(), loadChannels(), loadSecurity(), loadMoney(), loadActivity(), loadExplorer(), loadPnl(), loadWallets(), loadDestinations(), loadChoumi(), loadMarketing()]);
  $("#checked").textContent = `Checked ${new Date().toLocaleTimeString()}`;
}
token ? load() : showLogin();
