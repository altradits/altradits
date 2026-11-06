// Sats Safari: the kids' Bitcoin game. Shell, words, offline play and the
// child-safety rules, checked on every test run. Game logic (sats maths,
// chain checks, mining, supply) gets its own tests with its levels.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const gameFiles = () => walk("sats-safari");

test("the game page carries a fresh policy, the frame check and the reporter", async () => {
  const { withPolicy } = await import("../deploy/page-csp.mjs");
  const html = read("sats-safari/index.html");
  assert.equal(withPolicy(html), html, "sats-safari/index.html: policy missing or stale (same format as deploy/page-csp.mjs writes)");
  assert.match(html, /window\.top !== window\.self/, "the game refuses to load inside a frame");
  assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, "the Security watch reporter is loaded");
  assert.match(html, /connect-src 'self'/, "the game calls only this site");
});

test("English and Kiswahili carry the same keys, filled in, with no em-dashes", () => {
  const en = JSON.parse(read("sats-safari/i18n/en.json"));
  const sw = JSON.parse(read("sats-safari/i18n/sw.json"));
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" ? [`${p}${k}`] : keys(v, `${p}${k}.`));
  assert.deepEqual(keys(sw).sort(), keys(en).sort(), "i18n: Kiswahili keys match English keys");
  const at = (o, p) => p.split(".").reduce((x, k) => x[k], o);
  for (const k of keys(en)) {
    for (const [name, o] of [["en", en], ["sw", sw]]) {
      const v = at(o, k);
      assert.ok(v.trim().length > 0, `i18n/${name}: ${k} is empty`);
      assert.doesNotMatch(v, /—/, `i18n/${name}: ${k} uses an em-dash (house style)`);
    }
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    assert.equal(holes(at(sw, k)), holes(at(en, k)), `i18n: ${k} placeholders differ between languages`);
  }
});

test("nothing in the game reaches outside it, except the way back to altradits.com", () => {
  for (const f of gameFiles()) {
    if (!/\.(html|js|css|json)$/.test(f)) continue;
    const src = read(f).replaceAll("https://altradits.com", ""); // our own canonical and share URLs stay
    assert.doesNotMatch(src, /https?:\/\//, `${f}: no outside addresses (same-origin paths only)`);
    assert.doesNotMatch(src, /—/, `${f}: no em-dashes (house style)`);
  }
  const html = read("sats-safari/index.html");
  for (const [, v] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    assert.ok(v.startsWith("/") || v.startsWith("#") || v.startsWith("data:") || v.startsWith("https://altradits.com") || !v.includes(":"),
      `index.html: ${v} leaves the site (only /, # or data: links)`);
  }
  assert.ok(html.includes('href="/"'), "the game links back to altradits.com");
  for (const f of gameFiles().filter((x) => x.endsWith(".js"))) {
    assert.doesNotMatch(read(f), /fetch\(\s*["'`](?![/])/,
      `${f}: fetch() takes absolute same-site paths (the game address has no trailing slash)`);
  }
});

test("the worker precaches the whole game, serves same-site reads, and falls back to the game", () => {
  const sw = read("sats-safari/sw.js");
  assert.match(sw, /const CACHE = "sats-safari-v\d+"/, "a versioned cache of its own (bump it when cached files change)");
  const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const u of shell) {
    const p = u === "/sats-safari/" ? "sats-safari/index.html" : u.replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(root, p)), `sw.js: precached ${u} exists (one 404 breaks the whole install)`);
    assert.ok(u === "/sats-safari" || u.startsWith("/sats-safari/"), `sw.js: precached ${u} stays inside the game's scope`);
  }
  for (const f of gameFiles().filter((x) => /\.(html|js|css|json)$/.test(x) && !x.endsWith("/sw.js")))
    assert.ok(shell.includes(`/${f}`), `sw.js: ${f} is precached (a forgotten file breaks offline play)`);
  assert.match(sw, /u\.origin !== self\.location\.origin/, "same-site reads only");
  assert.match(sw, /ev\.request\.method !== "GET"/, "only reads go through the cache (reports pass through)");
  assert.match(sw, /caches\.match\("\/sats-safari\/"\)/, "failed reads fall back to the game");
  assert.match(read("sats-safari/app.js"), /navigator\.serviceWorker\.register\("\/sats-safari\/sw\.js"\)/, "the game installs its worker");
  assert.match(read("sats-safari/app.js"), /document\.readyState === "complete"\) install\(\)/, "the worker installs even when boot outlasts the load event");
});

test("every level module loads and exports its stop contract", async () => {
  for (const f of gameFiles()) {
    const m = f.match(/level(\d+)\.js$/);
    if (!m) continue;
    const mod = await import(`../sats-safari/level${m[1]}.js`);
    assert.equal(mod.META.id, Number(m[1]), `${f}: META.id matches the file`);
    assert.equal(typeof mod.start, "function", `${f}: exports start(root, ctx)`);
    assert.ok(typeof mod.META.badge === "string" && Array.isArray(mod.META.learned), `${f}: META carries badge and learned keys`);
  }
});

test("every shipped stop exists, and every level file is shipped (no forgotten level)", () => {
  const app = read("sats-safari/app.js");
  const shipped = [...app.match(/const SHIPPED = \[([\s\S]*?)\];/)[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
  for (const n of shipped)
    assert.ok(fs.existsSync(path.join(root, `sats-safari/level${n}.js`)), `stop ${n} is shipped but level${n}.js is missing`);
  for (const f of gameFiles()) {
    const m = f.match(/level(\d+)\.js$/);
    if (m) assert.ok(shipped.includes(Number(m[1])), `${f} exists but is not in SHIPPED (unreachable stop)`);
  }
});

test("the server and Apache serve the game at /sats-safari, and the visit counter names it", () => {
  const srv = read("server.mjs");
  const pubSrc = srv.match(/const PUBLIC = (\/.*\/);/s)?.[1];
  assert.ok(pubSrc, "server.mjs: the PUBLIC allow-list is found");
  const pub = eval(pubSrc); // eslint-disable-line no-eval -- the real allow-list, read from server.mjs
  for (const p of ["/sats-safari/index.html", "/sats-safari/app.js", "/sats-safari/style.css", "/sats-safari/sw.js", "/sats-safari/i18n/en.json", "/sats-safari/level1.js"])
    assert.ok(pub.test(p), `PUBLIC serves ${p}`);
  for (const p of ["/sats-safari/secret.txt", "/sats-safari/i18n/../app.js", "/sats-safari/../server.mjs"])
    assert.ok(!pub.test(p), `PUBLIC refuses ${p}`);
  assert.ok(srv.includes('"/sats-safari/index.html"'), "server.mjs: /sats-safari/ serves the game");
  assert.ok(srv.includes('url.pathname === "/sats-safari"') && srv.includes("Location: `/sats-safari/${url.search}`"), "server.mjs: the bare path redirects to the canonical /sats-safari/");
  const ht = read(".htaccess");
  assert.ok(ht.includes("sats-safari/index.html"), ".htaccess: the same route on the Apache stack");
  assert.ok(ht.includes("^sats-safari$ /sats-safari/ [R=301,L]"), ".htaccess: the bare path redirects to /sats-safari/");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/sats-safari\/<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/, "sitemap lists the game with a date");
  assert.ok(read("lib/visits.js").includes('"/sats-safari/index.html": "sats-safari"'), "lib/visits.js: game page views are counted as sats-safari");
});

test("progress survives private mode and strange stored text", async () => {
  const { loadProgress, saveProgress, isUnlocked, awardStars, fresh } = await import("../sats-safari/progress.js");
  assert.equal(fresh().sound, false, "sound starts off for every new player");
  assert.ok(isUnlocked(fresh(), 1), "stop 1 is always open");
  assert.ok(!isUnlocked(fresh(), 2), "stop 2 waits on stop 1");
  const keep = globalThis.localStorage;
  try {
    const mem = {};
    globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
    assert.deepEqual(loadProgress(), fresh(), "no saved game: fresh progress");
    const p = loadProgress();
    assert.equal(awardStars(p, 1, 2), 2, "stars are kept");
    assert.ok(isUnlocked(loadProgress(), 2), "stop 1's star opens stop 2");
    globalThis.localStorage.setItem("sats-safari-v1", "{oops");
    assert.deepEqual(loadProgress(), fresh(), "broken saved text: fresh progress, no crash");
    globalThis.localStorage.setItem("sats-safari-v1", JSON.stringify({ stars: { 1: 99, x: 2 }, lang: "xx", sound: "yes" }));
    assert.deepEqual(loadProgress().stars, {}, "wild star counts are dropped");
    globalThis.localStorage.setItem = () => { throw new Error("full"); };
    assert.equal(saveProgress(p), false, "a full disk fails softly");
    assert.equal(awardStars(p, 1, 9), 3, "stars clamp at 3");
    delete globalThis.localStorage;
    assert.deepEqual(loadProgress(), fresh(), "no storage at all: fresh progress, no crash");
  } finally {
    if (keep === undefined) delete globalThis.localStorage; else globalThis.localStorage = keep;
  }
});
