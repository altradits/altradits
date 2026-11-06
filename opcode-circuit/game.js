// Opcode Circuit boot: routes, theme, service worker, campaign.
// Puzzle views arrive from content/views.js. This shell stays dependency free.
import { CHAPTERS } from "./content/chapters.js";
import { PUZZLES1 } from "./content/puzzles1.js";
import { PUZZLES2 } from "./content/puzzles2.js";
import { renderPuzzle, esc } from "./content/views.js";
import { loadState, saveState } from "./engine/store.js";
const app = document.getElementById("app");
const state = loadState();
saveState(state);
const ALL = [...PUZZLES1, ...PUZZLES2];
const byChapter = (id) => ALL.filter((p) => p.ch === id).sort((a, b) => a.n - b.n);
function themeInit() {
  const btn = document.getElementById("theme");
  let cur = null;
  try { cur = localStorage.getItem("opcode-circuit-theme"); } catch { /* private mode */ }
  if (cur === "light" || cur === "dark") document.documentElement.dataset.theme = cur;
  const label = () => { btn.textContent = document.documentElement.dataset.theme === "light" ? "Dark" : "Light"; };
  label();
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("opcode-circuit-theme", next); } catch { /* private mode */ }
    label();
  });
}
function nav(route) {
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.getAttribute("data-route") === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
function homeView() {
  nav("home");
  const items = CHAPTERS.map((c) => {
    const ps = byChapter(c.id);
    const solved = ps.filter((p) => state.solved[p.id]).length;
    const sub = ps.length ? `${solved} of ${ps.length} solved` : "Puzzles land in the chapter PRs";
    const done = ps.length && solved === ps.length ? " done" : "";
    return `<li class="card${done}"><h2><span class="n">${c.num}.</span> ${esc(c.title)}</h2><p>${esc(c.briefing)}</p><p>${sub}</p><a class="go" href="#/chapter/${c.id}">Open chapter&gt;</a></li>`;
  }).join("");
  app.innerHTML = `<section class="hero"><h1>Build it. Break it. <span class="cur">Prove it.</span></h1>`
    + `<p class="lead">Eight chapters of hands on puzzles. You parse bytes, mine blocks, write scripts, and route Lightning payments on a toy chain that never touches the network.</p></section>`
    + `<ul class="grid">${items}</ul>`;
}
function chapterView(id) {
  nav("home");
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) { app.innerHTML = `<p>Unknown chapter.</p><p><a href="#/">Back to campaign.</a></p>`; return; }
  const ps = byChapter(id);
  const src = c.sources.map((s) => `<li>${esc(s)}</li>`).join("");
  const list = ps.length
    ? `<ul class="grid">${ps.map((p) => `<li class="card${state.solved[p.id] ? " done" : ""}"><h2><span class="n">${esc(p.id)}</span> ${esc(p.title)}</h2><p>${esc(p.idea)}</p><p>${state.solved[p.id] ? `${state.stars[p.id]} of 3 stars` : "Unsolved"}</p><a class="go" href="#/puzzle/${p.id}">Open puzzle&gt;</a></li>`).join("")}</ul>`
    : `<p class="verdict">Puzzles for this chapter land in the chapter PRs.</p>`;
  app.innerHTML = `<section class="puz"><p><a href="#/">&lt; Campaign</a></p><h2>${c.num}. ${esc(c.title)}</h2>`
    + `<p class="brief">${esc(c.briefing)}</p>${list}`
    + `<div class="debrief"><h3>Sources</h3><ul>${src}</ul></div></section>`;
}
function puzzleView(id) {
  nav("home");
  const p = ALL.find((x) => x.id === id);
  if (!p) { app.innerHTML = `<p>Unknown puzzle.</p><p><a href="#/">Back to campaign.</a></p>`; return; }
  const ps = byChapter(p.ch);
  const i = ps.findIndex((x) => x.id === id);
  const nextId = i >= 0 && i + 1 < ps.length ? ps[i + 1].id : null;
  renderPuzzle(app, p, state, nextId);
}
function sandboxView() {
  nav("sandbox");
  app.innerHTML = `<section class="puz"><h2>Sandbox</h2><p class="brief">A free interpreter playground. Ships with the polish PR.</p></section>`;
}
function achievementsView() {
  nav("achievements");
  const list = state.achievements.length ? state.achievements.map((a) => `<li>${esc(a)}</li>`).join("") : "<li>None yet. Solve puzzles to earn them.</li>";
  app.innerHTML = `<section class="puz"><h2>Achievements</h2><ul>${list}</ul></section>`;
}
function route() {
  const h = location.hash || "#/";
  let m = h.match(/^#\/chapter\/([\w-]+)/);
  if (m) { chapterView(m[1]); return; }
  m = h.match(/^#\/puzzle\/([\w-]+)/);
  if (m) { puzzleView(m[1]); return; }
  if (h.startsWith("#/sandbox")) { sandboxView(); return; }
  if (h.startsWith("#/achievements")) { achievementsView(); return; }
  homeView();
}
document.querySelectorAll("[data-route]").forEach((a) => {
  a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const r = a.getAttribute("data-route");
    location.hash = r === "home" ? "#/" : `#/${r}`;
  });
});
window.addEventListener("hashchange", route);
themeInit();
route();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline is best effort */ });
  });
}
