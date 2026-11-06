// TouchType: the offline arcade typing game at /touchtype. Built from the
// touchtype repo (plain JS, no wasm) into touchtype/. The shipped game core
// is loaded from the exact file the page serves, plus page, policy and
// no-network checks.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The shipped game script, run in Node. The file detects CommonJS (module)
// for its pure core and the browser (document) for its UI, so it loads here
// without a DOM. window exists only so no probe can throw at load.
function loadShippedCore() {
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(read("touchtype/js/game.js"), sandbox, { filename: "touchtype/js/game.js" });
  assert.ok(sandbox.module.exports.createGame, "the shipped script exports its game core");
  return sandbox.module.exports;
}
const g = loadShippedCore();

function memStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}
function throwingStorage() {
  const boom = () => { throw new Error("denied"); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}
function seq(values) {
  let i = 0;
  return () => values[(i++) % values.length];
}

test("shipped core: a drill completes and regenerates, streak and accuracy follow", () => {
  const game = g.createGame({ storage: g.createStorage(memStorage()), stepIdx: 0 });
  g.generateDrill(game, seq([0.99, 0.1, 0.2, 0.3]));
  assert.ok(game.currentText.length > 0, "a drill prompt is generated");
  const first = game.currentText;
  let t = 1000000;
  for (const ch of first) {
    const r = g.handleKey(game, ch, t);
    t += 100;
    assert.equal(r.correct, true, `key ${JSON.stringify(ch)} is correct`);
  }
  assert.equal(game.charIndex, 0, "the next drill starts at its first char");
  assert.ok(game.currentText.length > 0, "a fresh drill is generated");
  assert.equal(game.streak, first.length, "the streak counts every hit");
  assert.equal(g.accuracy(game), 100, "a clean drill is 100 percent");
});

test("shipped core: a wrong key never advances, modifiers are ignored", () => {
  const game = g.createGame({ storage: g.createStorage(memStorage()), stepIdx: 0 });
  game.currentText = "asdf";
  game.charIndex = 0;
  assert.equal(g.handleKey(game, "x", 1000000).correct, false, "the wrong key fails");
  assert.equal(game.charIndex, 0, "the prompt does not advance");
  assert.equal(game.currentText[game.charIndex], "a", "the same prompt waits");
  assert.equal(g.handleKey(game, "a", 1000100).correct, true, "the right key passes");
  assert.equal(game.charIndex, 1, "the prompt advances by one");
  for (const mod of ["Shift", "Control", "Alt", "Meta", "CapsLock"])
    assert.equal(g.handleKey(game, mod, 1000200).ignored, true, `${mod} is ignored`);
});

test("shipped core: promotion needs 25 stage hits at 95 percent, storage never throws", () => {
  assert.equal(g.PROMOTION_MIN_HITS, 25, "the gate counts 25 hits");
  assert.equal(g.PROMOTION_TARGET_ACC, 95, "the gate wants 95 percent");
  const game = g.createGame({ storage: g.createStorage(memStorage()), stepIdx: 0 });
  game.stageTotalHits = 24;
  game.stageCorrectHits = 24;
  assert.equal(g.checkPromotion(game), false, "24 hits stay put");
  game.stageTotalHits = 25;
  game.stageCorrectHits = 23;
  assert.equal(g.checkPromotion(game), false, "92 percent stays put");
  game.stageCorrectHits = 24;
  assert.equal(g.checkPromotion(game), true, "96 percent promotes");
  assert.equal(game.stepIdx, 1, "the stage moves on");
  const denied = g.createStorage(throwingStorage());
  assert.equal(denied.get("x"), null, "a denied read answers null");
  denied.set("x", "1");
  denied.remove("x");
  assert.equal(g.loadStepIdx(denied), 0, "a denied store starts at stage 0");
  const fresh = g.createGame({ storage: g.createStorage(memStorage()) });
  assert.equal(fresh.soundEnabled, false, "sound is off until the player opts in");
});

test("the page loads its shell from absolute same-site paths, every file present", () => {
  const html = read("touchtype/index.html");
  assert.match(html, /<script src="\/touchtype\/js\/game\.js" defer><\/script>/, "the game script loads from its absolute path");
  assert.match(html, /<link rel="stylesheet" href="\/touchtype\/css\/style\.css">/, "the styles load from their absolute path");
  for (const f of ["touchtype/js/game.js", "touchtype/css/style.css", "touchtype/sound/type_sound.mp3"])
    assert.ok(fs.existsSync(path.join(root, f)), `${f} ships beside the page`);
  assert.match(read("touchtype/js/game.js"), /new Audio\('\/touchtype\/sound\/type_sound\.mp3'\)/, "the jingle loads from its absolute path");
  assert.doesNotMatch(html, /(href|src)="(css|js|sound)\//, "no relative asset path (the page also serves without a trailing slash)");
  for (const [, attr] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    if (attr.startsWith("https://altradits.com/")) continue; // crawler metadata, same site
    assert.ok(attr.startsWith("/") || attr.startsWith("#") || attr.startsWith("data:") || attr === "", `same-site reference only (got ${attr})`);
  }
});

test("content types: the game script, styles and sound serve with the right type on both stacks", () => {
  const srv = read("server.mjs");
  assert.match(srv, /"\.js": "text\/javascript; charset=utf-8"/, "Node serves scripts as JavaScript");
  assert.match(srv, /"\.css": "text\/css"/, "Node serves styles as CSS");
  assert.match(srv, /"\.mp3": "audio\/mpeg"/, "Node serves the jingle as audio");
  assert.match(srv, /"\.wasm": "application\/wasm"/, "Node knows the wasm type for a future build");
  const ht = read(".htaccess");
  assert.ok(ht.includes("AddType application/wasm .wasm"), "Apache knows the wasm type");
  assert.ok(ht.includes("AddType audio/mpeg .mp3"), "Apache serves the jingle as audio");
});

test("the page carries a fresh policy with only what it needs, the frame check and the reporter", async () => {
  const { withPolicy } = await import("../deploy/page-csp.mjs");
  const html = read("touchtype/index.html");
  assert.equal(withPolicy(html), html, "touchtype/index.html: policy missing or stale. Run: node deploy/page-csp.mjs");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/, "scripts are ours plus the frame check by hash");
  assert.doesNotMatch(csp, /unsafe-eval|wasm-unsafe-eval/, "plain JS needs no eval (and 'unsafe-eval' must never ship)");
  assert.match(csp, /connect-src 'self'/, "the game calls only this site");
  assert.doesNotMatch(csp, /connect-src 'self' https?:/, "no API host beside this site");
  assert.match(html, /window\.top !== window\.self/, "the game refuses to load inside a frame");
  assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, "the Security watch reporter is loaded");
});

test("the game makes no network requests during play", () => {
  // Static proof, run in CI where no browser exists: the shipped script has
  // no network API at all, so after the page loads nothing can be requested.
  // A headless-browser pass with a request log is done before release.
  const js = read("touchtype/js/game.js");
  const html = read("touchtype/index.html");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  for (const api of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts"])
    assert.ok(!js.includes(api) && !inline.includes(api), `no ${api} in the shipped game`);
  assert.doesNotMatch(js, /https?:\/\//, "no URL in the game script (sound and storage stay on this site)");
  assert.doesNotMatch(read("touchtype/css/style.css"), /https?:\/\//, "no URL in the styles");
  assert.match(js, /typeof localStorage/, "storage is probed before it is touched");
  assert.equal(js.split("innerHTML").length - 1, 1, "one render target, reviewed below");
  const chars = g.ADVENTURE_STEPS.flatMap((s) => [...s.keys, ...s.patterns]).join("") + Object.keys(g.KEY_FINGER_MAP).join("");
  assert.doesNotMatch(chars, /[<>&]/, "drill chars come from fixed sets with no HTML metacharacter");
});

test("wiring: the server, Apache and the sitemap serve the game", () => {
  const srv = read("server.mjs");
  assert.ok(srv.includes("touchtype\\/(?:index\\.html|js\\/"), "server.mjs PUBLIC serves the game shell");
  assert.ok(srv.includes('"/touchtype/index.html"'), "server.mjs maps /touchtype to the game");
  assert.ok(srv.includes("/^\\/touchtype(?:\\/(?:index\\.html)?)?$/"), "server.mjs answers with and without the trailing slash");
  const ht = read(".htaccess");
  assert.ok(ht.includes("RewriteRule ^touchtype/?$ touchtype/index.html [L]"), ".htaccess serves the game on the Apache stack");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/touchtype<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/, "sitemap lists the game with a date");
});

test("VERSION records the touchtype build commit", () => {
  const v = read("touchtype/VERSION").trim();
  const m = v.match(/^1\.0\.0\+([0-9a-f]{7}) \(([0-9a-f]{40})\)$/);
  assert.ok(m, `VERSION names the build and full SHA (got ${v})`);
  assert.ok(m[2].startsWith(m[1]), "the short and full SHAs agree");
});

test("portfolio: the gallery card opens the game with a real screenshot", () => {
  const html = read("portfolio.html");
  assert.match(html, /<a class="card" href="\/touchtype">/, "the card opens the game");
  assert.match(html, /<h2>TouchType<\/h2>/, "the card names the game");
  assert.ok(html.includes("/assets/touchtype-shot.png"), "the card shows the game");
  const shot = path.join(root, "assets/touchtype-shot.png");
  assert.ok(fs.existsSync(shot), "the screenshot ships in assets");
  const buf = fs.readFileSync(shot);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "the screenshot is a real PNG");
  assert.ok(buf.length > 20000, `the screenshot is a real capture (${buf.length} bytes, not a placeholder)`);
});
