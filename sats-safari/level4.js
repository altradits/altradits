// Sats Safari, stop 4: Block Train. Pack transactions into a block, link
// three blocks into a chain, then break the links by changing an old block.
import { headerText, validChain, tamper, webHash } from "./chain.js";

export const META = { id: 4, badge: "chain-linker", learned: ["l4.a", "l4.b"] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (h) => `${h.slice(0, 10)}…`;

export function start(root, ctx) {
  const { t } = ctx;
  let mistakes = 0;
  const bar = (done) => `<p class="round" aria-hidden="true">${"●".repeat(done)}${"○".repeat(2 - done)}</p>`;
  const done = () => ctx.finish(mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);

  async function roundPack() {
    ctx.hint(() => t("l4.hintPack"));
    const txs = ["l4.tx1", "l4.tx2", "l4.tx3"].map((k) => t(k));
    const loaded = [false, false, false];
    root.innerHTML = `${bar(0)}<h2>${esc(t("l4.packTitle"))}</h2><p>${esc(t("l4.packLine"))}</p>` +
      `<div class="train"><div class="car" id="p-car"><span class="car-n">1</span><div class="cargo" id="p-cargo"></div></div></div>` +
      `<div class="row-btns" id="p-txs">${txs.map((x, i) => `<button type="button" class="btn ghost" data-tx="${i}">${esc(x)}</button>`).join("")}</div>` +
      `<p><button type="button" class="btn" id="p-seal" disabled>${esc(t("l4.seal"))}</button></p>`;
    const cargo = root.querySelector("#p-cargo");
    root.querySelectorAll("[data-tx]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.tx);
      if (loaded[i]) return;
      loaded[i] = true;
      b.disabled = true;
      ctx.sound.play("coin");
      const chip = document.createElement("span");
      chip.className = "chip-tx";
      chip.textContent = txs[i];
      cargo.appendChild(chip);
      if (loaded.every(Boolean)) root.querySelector("#p-seal").disabled = false;
    }));
    root.querySelector("#p-seal").addEventListener("click", async () => {
      const block = { n: 1, txs, prev: "start" };
      const hash = await webHash(headerText(block));
      ctx.sound.play("star");
      ctx.say(t("l4.sealed", { hash: short(hash) }));
      setTimeout(() => roundLink([{ ...block, hash }]), 1200);
    });
  }

  async function roundLink(first) {
    ctx.hint(() => t("l4.hintLink"));
    const mk = async (n, txs, prev) => {
      const hash = await webHash(headerText({ n, txs, prev }));
      return { n, txs, prev, hash };
    };
    const chain = [...first,
      await mk(2, [t("l4.tx4")], first[0].hash),
      await mk(3, [t("l4.tx5")], "")];
    chain[2].prev = chain[1].hash;
    chain[2].hash = await webHash(headerText(chain[2]));
    let linked = 0;
    const draw = (brokenAt = -1) => {
      root.innerHTML = `${bar(1)}<h2>${esc(t("l4.linkTitle"))}</h2><p>${esc(linked < 3 ? t("l4.linkLine") : t("l4.tamperLine"))}</p>` +
        `<ol class="blocks">${chain.map((b, i) =>
          `<li><button type="button" class="block" data-b="${i}" ${linked < 3 && i !== linked ? "disabled" : ""}>` +
          `<span class="b-n">${b.n}</span><span class="b-tx">${esc(b.txs[0])}${b.txs.length > 1 ? " +" + (b.txs.length - 1) : ""}</span>` +
          `<span class="b-h">${short(b.hash)}</span></button>` +
          (i < 2 ? `<span class="link ${linked > i + 1 ? "on" : ""} ${brokenAt >= 0 && i >= brokenAt ? "bad" : ""}" aria-hidden="true">${brokenAt >= 0 && i >= brokenAt ? "✕" : linked > i + 1 ? "✓" : "⋮"}</span>` : "") +
          `</li>`).join("")}</ol>`;
      root.querySelectorAll("[data-b]").forEach((b) => b.addEventListener("click", () => onBlock(Number(b.dataset.b), brokenAt)));
    };
    const onBlock = async (i, brokenAt) => {
      if (brokenAt >= 0) return;
      if (linked < 3) {
        if (i !== linked) { mistakes++; ctx.sound.play("bad"); ctx.say(t("l4.order", { n: linked + 1 })); return; }
        linked++;
        ctx.sound.play("click");
        if (linked === 3) {
          const v = await validChain(chain, webHash);
          if (v.ok) { ctx.sound.play("star"); ctx.say(t("l4.linked")); }
        }
        draw();
        return;
      }
      // The chain stands: tapping block 1's cargo tampers with it.
      if (i !== 0) { ctx.say(t("l4.tamperLine")); return; }
      const bad = tamper(chain[0], 0, t("l4.txBad"));
      const v = await validChain([bad, chain[1], chain[2]], webHash);
      ctx.sound.play("bad"); // tampering is the lesson, not a mistake
      chain[0] = bad;
      draw(v.at);
      ctx.say(t("l4.broke"));
      setTimeout(done, 2200);
    };
    draw();
  }

  roundPack();
}
