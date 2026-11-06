// Sats Safari: the shell. Menu, journey map, level host and the
// "what you learned" card. Levels arrive as level1.js..level7.js; SHIPPED
// lists the ones this build carries, so unshipped stops show "soon".
import { loadLang, t, applyStatic, currentLang } from "./i18n.js";
import { loadProgress, saveProgress, isUnlocked, awardStars, awardBadge, totalStars, fresh } from "./progress.js";
import { play, setEnabled } from "./sound.js";

export const SHIPPED = [1, 2, 3, 4, 5, 6, 7];
const STOPS = 7;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Original geometric icons, one per stop. Stroke only, currentColor.
const ICONS = {
  1: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  2: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4"/><path d="M12 12h8M17 12v4M20 12v3"/></svg>',
  3: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10M13 8l4 4-4 4"/></svg>',
  4: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="7" height="7" rx="1.5"/><rect x="14" y="9" width="7" height="7" rx="1.5"/><path d="M10 12.5h4"/></svg>',
  5: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.3-1 .9-1 1.7"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>',
  6: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8M8.5 6h7"/></svg>',
  7: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M12 15v5M9 20h6"/><circle cx="10" cy="8" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/></svg>',
};
const SUN = '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke-linecap="round"><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M52 12l-6 6M18 46l-6 6"/></g><circle cx="32" cy="32" r="13"/><circle cx="27.5" cy="30" r="1.8" fill="currentColor" stroke="none"/><circle cx="36.5" cy="30" r="1.8" fill="currentColor" stroke="none"/><path d="M27 35.5a6 6 0 0 0 10 0"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="9" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>';

let progress = fresh();
let hintFn = null;
let leaveFns = [];
let toastTimer = 0;

function showToast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function show(name) {
  for (const s of ["menu", "map", "level"]) $(`screen-${s}`).hidden = s !== name;
  if (name !== "level") $("modal").hidden = true;
  window.scrollTo(0, 0);
}

function starRow(earned) {
  let out = "";
  for (let i = 1; i <= 3; i++) out += `<span class="star${i <= earned ? " lit" : ""}" aria-hidden="true">★</span>`;
  return `<span class="stars" role="img" aria-label="${esc(t("learned.stars", { n: earned }))}">${out}</span>`;
}

function renderMenu() {
  show("menu");
  $("menu-sun").innerHTML = SUN;
  $("menu-stars").innerHTML = totalStars(progress) > 0
    ? `<p class="have">${esc(t("map.stars"))}: ${totalStars(progress)} / ${STOPS * 3}</p>` : "";
}

function stopState(n) {
  if (!SHIPPED.includes(n)) return "soon";
  if ((progress.stars[String(n)] || 0) > 0) return "done";
  if (!isUnlocked(progress, n)) return "locked";
  return "open";
}

function renderMap() {
  show("map");
  const ol = $("stops");
  ol.innerHTML = "";
  for (let n = 1; n <= STOPS; n++) {
    const state = stopState(n);
    const li = document.createElement("li");
    li.className = `stop ${state}`;
    const name = t(`levels.${n}.name`), line = t(`levels.${n}.line`);
    const stars = progress.stars[String(n)] || 0;
    li.innerHTML =
      `<button type="button" data-stop="${n}" ${state === "open" || state === "done" ? "" : "aria-disabled=\"true\""}>` +
      `<span class="node">${state === "locked" ? LOCK : ICONS[n]}<span class="num">${n}</span></span>` +
      `<span class="words"><span class="name">${esc(name)}</span><span class="line">${esc(line)}</span></span>` +
      `<span class="mark">${state === "done" ? starRow(stars) : state === "open" ? `<span class="pill go">${esc(t("map.open"))}</span>`
        : state === "locked" ? `<span class="pill">${esc(t("map.locked"))}</span>` : `<span class="pill">${esc(t("map.soon"))}</span>`}</span></button>`;
    ol.appendChild(li);
  }
  $("map-total").textContent = `${t("map.stars")}: ${totalStars(progress)} / ${STOPS * 3}`;
  ol.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.stop);
    const state = stopState(n);
    if (state === "open" || state === "done") { play("click"); location.hash = `#/level/${n}`; }
    else if (state === "locked") { play("bad"); showToast(t("map.finishPrev")); }
    else { play("bad"); showToast(t("map.comingSoon")); }
  }));
}

async function renderLevel(n) {
  show("level");
  hintFn = null;
  if (!SHIPPED.includes(n) || !isUnlocked(progress, n)) { location.hash = "#/map"; return; }
  $("level-kicker").textContent = `${t("level.stop")} ${n} ${t("level.of")} ${STOPS}`;
  $("level-name").textContent = t(`levels.${n}.name`);
  const root = $("level-root");
  root.innerHTML = `<p class="loading">${esc(t("common.loading"))}</p>`;
  let mod;
  try {
    mod = await import(`/sats-safari/level${n}.js`);
  } catch {
    showToast(t("map.comingSoon"));
    location.hash = "#/map";
    return;
  }
  root.innerHTML = "";
  const ctx = {
    t, say: showToast, sound: { play },
    hint(fn) { hintFn = fn; $("btn-hint").hidden = false; },
    onLeave(fn) { leaveFns.push(fn); },
    finish(stars) { finishLevel(n, mod.META, stars); },
  };
  try {
    mod.start(root, ctx);
  } catch {
    showToast(t("map.comingSoon"));
    location.hash = "#/map";
  }
}

function finishLevel(n, meta, stars) {
  const earned = awardStars(progress, n, stars);
  const isNew = awardBadge(progress, meta.badge);
  play("win");
  setTimeout(() => play("star"), 350);
  const m = $("modal");
  m.innerHTML =
    `<div class="card" role="dialog" aria-modal="true" aria-labelledby="learned-h">` +
    `<h2 id="learned-h">${esc(t("learned.title"))}</h2>` +
    `<div class="big-stars" aria-hidden="true">${[1, 2, 3].map((i) =>
      `<span class="star${i <= earned ? " lit pop" : ""}" style="animation-delay:${i * 0.25}s">★</span>`).join("")}</div>` +
    `<p class="earned">${esc(t("learned.stars", { n: earned }))}</p>` +
    (isNew ? `<p class="badge-line"><span class="badge-dot" aria-hidden="true"></span>${esc(t("learned.badge"))}: ${esc(t(`levels.${n}.badge`))}</p>` : "") +
    `<ul class="points">${meta.learned.map((k) => `<li>${esc(t(k))}</li>`).join("")}</ul>` +
    `<p class="cite">${esc(t("learned.cite", { s: t(`levels.${n}.cite`) }))}</p>` +
    `<div class="row">` +
    (n < STOPS && SHIPPED.includes(n + 1) ? `<button type="button" class="btn" id="btn-next">${esc(t("learned.next"))}</button>` : "") +
    `<button type="button" class="btn ghost" id="btn-again">${esc(t("learned.again"))}</button>` +
    `<button type="button" class="btn ghost" id="btn-tomap">${esc(t("learned.map"))}</button></div></div>`;
  m.hidden = false;
  $("btn-again").addEventListener("click", () => { play("click"); m.hidden = true; renderLevel(n); });
  $("btn-tomap").addEventListener("click", () => { play("click"); location.hash = "#/map"; });
  const next = $("btn-next");
  if (next) next.addEventListener("click", () => { play("click"); location.hash = `#/level/${n + 1}`; });
  $("btn-again").focus();
}

function route() {
  for (const f of leaveFns) { try { f(); } catch { /* leaving never fails */ } }
  leaveFns = [];
  const h = location.hash || "#/menu";
  const level = h.match(/^#\/level\/([1-7])$/);
  syncChrome();
  applyStatic();
  if (level) renderLevel(Number(level[1]));
  else if (h === "#/map") renderMap();
  else renderMenu();
}

async function boot() {
  progress = loadProgress();
  setEnabled(progress.sound);
  try {
    await loadLang(progress.lang);
  } catch {
    $("boot-error").hidden = false;
    return;
  }
  $("btn-play").addEventListener("click", () => { play("click"); location.hash = "#/map"; });
  $("btn-tomenu").addEventListener("click", () => { play("click"); location.hash = "#/menu"; });
  $("btn-level-map").addEventListener("click", () => { play("click"); location.hash = "#/map"; });
  $("btn-hint").addEventListener("click", () => { if (hintFn) { play("click"); showToast(hintFn()); } });
  $("btn-lang").addEventListener("click", async () => {
    const next = currentLang() === "en" ? "sw" : "en";
    await loadLang(next);
    progress.lang = currentLang();
    saveProgress(progress);
    syncChrome();
    route();
  });
  $("btn-sound").addEventListener("click", () => {
    progress.sound = !progress.sound;
    setEnabled(progress.sound);
    saveProgress(progress);
    syncChrome();
    play("click");
  });
  window.addEventListener("hashchange", route);
  syncChrome();
  route();
  if ("serviceWorker" in navigator) {
    // boot() awaits the words first, so the load event may already be gone.
    const install = () => navigator.serviceWorker.register("/sats-safari/sw.js").catch(() => {});
    if (document.readyState === "complete") install();
    else window.addEventListener("load", install);
  }
}

function syncChrome() {
  $("btn-lang").textContent = currentLang() === "en" ? "Kiswahili" : "English";
  const on = progress.sound;
  $("btn-sound").textContent = on ? t("nav.soundOn") : t("nav.soundOff");
  $("btn-sound").setAttribute("aria-pressed", String(on));
}

boot();
