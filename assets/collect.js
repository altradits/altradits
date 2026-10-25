// The collect page's script (moved out of the HTML so the page's Content
// Security Policy can allow only our own script files).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => `${Number(n || 0).toLocaleString("en-US")} sats`;
let current = "";
const STATUS = {
  "paid": ["paid", "Paid"], "part paid": ["wait", "Part paid"], "being confirmed": ["wait", "Payment being confirmed"], "not paid yet": ["", "Not paid yet"],
};
const WORK = { ready: "Ready: download it in your workspace", waiting_client: "We have a question for you", done: "Delivered", review: "Ready for your review" };
$("#find").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#name").value.trim();
  if (!name) { $("#msg").className = "msg err"; $("#msg").textContent = "Enter your order name."; return; }
  $("#go").disabled = true; $("#msg").className = "msg"; $("#msg").textContent = "Looking it up…";
  try {
    const r = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Something went wrong.");
    current = name; $("#msg").textContent = ""; show(d);
  } catch (err) { $("#msg").className = "msg err"; $("#msg").textContent = err.message; $("#out").hidden = true; }
  $("#go").disabled = false;
});
function show(d) {
  const [cls, label] = STATUS[d.status] || ["", d.status];
  const work = d.work ? (d.work.question ? WORK.waiting_client : d.work.ready ? WORK[d.work.status] || WORK.ready : "In progress") : null;
  $("#out").innerHTML = `<p style="margin:0"><code style="font-weight:700">${esc(d.name)}</code></p>
    <h2 style="font:800 1.4rem 'Bricolage Grotesque',sans-serif;margin:.4rem 0">${esc(d.title)}</h2>
    <span class="pill ${cls}">${esc(label)}</span>
    <dl>${d.delivery ? `<dt>Delivery</dt><dd>${esc(d.delivery)}</dd>` : ""}${d.due ? `<dt>Due</dt><dd>${esc(new Date(d.due).toLocaleDateString())}</dd>` : ""}${work ? `<dt>Work</dt><dd>${esc(work)}</dd>` : ""}</dl>
    ${d.work?.question ? `<p><b>Our question:</b> ${esc(d.work.question)} <span class="note">Answer it in your workspace.</span></p>` : ""}
    ${d.work?.message && !d.work.question ? `<div style="border-left:3px solid var(--btc);padding:.2rem 0 .2rem .8rem;margin:.6rem 0"><b>${esc(d.work.message.subject)}</b><p style="white-space:pre-wrap;margin:.2rem 0">${esc(d.work.message.text)}</p></div>` : ""}
    ${d.balance ? `<p><b>Balance due: ${fmt(d.balance.sats)}.</b> Scan with any Lightning wallet:</p><div class="qr">${d.balance.qr}</div><p class="actions"><a class="btn btc" href="lightning:${esc(d.balance.bolt11)}">Open in my wallet</a></p>` : ""}
    ${d.status === "being confirmed" ? `<p class="note">Your payment is recorded and being confirmed by hand. Your receipt appears here once it's confirmed on the Altradits node.</p>` : ""}
    <div class="actions">${d.portal ? `<a class="btn" href="${esc(d.portal)}">${d.work?.ready || d.work?.question ? "Open my workspace" : "Open my workspace (send files, follow the work)"}</a>` : ""}${d.receipt ? `<button type="button" class="btn line" id="rcpt">Download my receipt</button>` : ""}</div>`;
  $("#out").hidden = false;
  $("#rcpt")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: current, receipt: true }) });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      Object.assign(document.createElement("a"), { href: url, download: (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "altradits-receipt.pdf" }).click();
      URL.revokeObjectURL(url);
    } catch (err) { e.target.textContent = err.message; }
    e.target.disabled = false;
  });
}
