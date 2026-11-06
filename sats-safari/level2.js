// Sats Safari, stop 2: Keys and Padlocks. Open your chest with the secret
// key, refuse a stranger who asks for it, and share only the public address.
export const META = { id: 2, badge: "key-keeper", learned: ["l2.a", "l2.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4"/><path d="M12 12h8M17 12v4M20 12v3"/></svg>';
const FOX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l4 4 4-5 4 5 4-4-2 9a6 6 0 0 1-12 0z"/><circle cx="9.5" cy="12" r="1" fill="currentColor"/><circle cx="14.5" cy="12" r="1" fill="currentColor"/></svg>';

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(3 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);

  function roundOpen() {
    ctx.hint(() => t("l2.hintOpen"));
    root.innerHTML = `${bar(0)}<h2>${esc(t("l2.openTitle"))}</h2><p>${esc(t("l2.openLine"))}</p>` +
      `<div class="chest" id="o-chest" role="img" aria-label="${esc(t("l2.openTitle"))}"><div class="lid"></div><div class="box">★ ★ ★</div></div>` +
      `<button type="button" class="btn" id="o-key"><span class="ic">${KEY}</span>${esc(t("l2.openBtn"))}</button>`;
    root.querySelector("#o-key").addEventListener("click", () => {
      root.querySelector("#o-chest").classList.add("open");
      ctx.sound.play("coin");
      ctx.say(t("l2.opened"));
      setTimeout(roundFox, 1100);
    });
  }

  function roundFox() {
    ctx.hint(() => t("l2.hintFox"));
    root.innerHTML = `${bar(1)}<h2>${esc(t("l2.foxTitle"))}</h2>` +
      `<div class="fox"><div class="face">${FOX}</div><p class="bubble">${esc(t("l2.foxLine"))}</p></div>` +
      `<div class="row-btns"><button type="button" class="btn" id="f-keep">${esc(t("l2.keepBtn"))}</button>` +
      `<button type="button" class="btn ghost" id="f-show">${esc(t("l2.showBtn"))}</button></div>`;
    root.querySelector("#f-keep").addEventListener("click", () => {
      ctx.sound.play("star");
      ctx.say(t("l2.kept"));
      setTimeout(roundAddr, 1100);
    });
    root.querySelector("#f-show").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      ctx.say(t("l2.shown"));
    });
  }

  function roundAddr() {
    ctx.hint(() => t("l2.hintAddr"));
    root.innerHTML = `${bar(2)}<h2>${esc(t("l2.addrTitle"))}</h2><p>${esc(t("l2.addrLine"))}</p>` +
      `<div class="cards2">` +
      `<button type="button" class="pick" id="a-secret"><span class="ic">${KEY}</span><span>${esc(t("l2.secretCard"))}</span></button>` +
      `<button type="button" class="pick" id="a-addr"><span class="addr">${esc(t("l2.addrIs"))}</span><span>${esc(t("l2.addrCard"))}</span></button></div>`;
    root.querySelector("#a-secret").addEventListener("click", () => {
      mistakes++;
      ctx.sound.play("bad");
      ctx.say(t("l2.addrBad"));
    });
    root.querySelector("#a-addr").addEventListener("click", () => {
      ctx.sound.play("coin");
      setTimeout(() => ctx.sound.play("coin"), 200);
      ctx.say(t("l2.addrGood"));
      setTimeout(done, 1100);
    });
  }

  roundOpen();
}
