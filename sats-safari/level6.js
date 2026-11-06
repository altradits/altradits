// Sats Safari, stop 6: Friends Agree. Everyone keeps the same list of
// blocks. The longest VALID list wins, and nobody is the boss.
import { longestValid } from "./chain.js";

export const META = { id: 6, badge: "fair-friend", learned: ["l6.a", "l6.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  // blocks: pile height. Mosi's pile is tallest but its link 2 is broken.
  const friends = [
    { name: "Aza", blocks: 3, valid: true },
    { name: "Juma", blocks: 3, valid: true },
    { name: "Mosi", blocks: 4, valid: false, brokenAt: 2 },
    { name: "Zuri", blocks: 2, valid: true },
  ];
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(3 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);

  const pile = (f, showBroken) => `<span class="pile" aria-hidden="true">${Array(f.blocks).fill(0).map((_, i) =>
    `<span class="cube${showBroken && !f.valid && i === f.brokenAt ? " bad" : ""}">${showBroken && !f.valid && i === f.brokenAt ? "✕" : ""}</span>`).join("")}</span>`;

  function roundLongest() {
    ctx.hint(() => t("l6.hintLongest"));
    root.innerHTML = `${bar(0)}<h2>${esc(t("l6.longTitle"))}</h2><p>${esc(t("l6.longLine"))}</p>` +
      `<div class="friends4">${friends.map((f, i) =>
        `<button type="button" class="fcard" data-f="${i}">${pile(f, false)}<span class="fname">${esc(f.name)}</span>` +
        `<span class="fcount">${esc(t("l6.blocks", { n: f.blocks }))}</span></button>`).join("")}</div>`;
    root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
      const f = friends[Number(b.dataset.f)];
      if (f.blocks === 4) {
        ctx.sound.play("star");
        ctx.say(t("l6.longestFound"));
        setTimeout(roundValid, 1100);
      } else {
        mistakes++;
        ctx.sound.play("bad");
        ctx.say(t("l6.countAgain"));
      }
    }));
  }

  function roundValid() {
    ctx.hint(() => t("l6.hintValid"));
    const mosi = friends[2];
    root.innerHTML = `${bar(1)}<h2>${esc(t("l6.validTitle"))}</h2><p>${esc(t("l6.validLine"))}</p>` +
      `<div class="mosi">${pile(mosi, true)}<span class="fname">${esc(mosi.name)}</span></div>` +
      `<div class="row-btns"><button type="button" class="btn" id="v-broken">${esc(t("l6.broken"))}</button>` +
      `<button type="button" class="btn ghost" id="v-valid">${esc(t("l6.valid"))}</button></div>`;
    root.querySelector("#v-broken").addEventListener("click", () => {
      ctx.sound.play("star");
      ctx.say(t("l6.disqualified"));
      setTimeout(roundWinner, 1300);
    });
    root.querySelector("#v-valid").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      ctx.say(t("l6.lookClose"));
    });
  }

  function roundWinner() {
    ctx.hint(() => t("l6.hintWinner"));
    root.innerHTML = `${bar(2)}<h2>${esc(t("l6.winTitle"))}</h2><p>${esc(t("l6.winLine"))}</p>` +
      `<div class="friends4">${friends.map((f, i) =>
        `<button type="button" class="fcard${f.valid ? "" : " out"}" data-f="${i}" ${f.valid ? "" : "disabled"}>${pile(f, false)}` +
        `<span class="fname">${esc(f.name)}</span><span class="fcount">${esc(t("l6.blocks", { n: f.blocks }))}</span></button>`).join("")}</div>`;
    root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.f);
      const w = longestValid(friends);
      if (i === w || (friends[i].blocks === friends[w].blocks && friends[i].valid)) {
        ctx.sound.play("star");
        setTimeout(roundBoss, 900);
      } else {
        mistakes++;
        ctx.sound.play("bad");
        ctx.say(t("l6.shorter"));
      }
    }));
  }

  function roundBoss() {
    root.innerHTML = `${bar(2)}<h2>${esc(t("l6.bossTitle"))}</h2>` +
      `<div class="fox"><div class="face boss">♛</div><p class="bubble">${esc(t("l6.bossLine"))}</p></div>` +
      `<div class="row-btns"><button type="button" class="btn" id="b-list">${esc(t("l6.followList"))}</button>` +
      `<button type="button" class="btn ghost" id="b-obey">${esc(t("l6.obey"))}</button></div>`;
    root.querySelector("#b-list").addEventListener("click", () => {
      ctx.sound.play("win");
      setTimeout(done, 600);
    });
    root.querySelector("#b-obey").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      ctx.say(t("l6.noBoss"));
    });
  }

  roundLongest();
}
