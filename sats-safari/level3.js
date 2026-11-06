// Sats Safari, stop 3: Send It On. Build a transaction, sign it, and watch
// the friends refuse the same sats twice.
import { formatSats } from "./sats.js";

export const META = { id: 3, badge: "honest-sender", learned: ["l3.a", "l3.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FRIEND = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/><text x="12" y="10.5" text-anchor="middle" font-size="6" fill="currentColor" stroke="none">${n}</text></svg>`;

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(2 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);

  function roundSend() {
    ctx.hint(() => t("l3.hintSend"));
    let to = null;
    root.innerHTML = `${bar(0)}<h2>${esc(t("l3.sendTitle"))}</h2><p>${esc(t("l3.sendLine"))}</p>` +
      `<div class="tx"><div class="who"><div class="face">${FRIEND("•")}</div><p>${esc(t("l3.you"))}</p></div>` +
      `<div class="wire" id="s-wire" aria-hidden="true"><div class="fly" id="s-fly">●</div></div>` +
      `<div class="picks"><button type="button" class="pick" id="s-aza"><div class="face">${FRIEND("A")}</div><span>${esc(t("l3.aza"))}</span></button>` +
      `<button type="button" class="pick" id="s-juma"><div class="face">${FRIEND("J")}</div><span>${esc(t("l3.juma"))}</span></button></div></div>` +
      `<p><button type="button" class="btn" id="s-sign" disabled>${esc(t("l3.sign"))} (100)</button></p>`;
    const sign = root.querySelector("#s-sign");
    root.querySelector("#s-aza").addEventListener("click", (e) => {
      to = "aza";
      ctx.sound.play("click");
      root.querySelectorAll(".picks .pick").forEach((b) => b.classList.remove("sel"));
      e.currentTarget.classList.add("sel");
      sign.disabled = false;
    });
    root.querySelector("#s-juma").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      ctx.say(t("l3.wrongAddr"));
    });
    sign.addEventListener("click", () => {
      if (!to) return;
      sign.disabled = true;
      root.querySelector("#s-fly").classList.add("go");
      ctx.sound.play("coin");
      setTimeout(() => {
        ctx.say(t("l3.sent"));
        setTimeout(roundBack, 1100);
      }, 900);
    });
  }

  function roundBack() {
    ctx.hint(() => t("l3.hintBack"));
    root.innerHTML = `${bar(1)}<h2>${esc(t("l3.backTitle"))}</h2><p>${esc(t("l3.backLine"))}</p>` +
      `<p class="big-count">${esc(t("l3.you50"))}</p>` +
      `<div class="row-btns"><button type="button" class="btn" id="b-50">${esc(t("l3.pay50"))}</button>` +
      `<button type="button" class="btn ghost" id="b-100">${esc(t("l3.pay100"))}</button></div>` +
      `<div class="friends" id="b-friends" hidden><div class="friend no">${FRIEND("A")}<span>✕</span></div>` +
      `<div class="friend no">${FRIEND("J")}<span>✕</span></div><div class="friend no">${FRIEND("N")}<span>✕</span></div></div>`;
    root.querySelector("#b-100").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      root.querySelector("#b-friends").hidden = false;
      ctx.say(t("l3.refused", { have: formatSats(50) }));
    });
    root.querySelector("#b-50").addEventListener("click", () => {
      ctx.sound.play("coin");
      ctx.say(t("l3.sent50"));
      setTimeout(done, 1100);
    });
  }

  roundSend();
}
