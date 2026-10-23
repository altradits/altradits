// Bitcoin payment box, shared by the homepage order pop-up and the proposal
// page. mountPay(el, { id, t, onPaid }) asks /api/pay for the invoice, shows
// one QR any wallet can scan (plus Lightning and on-chain tabs), the fees, and
// waits for the payment to confirm itself.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

const CSS = `
.pw{--pw-ink:#0F1B2D;--pw-muted:#4B5A70;--pw-btc:#F7931A}
.pw .tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:.2rem 0 .8rem}
.pw .tab{font:600 .85rem Figtree,system-ui,sans-serif;border:2px solid var(--pw-ink);background:transparent;color:var(--pw-ink);border-radius:2rem;padding:.3rem .8rem;cursor:pointer}
.pw .tab[aria-selected=true]{background:var(--pw-ink);color:#fff}
.pw .grid{display:grid;grid-template-columns:auto 1fr;gap:1.1rem;align-items:center}
.pw .qr{display:block;width:13rem;max-width:100%;aspect-ratio:1;background:#fff;border:2px solid var(--pw-ink);border-radius:.8rem;padding:.4rem}
.pw .qr svg{display:block;width:100%;height:100%}
.pw .sats{font:800 1.5rem 'Bricolage Grotesque',Figtree,sans-serif}
.pw .muted{color:var(--pw-muted)}
.pw .hint{font-size:.85rem;margin:.3rem 0}
.pw .inv{font:500 .78rem ui-monospace,Menlo,monospace;overflow-wrap:anywhere;color:var(--pw-muted);max-height:3.2rem;overflow:hidden;margin:.4rem 0}
.pw .row{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.3rem}
.pw .b{display:inline-flex;justify-content:center;padding:.6rem 1rem;border-radius:.7rem;font:600 .95rem Figtree,sans-serif;text-decoration:none;border:2px solid var(--pw-ink);cursor:pointer;background:transparent;color:var(--pw-ink)}
.pw .b.btc{background:var(--pw-btc);border-color:var(--pw-btc)}
.pw .status{display:flex;align-items:center;gap:.45rem;font-weight:600;margin-top:.6rem}
.pw .pulse{flex:none;width:.6rem;height:.6rem;border-radius:50%;background:var(--pw-btc);animation:pwp 1.2s infinite}
.pw .err{color:#B42318}
.pw .fees{margin-top:.9rem;font-size:.85rem}
.pw .fees summary{cursor:pointer;font-weight:700}
.pw .fees ul{margin:.4rem 0 0;padding-left:1.1rem}
@keyframes pwp{50%{opacity:.25}}
@media (max-width:560px){.pw .grid{grid-template-columns:1fr;justify-items:center;text-align:center}.pw .row{justify-content:center}}
@media (prefers-reduced-motion:reduce){.pw .pulse{animation:none}}`;

function addStyles() {
  if (document.getElementById("pw-css")) return;
  const s = document.createElement("style");
  s.id = "pw-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

async function copy(btn, text, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
  catch { btn.textContent = "Select the text above"; }
  setTimeout(() => { btn.textContent = label; }, 2000);
}

// Returns a stop() function (clears the payment check). claim: show an
// "I've paid" button when the payment can't be detected (node offline).
export function mountPay(el, { id, t, onPaid, onReady, claim = false }) {
  addStyles();
  el.classList.add("pw");
  let timer = null, stopped = false;
  const $ = (s) => el.querySelector(s);
  const stop = () => { stopped = true; clearTimeout(timer); };

  async function start() {
    clearTimeout(timer);
    el.innerHTML = `<p class="muted">Creating your payment QR…</p>`;
    let data;
    try {
      const res = await fetch("/api/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, t }) });
      data = await res.json();
      if (data.status === "paid") return onPaid?.();
      if (!res.ok) throw new Error(data.error);
    } catch (err) {
      el.innerHTML = `<p class="err">${esc(err.message || "Couldn't create the payment QR.")}</p><div class="row"><button type="button" class="b btc" data-retry>Try again</button></div>`;
      $("[data-retry]").onclick = start;
      return;
    }
    if (stopped) return;
    render(data);
  }

  function render({ invoice: inv, onchain, unified, fees }) {
    const sats = inv.sats.toLocaleString("en-US");
    const feeLine = (f) => (f ? `~${f.sats.toLocaleString("en-US")} sats (${money(f.usd)})` : "");
    const views = {
      any: unified && { name: "Any wallet", qr: unified.qr, href: unified.uri, text: unified.uri, copy: "Copy payment link",
        hint: "One QR for every Bitcoin wallet: Lightning wallets pay instantly, others pay on-chain." },
      ln: { name: "⚡ Lightning", qr: inv.qr, href: `lightning:${inv.bolt11}`, text: inv.bolt11, copy: "Copy invoice",
        hint: "Any Lightning wallet: Phoenix, Wallet of Satoshi, Muun, Breez, Strike, Cash App…" },
      chain: onchain && { name: "On-chain", qr: onchain.qr, href: onchain.uri, text: onchain.address, copy: "Copy address",
        hint: `Send exactly ${onchain.btc} BTC (${sats} sats) from any wallet or exchange. Confirms in about 10–60 minutes.` },
    };
    const tabs = Object.keys(views).filter((k) => views[k]);
    el.innerHTML = `${tabs.length > 1 ? `<div class="tabs" role="tablist">${tabs.map((k) => `<button type="button" role="tab" class="tab" data-v="${k}">${views[k].name}</button>`).join("")}</div>` : ""}
      <div class="grid">
        <a class="qr" data-qr></a>
        <div>
          <div class="sats">${sats} sats</div>
          <div class="muted">${money(inv.usd)} at ${money(inv.rate)}/BTC${onchain ? ` · ${onchain.btc} BTC` : ""}</div>
          <div class="hint muted" data-hint></div>
          <div class="inv" data-text></div>
          <div class="row">
            <a class="b btc" data-open>Open wallet</a>
            <button type="button" class="b" data-copy></button>
            ${inv.lnurl ? `<button type="button" class="b" data-lnurl>Copy LNURL</button>` : ""}
          </div>
          <div class="status" data-status role="status"></div>
        </div>
      </div>
      <details class="fees" open><summary>Fees</summary><ul>
        <li><b>Altradits adds no fee.</b> You pay exactly ${sats} sats (${money(inv.usd)}).</li>
        <li><b>Lightning:</b> your wallet may add a small network fee, usually a few sats and well under 1%.</li>
        ${fees?.onchain ? `<li><b>On-chain:</b> your wallet adds a miner fee on top, right now about ${feeLine(fees.onchain.normal)} for ~30 min or ${feeLine(fees.onchain.fast)} for ~10 min. Send the full ${sats} sats.</li>` : ""}
        <li>Exchanges (Binance, Coinbase…) may charge their own withdrawal fee. Make sure the full amount arrives.</li>
      </ul></details>`;

    let view = tabs[0];
    const show = (k) => {
      view = k;
      const v = views[k];
      $("[data-qr]").innerHTML = v.qr;
      $("[data-qr]").href = $("[data-open]").href = v.href;
      $("[data-qr]").setAttribute("aria-label", `${v.name} payment QR code. Tap to open your wallet.`);
      $("[data-hint]").textContent = v.hint;
      $("[data-text]").textContent = v.text;
      $("[data-copy]").textContent = v.copy;
      el.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === k)));
    };
    el.querySelectorAll(".tab").forEach((b) => { b.onclick = () => show(b.dataset.v); });
    show(view);
    $("[data-copy]").onclick = (e) => copy(e.target, views[view].text, views[view].copy);
    if ($("[data-lnurl]")) $("[data-lnurl]").onclick = (e) => copy(e.target, inv.lnurl, "Copy LNURL");
    onReady?.(inv);

    const expires = Date.parse(inv.expiresAt);
    const tick = async (n) => {
      if (stopped) return;
      const st = $("[data-status]");
      if (!st) return;
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      if (left === 0 && !onchain) {
        st.innerHTML = `QR expired. <button type="button" class="b" data-new>Get a new one</button>`;
        $("[data-new]").onclick = start;
        return;
      }
      const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      if (!inv.autoConfirm && !onchain) {
        if (!claim) st.innerHTML = `<span class="muted">Valid for ${clock}. We confirm this payment by email within a few hours.</span>`;
        else if (!$("[data-claim]")) {
          st.innerHTML = `<span class="muted">Valid for ${clock}. After paying, press:</span> <button type="button" class="b btc" data-claim>I've paid</button>`;
          $("[data-claim]").onclick = async (e) => {
            e.target.disabled = true;
            try {
              const res = await fetch("/api/proposal", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, t, action: "paid", method: "Bitcoin (Lightning)", reference: inv.bolt11.slice(-24) }) });
              if (!res.ok) throw new Error((await res.json()).error);
              stop();
              st.innerHTML = `✓ Thanks! Your order is saved. This payment is checked by hand, usually within a few hours, and your confirmation comes by email: add your email below.`;
            } catch (err) { e.target.disabled = false; st.insertAdjacentHTML("beforeend", ` <span class="err">${esc(err.message || "Try again")}</span>`); }
          };
        } else $("[data-claim]").previousElementSibling.textContent = `Valid for ${clock}. After paying, press:`;
      } else {
        if (!st.dataset.seen) st.innerHTML = `<span class="pulse"></span> Waiting for payment…${left ? ` (Lightning valid ${clock})` : ""}`;
        // Lightning settles in seconds; on-chain is checked less often.
        if (n % 2 === 0 && (left > 0 || n % 15 === 0)) {
          try {
            const r = await (await fetch(`/api/pay?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`)).json();
            if (r.status === "paid") { stop(); return onPaid?.(); }
            if (r.onchainSeen) {
              st.dataset.seen = "1";
              st.innerHTML = r.onchainSeen === "partial"
                ? `⚠️ We see a Bitcoin payment, but it's less than ${sats} sats. Please send the rest to the same address.`
                : `<span class="pulse"></span> Payment seen on the Bitcoin network. Waiting for 1 confirmation (usually 10–60 min). You can close this page: your order is saved.`;
            }
          } catch {}
        }
      }
      timer = setTimeout(() => tick(n + 1), 2000);
    };
    tick(0);
  }

  start();
  return stop;
}
