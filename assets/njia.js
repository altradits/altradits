// Njia public page: fetches the stored summary and draws the path. Everything
// is built with textContent: page data never becomes HTML.
const STOPS = [
  { key: "reserve", label: "Reserve", x: 60, y: 20 },
  { key: "channels", label: "Public channels", x: 157, y: 90 },
  { key: "fees", label: "Fair fees", x: 190, y: 160 },
  { key: "uptime", label: "Always on", x: 157, y: 230 },
  { key: "lease", label: "First lease", x: 60, y: 300 },
];
const svgNS = "http://www.w3.org/2000/svg";
function sel(id) { return document.getElementById(id); }
function svgEl(name, attrs, text) {
  const e = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function drawStops(stops) {
  const g = sel("njiaStops");
  g.replaceChildren();
  const byKey = Object.fromEntries((stops || []).map((s) => [s && s.key, s && s.done === true]));
  let done = 0;
  for (const s of STOPS) {
    const d = byKey[s.key] === true;
    if (d) done++;
    g.appendChild(svgEl("circle", { cx: s.x, cy: s.y, r: 13, class: "stop" + (d ? " done" : "") }));
    const right = s.x < 170, x = right ? s.x + 24 : s.x - 24, anchor = right ? "start" : "end";
    g.appendChild(svgEl("text", { x, y: s.y - 2, "text-anchor": anchor }, s.label));
    g.appendChild(svgEl("text", { x, y: s.y + 16, "text-anchor": anchor, class: "st" }, d ? "Done" : "Not yet"));
  }
  sel("njiaDone").style.setProperty("--off", String(done <= 1 ? 100 : 100 - (done - 1) * 25));
}
function showNumbers(numbers) {
  const tiles = sel("njiaTiles");
  tiles.replaceChildren();
  const rows = [["Routing earned this month", numbers.routing], ["Leases sold so far", numbers.leases], ["Public channels", numbers.channels]];
  for (const [label, value] of rows) {
    const d = document.createElement("div");
    const sm = document.createElement("small"); sm.textContent = label;
    const b = document.createElement("b"); b.textContent = String(value ?? "unknown");
    d.appendChild(sm); d.appendChild(b); tiles.appendChild(d);
  }
  sel("njiaBandsNote").textContent = String(numbers.note || "");
  sel("njiaNumbers").hidden = false;
}
function showIdentity(identity) {
  const body = sel("njiaIdentBody");
  body.replaceChildren();
  const alias = document.createElement("p");
  alias.appendChild(document.createTextNode("Alias: "));
  const b = document.createElement("b"); b.textContent = String(identity.alias || "");
  alias.appendChild(b); body.appendChild(alias);
  const row = document.createElement("p"); row.className = "row";
  const code = document.createElement("code"); code.textContent = String(identity.pubkey || "");
  const copy = document.createElement("button"); copy.type = "button"; copy.className = "btn"; copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(String(identity.pubkey || "")); copy.textContent = "Copied"; }
    catch { copy.textContent = "Copy failed"; }
    setTimeout(() => { copy.textContent = "Copy"; }, 2000);
  });
  row.appendChild(code); row.appendChild(copy); body.appendChild(row);
  if (identity.onion) {
    const p = document.createElement("p");
    const c = document.createElement("code"); c.textContent = String(identity.onion);
    p.appendChild(c); body.appendChild(p);
  }
  const link = String(identity.listingUrl || "");
  if (link.startsWith("https://")) {
    const p = document.createElement("p");
    const a = document.createElement("a"); a.href = link; a.textContent = "Find us on the marketplace";
    a.rel = "noopener"; p.appendChild(a); body.appendChild(p);
  }
  const note = document.createElement("p"); note.className = "fine";
  note.textContent = String(identity.note || "");
  body.appendChild(note);
  sel("njiaIdentity").hidden = false;
}
async function load() {
  let data = null;
  try {
    const res = await fetch("/api/njia", { headers: { Accept: "application/json" } });
    data = await res.json();
  } catch { data = null; }
  if (!data || data.on === false) {
    drawStops([]);
    sel("njiaLine").textContent = "Njia isn't open yet.";
    return;
  }
  drawStops(data.stops || []);
  sel("njiaLine").textContent = String(data.line || "");
  if (data.numbers) showNumbers(data.numbers);
  if (data.identity) showIdentity(data.identity);
}
load();
