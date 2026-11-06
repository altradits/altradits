// Mempool Mayhem in the browser: shows games, takes seats, answers live.
// The page never decides anything. The server opens and closes rounds on its
// own clock, stamps every reply, and checks correctness at resolve time. The
// countdown below is display only: a reply counts only if it reaches the
// server before the deadline. Same-site calls only, short polling (the
// shared host holds no long connections well). Every server word is escaped.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: play still works */ } },
  };
  const S = { game: store.get("trv-game"), account: store.get("trv-account"), play: null, busy: false, donorTimer: null, booksTimer: null };

  async function call(path, opts) {
    const r = await fetch(path, opts); // same-site paths only, never an outside host
    return r.json();
  }
  const playUrl = () => `/api/trivia?view=play&game=${encodeURIComponent(S.game)}${S.account ? `&account=${encodeURIComponent(S.account)}` : ""}`;

  function setStatus(text) { $("live-status").textContent = text; }

  async function loadGames() {
    let r;
    try { r = await call("/api/trivia?view=games"); } catch { return; }
    const games = Array.isArray(r.games) ? r.games : [];
    for (const id of ["game", "fund-game", "books-game"]) {
      const sel = $(id);
      sel.innerHTML = games.length ? "" : `<option value="">No games yet</option>`;
      for (const g of games) {
        const o = document.createElement("option");
        o.value = g.id;
        o.textContent = `${g.title} (${g.status}, ${g.players} players)`;
        sel.appendChild(o);
      }
    }
    const list = $("games-list");
    list.innerHTML = "";
    if (!games.length) {
      list.innerHTML = "<li><span class=\"t\">No games yet.</span> <span class=\"s\">Check back soon, or fund the first pool below.</span></li>";
      return;
    }
    if (!games.some((g) => g.id === S.game)) S.game = (games.find((g) => g.status === "live") || games[0]).id;
    for (const id of ["game", "fund-game", "books-game"]) $(id).value = S.game;
    for (const g of games.slice(0, 6)) {
      const li = document.createElement("li");
      const when = g.startsAt ? ` Starts ${esc(new Date(g.startsAt).toLocaleString())}.` : "";
      const won = g.status === "over" && g.winners.length ? ` Won by ${esc(g.winners.join(", "))}.` : "";
      li.innerHTML = `<span class="t">${esc(g.title)}</span> <span class="s">${esc(g.status)}. ${g.players} players.${when}${won}</span>`;
      list.appendChild(li);
    }
  }

  async function pollPlay() {
    if (S.busy || !S.game || document.visibilityState === "hidden") return;
    S.busy = true;
    try {
      const v = await call(playUrl());
      if (v.error) { setStatus(v.error); S.play = null; render(); return; }
      S.play = v;
      render();
    } catch { setStatus("No connection. Trying again."); }
    finally { S.busy = false; }
  }

  function render() {
    const v = S.play;
    if (!v) return;
    const live = v.status === "live" && v.question;
    setStatus(v.status === "live" ? (v.question ? `Round ${v.round + 1} of ${v.totalRounds}.` : "Between rounds.") :
      v.status === "over" ? (v.winners.length ? `Won by ${v.winners.join(", ")}.` : "Game over.") :
      v.status === "cancelled" ? "This game was cancelled." :
      v.startsAt ? `Starts ${new Date(v.startsAt).toLocaleString()}.` : "Waiting to start. Take a seat below.");
    $("live-q").hidden = !live;
    if (live) {
      const q = v.question;
      $("q-round").textContent = `Round ${q.round + 1} of ${v.totalRounds}`;
      $("q-level").textContent = q.level;
      $("q-text").textContent = q.q;
      $("q-sw").hidden = !q.q_sw;
      if (q.q_sw) $("q-sw").textContent = q.q_sw;
      $("q-answers").textContent = `${q.answersIn} of ${q.alive} answers in.`;
      const box = $("q-choices");
      box.innerHTML = "";
      const lock = !v.me || !v.me.alive || v.me.answered;
      (q.choices || []).forEach((c, i) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = c;
        b.disabled = lock;
        b.addEventListener("click", () => answer(i, b));
        li.appendChild(b);
        box.appendChild(li);
      });
    }
    const last = $("live-last");
    if (v.lastResult) {
      const r = v.lastResult;
      const rows = r.outcomes.map((o) => `<li>${esc(o.name)}: ${o.answered ? (o.correct ? "right" : "wrong") : "silent"}. ${o.score} points, ${o.lives} lives.</li>`).join("");
      last.innerHTML = `<h3>Round ${r.round + 1} answer</h3><p class="status">The right answer was choice ${r.answer + 1}.</p><ul class="games">${rows}</ul>`;
      last.hidden = false;
    } else { last.hidden = true; last.innerHTML = ""; }
    $("board-body").innerHTML = v.ranks.map((p) =>
      `<tr><td class="num">${p.rank}</td><td>${esc(p.name)}</td><td class="num">${fmt(p.score)}</td><td class="num">${p.lives}</td><td class="num">${fmt(v.battle[p.id] ?? 0)}</td></tr>`).join("");
    const me = $("live-me");
    if (v.me) {
      me.hidden = false;
      me.innerHTML = `Playing as <b>${esc(v.me.name)}</b>. <b>${fmt(v.me.score)}</b> points, <b>${v.me.lives}</b> lives, <b>${fmt(v.me.battleSats)}</b> battle sats.${v.me.answered ? " Your answer is in." : ""}`;
    } else {
      me.hidden = !S.account;
      if (S.account) me.textContent = "That account has no seat in this game.";
    }
  }

  function tick() {
    const v = S.play;
    if (!v || v.status !== "live" || !v.question) { $("q-bar").style.width = "0"; $("q-left").textContent = ""; return; }
    const left = Math.max(0, v.question.deadlineMs - Date.now());
    const total = 20000;
    $("q-bar").style.width = `${Math.round((100 * left) / total)}%`;
    $("q-left").textContent = left > 0 ? `${(left / 1000).toFixed(1)} seconds left.` : "Closing on the server.";
  }

  async function answer(index, btn) {
    if (!S.account) { $("live-err").textContent = "Take a seat first, then answer."; return; }
    $("live-err").textContent = "";
    btn.disabled = true;
    let r;
    try {
      r = await call("/api/trivia", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", game: S.game, account: S.account, index }) });
    } catch { $("live-err").textContent = "No connection. Try again."; btn.disabled = false; return; }
    if (r.error) { $("live-err").textContent = r.error; btn.disabled = false; return; }
    btn.classList.add("picked");
    for (const b of $("q-choices").querySelectorAll("button")) b.disabled = true;
    pollPlay();
  }

  async function loadPool() {
    if (!S.game) return;
    let r;
    try { r = await call(`/api/trivia?view=pool&game=${encodeURIComponent(S.game)}`); } catch { return; }
    if (r.error) return;
    $("pool-line").textContent = `${fmt(r.poolSats)} sats in the pool from ${r.donorsPaid} paid donations.`;
    $("wall").innerHTML = (r.messages || []).map((m) =>
      `<li><p class="m">${esc(m.message)}</p><p class="w">${fmt(m.sats)} sats for ${esc(m.target.kind)} ${esc(m.target.id)}.</p></li>`).join("");
  }

  async function loadBooks() {
    if (!$("books-game").value) return;
    const g = $("books-game").value;
    $("books-err").textContent = "";
    let pool, ledger;
    try {
      [pool, ledger] = await Promise.all([
        call(`/api/trivia?view=pool&game=${encodeURIComponent(g)}`),
        call(`/api/trivia?view=ledger&game=${encodeURIComponent(g)}&limit=200`),
      ]);
    } catch { $("books-err").textContent = "No connection. Try again."; return; }
    if (pool.error) { $("books-err").textContent = pool.error; return; }
    if (ledger.error) { $("books-err").textContent = ledger.error; return; }
    $("books-pool").textContent = `${pool.title}: ${fmt(ledger.totals.net)} sats net across ${ledger.totals.count} entries. In ${fmt(ledger.totals.in)}, out ${fmt(ledger.totals.out)}.`;
    $("books-ledger").innerHTML = ledger.entries.map((e) =>
      `<tr><td class="num">${e.seq}</td><td>${esc(e.kind)}</td><td class="num">${fmt(e.sats)}</td><td>${esc(e.note || "")}</td><td>${esc((e.at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("");
  }

  async function init() {
    try {
      const h = await call("/api/trivia");
      if (h && h.on === false) $("trivia-off").hidden = false;
    } catch { /* the sections below report their own state */ }
    await loadGames();
    if (S.account) $("join-account").value = S.account;
    for (const id of ["game", "fund-game", "books-game"]) {
      $(id).addEventListener("change", (e) => {
        S.game = e.target.value;
        store.set("trv-game", S.game);
        for (const other of ["game", "fund-game", "books-game"]) $(other).value = S.game;
        pollPlay();
        loadPool();
      });
    }
    $("join-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("join-err").textContent = "";
      $("join-ok").textContent = "";
      const name = $("join-name").value.trim();
      const account = $("join-account").value.trim().toLowerCase();
      let r;
      try {
        r = await call("/api/trivia", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", game: $("game").value, name, account }) });
      } catch { $("join-err").textContent = "No connection. Try again."; return; }
      if (r.error) { $("join-err").textContent = r.error; return; }
      S.account = account;
      store.set("trv-account", account);
      $("join-ok").textContent = `Seat taken as ${r.player.name}. Good luck.`;
      pollPlay();
    });
    $("fund-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("fund-err").textContent = "";
      let r;
      try {
        r = await call("/api/trivia", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fund", game: $("fund-game").value, sats: Number($("fund-sats").value),
            target: { kind: $("fund-kind").value, id: $("fund-target").value.trim() || undefined },
            message: $("fund-msg").value.trim() || undefined }) });
      } catch { $("fund-err").textContent = "No connection. Try again."; return; }
      if (r.error) { $("fund-err").textContent = r.error; return; }
      $("fund-qr").innerHTML = r.qr;
      $("fund-bolt").value = r.bolt11;
      $("fund-open").href = `lightning:${r.bolt11}`;
      $("fund-invoice").hidden = false;
      $("fund-state").textContent = "Waiting for payment.";
      clearInterval(S.donorTimer);
      S.donorTimer = setInterval(async () => {
        if (Date.parse(r.expiresAt) < Date.now()) { clearInterval(S.donorTimer); $("fund-state").textContent = "This invoice expired. Make a new one."; return; }
        try {
          const s = await call(`/api/trivia?view=donor&hash=${r.hash}`);
          if (s.state === "paid") { clearInterval(S.donorTimer); $("fund-state").textContent = "Received. Thank you."; loadPool(); }
        } catch { /* keep waiting */ }
      }, 4000);
    });
    $("fund-copy").addEventListener("click", () => {
      if (navigator.clipboard) navigator.clipboard.writeText($("fund-bolt").value).then(() => { $("fund-copy").textContent = "Copied"; }).catch(() => {});
    });
    $("books-btn").addEventListener("click", loadBooks);
    pollPlay();
    loadPool();
    setInterval(pollPlay, 2500);
    setInterval(tick, 250);
    clearInterval(S.booksTimer);
    S.booksTimer = setInterval(() => { if ($("books-ledger").rows.length) loadBooks(); }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
