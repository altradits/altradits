// The admin dashboard's layout (#517): every tab has its pane, every pane its
// tab, and every "What needs you" link names the tab that holds its panel, so
// panels can be moved between tabs without breaking a link.
// Run: node --test test/admin-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "assets/admin.js"), "utf8");
const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
const paneAt = [...html.matchAll(/<div class="pane" data-pane="(\w+)">/g)].map((m) => ({ at: m.index, name: m[1] }));
const paneOf = (id) => {
  const i = html.indexOf(`id="${id}"`);
  return i < 0 ? null : paneAt.filter((p) => p.at < i).pop()?.name || null;
};

test("every tab has one pane and every pane one tab", () => {
  assert.deepEqual([...new Set(tabs)].sort(), paneAt.map((p) => p.name).sort());
  assert.equal(new Set(tabs).size, tabs.length, "no tab listed twice");
});

test("every alert link names the tab that holds its panel", () => {
  const targets = [...new Set([...js.matchAll(/"([a-z]+):(h[A-Za-z0-9]+)(?::[^"]*)?"/g)].map((m) => `${m[1]}:${m[2]}`))];
  assert.ok(targets.length > 10, "alert links found");
  for (const t of targets) {
    const [tab, id] = t.split(":");
    assert.equal(paneOf(id), tab, `${t}: the panel is in ${paneOf(id)}`);
  }
});

test("element ids are unique on the page", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, []);
});

test("the printed poster's header isn't styled by the dashboard's own header rules", () => {
  // 21 Nov 2026: once the page was scrolled, "body.scrolled .top" drew the
  // dashboard header's shadow as a grey line under the shop name on the poster.
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const poster = js.slice(js.indexOf("function posterHtml"), js.indexOf("async function secureShops"));
  assert.ok(poster.length > 100, "posterHtml found");
  assert.match(html, /body\.scrolled \.top/, "the dashboard header still has its scroll shadow");
  for (const cls of ["top", "tabs", "topnav"]) assert.doesNotMatch(poster, new RegExp(`class="${cls}"`), `the poster doesn't reuse the page's .${cls}`);
  assert.match(html, /\.poster \.ptop\{/, "the poster header has its own class");
});

test("posters: A4 with no margins by default, and a real A4 PDF to download or share", async () => {
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(html, /@page\{size:A4;margin:0\}/, "printing defaults to A4, no margins");
  assert.match(html, /id="ktownPdfAll"/, "all posters as one PDF");
  assert.match(js, /data-pdf="\$\{i\}"/, "a PDF button on each shop");
  assert.match(js, /navigator\.share\(\{ files: \[file\]/, "the admin can share the file");
  assert.match(js, /posterPdf\(list\) \{[\s\S]*?await secureShops\(list\)/, "a PDF secures the shop, like printing");
  // The PDF writer itself, run here: two pages, each a full-bleed A4 JPEG.
  const src = js.slice(js.indexOf("function pdfFromJpegs"), js.indexOf("const slugOf"));
  const make = new Function("A4_PT", `${src}; return pdfFromJpegs;`)([595.28, 841.89]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = Buffer.from(await make([{ w: 10, h: 14, jpeg }, { w: 10, h: 14, jpeg }]).arrayBuffer()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"));
  assert.match(pdf, /\/Count 2/);
  assert.equal((pdf.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || []).length, 2, "every page is A4");
  const xref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.equal(pdf.slice(xref, xref + 4), "xref", "the index points at itself");
  for (const [, n, off] of pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm).map((m, i) => [m, i + 1, Number(m[1])])) assert.equal(pdf.slice(off, off + `${n} 0 obj`.length), `${n} 0 obj`, `object ${n} is where the index says`);
});

test("dark mode covers every colour token, printing stays light, and every table can be sorted and filtered", () => {
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  const light = /:root\{([^}]*)\}/.exec(html)[1];
  const dark = /:root\[data-theme=dark\]\{([^}]*)\}/.exec(html)[1];
  const names = (b) => [...b.matchAll(/--([\w-]+):/g)].map((m) => m[1]);
  for (const n of names(light)) assert.ok(names(dark).includes(n), `--${n} has a dark value`);
  assert.match(html, /@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme=light\]\)\{/, "Auto follows the device");
  assert.match(html, /@media print\{:root,:root\[data-theme=dark\]\{--bg:#fff/, "printing is always light");
  assert.match(html, /id="theme"/);
  // Text on a dark (ink) fill uses the token that flips with it, never a fixed white.
  assert.doesNotMatch(html.replace(/\.poster[^{]*\{[^}]*\}/g, "").replace(/\.ck-tip\{[^}]*\}/g, ""), /background:var\(--ink\);[^}]*color:#fff/, "text on ink uses --on-ink");
  assert.match(js, /function enhanceTable\(table\)/);
  assert.match(js, /th\.setAttribute\("aria-sort", "none"\)/, "sortable headings say how they're sorted");
  assert.match(js, /if \(body\.rows\.length > 8\)/, "long tables get a filter");
  assert.match(js, /table\.closest\("#posters,#rcpt"\)/, "printed posters and receipts are left alone");
});
