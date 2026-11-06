// Sats Safari, stop 5: The Guessing Game. Guess nonces until the hash starts
// with zeros, then feel difficulty move up and down. Real SHA-256, tiny
// pretend targets.
import { mine, retarget, meetsDifficulty, } from "./mining.js";
import { webHash } from "./chain.js";

export const META = { id: 5, badge: "lucky-guesser", learned: ["l5.a", "l5.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0, left = false;
  ctx.onLeave(() => { left = true; });
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(3 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
  const header = "Block 8|sunny-42";

  async function roundTap() {
    ctx.hint(() => t("l5.hintTap"));
    let nonce = -1;
    const tries = [];
    const draw = () => {
      root.innerHTML = `${bar(0)}<h2>${esc(t("l5.tapTitle"))}</h2><p>${esc(t("l5.tapLine"))}</p>` +
        `<p class="target">${esc(t("l5.target", { zeros: "0" }))}</p>` +
        `<ol class="tries" id="t-tries">${tries.slice(0, 4).map((x) => `<li>${x.nonce} → <code>${x.hash.slice(0, 8)}…</code> ${x.win ? "✓" : ""}</li>`).join("")}</ol>` +
        `<button type="button" class="btn" id="t-guess">${esc(t("l5.guess"))}</button>`;
      root.querySelector("#t-guess").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        nonce++;
        const h = await webHash(`${header}${nonce}`);
        const win = meetsDifficulty(h, 1);
        tries.unshift({ nonce, hash: h, win });
        ctx.sound.play(win ? "star" : "click");
        draw();
        if (win) {
          ctx.say(t("l5.found", { nonce }));
          setTimeout(roundAuto, 1400);
        }
      });
    };
    draw();
  }

  async function roundAuto() {
    ctx.hint(() => t("l5.hintAuto"));
    let mining = false;
    root.innerHTML = `${bar(1)}<h2>${esc(t("l5.autoTitle"))}</h2><p>${esc(t("l5.autoLine"))}</p>` +
      `<p class="target">${esc(t("l5.target", { zeros: "00" }))}</p>` +
      `<p class="big-count" id="a-status" aria-live="polite"></p>` +
      `<button type="button" class="btn" id="a-mine">${esc(t("l5.mine"))}</button>`;
    root.querySelector("#a-mine").addEventListener("click", async (e) => {
      if (mining) return;
      mining = true;
      e.currentTarget.disabled = true;
      const slowHash = async (x) => {
        const h = await webHash(x);
        await sleep(30);
        return h;
      };
      try {
        const r = await mine(header, 2, slowHash, (n, h) => {
          if (left) return;
          if (n % 25 === 0) ctx.sound.play("click");
          const el = root.querySelector("#a-status");
          if (el) el.textContent = `${t("l5.trying")} ${n} → ${h.slice(0, 8)}…`;
        }, () => left);
        if (left) return;
        ctx.sound.play("win");
        ctx.say(t("l5.found2", { nonce: r.nonce, guesses: r.guesses }));
        setTimeout(roundPace, 1600);
      } catch { /* stopped: the player left */ }
    });
  }

  function roundPace() {
    ctx.hint(() => t("l5.hintPace"));
    let zeros = 2, step = 0;
    const draw = () => {
      const fast = step === 0;
      root.innerHTML = `${bar(2)}<h2>${esc(t("l5.paceTitle"))}</h2>` +
        `<p class="big-count">${esc(fast ? t("l5.tooFast") : t("l5.tooSlow"))}</p>` +
        `<p>${esc(t("l5.zerosNow", { zeros: "0".repeat(zeros) }))}</p>` +
        `<div class="row-btns"><button type="button" class="btn" id="p-harder">${esc(t("l5.harder"))}</button>` +
        `<button type="button" class="btn ghost" id="p-easier">${esc(t("l5.easier"))}</button></div>`;
      root.querySelector("#p-harder").addEventListener("click", () => pick(true, fast));
      root.querySelector("#p-easier").addEventListener("click", () => pick(false, fast));
    };
    const pick = (harder, fast) => {
      if (harder === fast) {
        zeros = retarget(zeros, fast ? 120 : 1800, 600);
        ctx.sound.play("star");
        step++;
        if (step === 2) {
          root.innerHTML = `${bar(2)}<div class="reveal"><p class="big-count">${esc(t("l5.tenMin"))}</p>` +
            `<button type="button" class="btn" id="p-done">${esc(t("l1.next"))}</button></div>`;
          root.querySelector("#p-done").addEventListener("click", () => { ctx.sound.play("click"); done(); });
        } else draw();
      } else {
        mistakes++;
        ctx.sound.play("bad");
        ctx.say(fast ? t("l5.wrongFast") : t("l5.wrongSlow"));
      }
    };
    draw();
  }

  roundTap();
}
