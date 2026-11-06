// Developer API PR5 (issue #421): the /developer page, the reference, the
// dashboard and their wiring are static-checked here: nav links, routes,
// policy tags, and reference coverage of the OpenAPI contract.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PAGES = ["developer.html", "developer-reference.html", "developer-dashboard.html"];

test("every page with a site nav links to Developer", async () => {
  for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith(".html"))) {
    const html = read(f);
    if (!html.includes('<nav class="topnav"')) continue;
    assert.ok(html.includes('<a href="/developer"'), `${f}: nav links to /developer`);
  }
  for (const f of PAGES) assert.ok(read(f).includes('<a href="/developer" aria-current="page">Developer</a>'), `${f}: marks Developer current`);
});

test("the pages carry their policy, reporter, frame check and share tags", async () => {
  for (const f of PAGES) {
    const html = read(f);
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self' 'sha256-[^']*'[^>]*>/, `${f}: inline script hashed in its policy`);
    assert.ok(html.includes('<script src="/assets/report.js"></script>'), `${f}: reports policy blocks`);
    assert.ok(html.includes("window.top !== window.self"), `${f}: refuses to load inside a frame`);
    assert.ok(html.includes('og:image" content="https://altradits.com/assets/social-card.png"'), `${f}: shares the social card`);
    assert.ok(html.includes('theme-color" content="#EEF2F6"'), `${f}: theme color set`);
    assert.doesNotMatch(html, /—/, `${f}: no em-dashes`);
  }
});

test("the inline scripts parse", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-devjs-"));
  for (const f of PAGES) {
    const scripts = [...read(f).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 1, `${f}: has an inline script`);
    const tmp = path.join(dir, f.replace(".html", ".js"));
    fs.writeFileSync(tmp, scripts.join("\n;\n"));
    execFileSync("node", ["--check", tmp]);
  }
});

test("the reference documents every endpoint in the OpenAPI contract", async () => {
  const spec = JSON.parse(read("docs/developer-openapi.json"));
  const ref = read("developer-reference.html");
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      const needle = `${method.toUpperCase()}.*${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      assert.match(ref, new RegExp(needle), `reference shows ${method.toUpperCase()} ${p}`);
    }
  }
  for (const code of ["insufficient_credits", "lockdown_freeze", "sandbox_only", "idempotency_conflict"])
    assert.ok(ref.includes(code), `reference explains ${code}`);
});

test("the page states pricing, statuses and support honestly", async () => {
  const html = read("developer.html");
  const body = html.slice(html.indexOf("</style>")); // the font license line lives in the head
  for (const s of ["0.5%", "100 sats minimum", "minimum 1 sat", "Sandbox", "non-refundable", "Live", "Sandbox only", "Planned", "/contact", "request id"])
    assert.ok(html.includes(s), `page states: ${s}`);
  assert.ok(html.includes("<svg") && html.includes("sats, straight to you"), "page diagrams the non-custodial flow");
  for (const invented of ["uptime", "trusted by", "license", "licence", "vasp"])
    assert.ok(!body.toLowerCase().includes(invented), `page claims no ${invented}`);
  assert.doesNotMatch(body.toLowerCase(), /\bour customers\b/, "page claims no customers of its own");
});

test("the dashboard only talks to our own API and never runs server text", async () => {
  const html = read("developer-dashboard.html");
  // The one innerHTML is the frame-buster clearing the page; data goes through textContent.
  assert.equal(html.split("innerHTML").length - 1, 1, "dashboard sets text, never HTML");
  for (const m of html.matchAll(/fetch\(([^)]+)\)/g))
    assert.ok(m[1].includes("/api/dev/v1"), `dashboard fetches only our API: fetch(${m[1]})`);
  for (const id of ["email", "code", "keylist", "destlist", "whlist", "baltext", "ledger", "invlist"])
    assert.ok(html.includes(`id="${id}"`), `dashboard has #${id}`);
});

test("routes: Node, Apache and the sitemap serve the three addresses", async () => {
  const srv = read("server.mjs"), ht = read(".htaccess"), sm = read("sitemap.xml");
  assert.ok(srv.includes("developer.html") && srv.includes("developer-reference.html") && srv.includes("developer-dashboard.html"), "server.mjs serves the files");
  assert.match(srv, /developer\\\/reference/, "server.mjs routes /developer/reference");
  assert.match(srv, /developer\\\/dashboard/, "server.mjs routes /developer/dashboard");
  assert.ok(ht.includes("developer.html") && ht.includes("developer/(reference|dashboard)"), ".htaccess routes both stacks");
  for (const loc of ["https://altradits.com/developer", "https://altradits.com/developer/reference", "https://altradits.com/developer/dashboard"])
    assert.match(sm, new RegExp(`<loc>${loc}<\\/loc><lastmod>20\\d\\d-\\d\\d-\\d\\d<\\/lastmod>`), `sitemap dates ${loc}`);
  assert.match(read("llms.txt"), /developer\/reference/, "llms.txt points at the API reference");
});
