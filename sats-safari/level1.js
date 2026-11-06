// Sats Safari, stop 1: Sats Market. Count sats, fill one whole bitcoin, and
// buy a mango with exact change. Uses sats.js for every amount.
import { SATS_PER_BTC, formatSats, toBTC } from "./sats.js";

export const META = { id: 1, badge: "coin-counter", learned: ["l1.a", "l1.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>';
const MANGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c4 0 7 3 7 7.5S16 20 12 20s-7-3.5-7-8S8 5 12 5z"/><path d="M12 5c0-2 1.5-3 3-3.5"/></svg>';

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  const say = ctx.say;
  const coin = () => ctx.sound.play("coin");

  const bar = (done, total) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(total - done)}</p>`;

  function roundCount() {
    ctx.hint(() => t("l1.hintCount"));
    const total = 7;
    let got = 0;
    root.innerHTML = `${bar(0, 3)}<h2>${esc(t("l1.countTitle"))}</h2><p>${esc(t("l1.countLine"))}</p>` +
      `<p class="big-count" aria-live="polite"><span id="c-n">0</span> / ${total}</p>` +
      `<div class="coins" id="c-coins">${Array(total).fill(`<button type="button" class="coin" aria-label="sat">${COIN}</button>`).join("")}</div>`;
    const coins = [...root.querySelectorAll(".coin")];
    coins.forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      b.disabled = true;
      coin();
      got++;
      root.querySelector("#c-n").textContent = got;
      if (got === total) setTimeout(roundFill, 450);
    }));
  }

  function roundFill() {
    ctx.hint(() => t("l1.hintFill"));
    const step = 10_000_000;
    let filled = 0;
    root.innerHTML = `${bar(1, 3)}<h2>${esc(t("l1.fillTitle"))}</h2><p>${esc(t("l1.fillLine"))}</p>` +
      `<div class="jar" role="img" aria-label="${esc(t("l1.fillTitle"))}"><div class="jar-fill" id="f-fill"></div></div>` +
      `<p class="big-count"><span id="f-n">0</span> sats</p>` +
      `<button type="button" class="btn" id="f-add">+${formatSats(step)} sats</button>`;
    root.querySelector("#f-add").addEventListener("click", () => {
      if (filled >= 10) return;
      filled++;
      coin();
      root.querySelector("#f-fill").style.width = `${filled * 10}%`;
      root.querySelector("#f-n").textContent = formatSats(filled * step);
      if (filled === 10) {
        setTimeout(() => {
          root.innerHTML = `${bar(1, 3)}<div class="reveal"><div class="big-coin">${COIN}</div>` +
            `<p class="big-count">${formatSats(SATS_PER_BTC)} sats = ${toBTC(SATS_PER_BTC)} BTC</p>` +
            `<button type="button" class="btn" id="f-next">${esc(t("l1.next"))}</button></div>`;
          ctx.sound.play("star");
          root.querySelector("#f-next").addEventListener("click", () => { ctx.sound.play("click"); roundShop(); });
        }, 500);
      }
    });
  }

  function roundShop() {
    ctx.hint(() => t("l1.hintShop"));
    const price = 500, wallet = 1000;
    let till = 0;
    const draw = () => {
      root.innerHTML = `${bar(2, 3)}<h2>${esc(t("l1.shopTitle"))}</h2>` +
        `<p>${esc(t("l1.shopLine", { price: formatSats(price), wallet: formatSats(wallet) }))}</p>` +
        `<div class="stall"><div class="mango">${MANGO}</div><p class="price">${formatSats(price)} sats</p></div>` +
        `<p class="big-count">${esc(t("l1.till"))}: <span id="s-till">${formatSats(till)}</span></p>` +
        `<div class="row-btns">` +
        [1, 10, 100].map((v) => `<button type="button" class="btn ghost" data-add="${v}">+${formatSats(v)}</button>`).join("") +
        `</div><div class="row-btns">` +
        `<button type="button" class="btn" id="s-pay">${esc(t("l1.pay"))}</button>` +
        `<button type="button" class="btn ghost" id="s-clear">${esc(t("l1.clear"))}</button></div>`;
      root.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
        till += Number(b.dataset.add);
        coin();
        root.querySelector("#s-till").textContent = formatSats(till);
      }));
      root.querySelector("#s-clear").addEventListener("click", () => { till = 0; root.querySelector("#s-till").textContent = "0"; });
      root.querySelector("#s-pay").addEventListener("click", () => {
        if (till === price) {
          say(t("l1.yum", { left: formatSats(wallet - price) }));
          ctx.sound.play("star");
          setTimeout(() => ctx.finish(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1), 900);
        } else if (till < price) {
          mistakes++;
          ctx.sound.play("bad");
          say(t("l1.tooLittle"));
        } else {
          mistakes++;
          ctx.sound.play("bad");
          till = 0;
          draw();
          say(t("l1.tooMuch"));
        }
      });
    };
    draw();
  }

  roundCount();
}
