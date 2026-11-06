// Sats Safari, stop 7: Only 21 Million. A story in four seasons: new coins
// halve again and again, and the total can never pass 21 million.
import { subsidyAt, totalAt, HALVING_BLOCKS } from "./supply.js";
import { toBTC } from "./sats.js";

export const META = { id: 7, badge: "treasure-keeper", learned: ["l7.a", "l7.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TREE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M12 15v5M9 20h6"/><circle cx="10" cy="8" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/></svg>';

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(3 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);

  function roundStory() {
    ctx.hint(() => t("l7.hintStory"));
    let era = 0;
    const draw = () => {
      const sub = subsidyAt(era * HALVING_BLOCKS);
      const total = toBTC(totalAt(era * HALVING_BLOCKS)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      root.innerHTML = `${bar(0)}<h2>${esc(t("l7.storyTitle"))}</h2>` +
        `<div class="season"><div class="tree">${TREE}</div>` +
        `<p class="big-count">${esc(t("l7.season", { n: era + 1 }))}</p>` +
        `<p>${esc(t("l7.gives", { coins: toBTC(sub) }))}</p>` +
        (era > 0 ? `<p>${esc(t("l7.totalSoFar", { total }))}</p>` : "") +
        `<button type="button" class="btn" id="s-next">${esc(era < 3 ? t("l7.nextSeason") : t("l1.next"))}</button></div>`;
      root.querySelector("#s-next").addEventListener("click", () => {
        ctx.sound.play("coin");
        era++;
        if (era < 4) draw();
        else roundCap();
      });
    };
    draw();
  }

  function roundCap() {
    ctx.hint(() => t("l7.hintCap"));
    root.innerHTML = `${bar(1)}<h2>${esc(t("l7.capTitle"))}</h2><p>${esc(t("l7.capLine"))}</p>` +
      `<div class="row-btns"><button type="button" class="btn" data-cap="21">${esc(t("l7.opt21"))}</button>` +
      `<button type="button" class="btn ghost" data-cap="100">${esc(t("l7.opt100"))}</button>` +
      `<button type="button" class="btn ghost" data-cap="endless">${esc(t("l7.optEndless"))}</button></div>`;
    root.querySelectorAll("[data-cap]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.cap === "21") {
        ctx.sound.play("star");
        ctx.say(t("l7.capRight"));
        setTimeout(roundNext, 1200);
      } else {
        mistakes++;
        ctx.sound.play("bad");
        ctx.say(t("l7.capWrong"));
      }
    }));
  }

  function roundNext() {
    ctx.hint(() => t("l7.hintNext"));
    root.innerHTML = `${bar(2)}<h2>${esc(t("l7.nextTitle"))}</h2><p>${esc(t("l7.nextLine"))}</p>` +
      `<div class="row-btns"><button type="button" class="btn" data-n="3.125">3.125</button>` +
      `<button type="button" class="btn ghost" data-n="6.25">6.25</button>` +
      `<button type="button" class="btn ghost" data-n="50">50</button></div>`;
    root.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.n === "3.125") {
        ctx.sound.play("win");
        setTimeout(done, 600);
      } else {
        mistakes++;
        ctx.sound.play("bad");
        ctx.say(t("l7.nextWrong"));
      }
    }));
  }

  roundStory();
}
