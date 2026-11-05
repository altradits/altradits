// Push-to-deploy endpoint. Run: npm test
process.env.EMAIL_APPROVAL = "off"; // these tests check delivery; the approval gate has its own tests
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-deploy-"));
process.chdir(tmp);
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
const marker = path.join(tmp, "deployed");
process.env.HOME = tmp;
process.env.DEPLOY_SECRET = "s3cret-deploy";

const { spawn } = await import("node:child_process");
const deploy = await import(new URL("../api/deploy.js", import.meta.url));
deploy.setDeployRunner(() => spawn("touch", [marker]));
const ask = (secret) => deploy.POST(new Request("https://altradits.test/api/deploy", { method: "POST", headers: secret ? { "X-Deploy-Secret": secret } : {} }));

test("deploy needs the shared secret", async () => {
  assert.equal((await ask()).status, 403);
  assert.equal((await ask("wrong")).status, 403);
  assert.ok(!fs.existsSync(marker));
});

test("deploy runs once, then is rate limited for a minute", async () => {
  const first = await ask("s3cret-deploy");
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), { started: true });
  for (let i = 0; i < 50 && !fs.existsSync(marker); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(fs.existsSync(marker), "deploy command ran");

  const second = await ask("s3cret-deploy");
  assert.equal(second.status, 429);
  assert.equal((await second.json()).started, false);
});

test("Apache never serves server code or internal data (a revert removed this once)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const ht = fs.readFileSync(path.join(root, ".htaccess"), "utf8");
  assert.match(ht, /CLOUDLINUX PASSENGER CONFIGURATION BEGIN/); // the app still starts
  for (const f of ["server\\.mjs", "app\\.cjs", "package(-lock)?\\.json", "README\\.md", "RedirectMatch 404 ^/\\.git"]) assert.ok(ht.includes(f), f);
  for (const d of ["lib", "api", "data", "deploy", "test"]) assert.match(fs.readFileSync(path.join(root, d, ".htaccess"), "utf8"), /Require all denied/, d);
});

test("a failed git fetch doesn't stop the deploy script before its keep-warm ping", () => {
  const sh = fs.readFileSync(new URL("../deploy/cron.sh", import.meta.url), "utf8");
  assert.match(sh, /GIT_TERMINAL_PROMPT=0/);
  assert.match(sh, /if git fetch -q origin main/);
  assert.doesNotMatch(sh, /^git fetch -q origin main$/m);
});

test("old addresses: agency pages and every old task order redirect, in Node and in Apache", () => {
  const root = new URL("..", import.meta.url).pathname;
  const srv = fs.readFileSync(path.join(root, "server.mjs"), "utf8"), ht = fs.readFileSync(path.join(root, ".htaccess"), "utf8");
  const orders = srv.match(/const OLD_ORDERS = "([^"]+)"/)[1].split(" ");
  assert.ok(orders.length >= 60 && orders.includes("inbox-cleanup") && orders.includes("try"));
  for (const s of orders) assert.ok(ht.includes(`|${s}|`) || ht.includes(`(${s}|`) || ht.includes(`|${s})`), `${s} redirects in Apache too`);
  assert.match(ht, /RewriteRule \^cv\(\\\.html\)\?\/\?\$ \/journey \[R=301,L\]/);
});

test("retired /wallet: gone from disk, redirects home in Node and in Apache", () => {
  const root = new URL("..", import.meta.url).pathname;
  const srv = fs.readFileSync(path.join(root, "server.mjs"), "utf8"), ht = fs.readFileSync(path.join(root, ".htaccess"), "utf8");
  assert.ok(!fs.existsSync(path.join(root, "wallet.html")), "page deleted");
  assert.ok(srv.includes('wallet: ""'), "server GONE map sends it home");
  assert.ok(!srv.includes("bitcoin-core|wallet)"), "server no longer serves it");
  assert.match(ht, /\|wallet\)\(\\.html\)\?\/\?\$ \/ \[R=301,L\]/, "Apache sends it home too");
});

test("pages are revalidated on every visit, so updates show at once (Apache serves them directly)", () => {
  const root = new URL("..", import.meta.url).pathname;
  for (const f of [".htaccess", "yebente/public/.htaccess", "yebente/app/.htaccess"]) {
    assert.match(fs.readFileSync(path.join(root, f), "utf8"), /<FilesMatch "\\\.html\$">\s*Header set Cache-Control "no-cache"/, f);
  }
});

test("player logos are served from assets/players, and nothing else under assets/ subfolders", () => {
  const root = new URL("..", import.meta.url).pathname;
  const src = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
  const PUBLIC = eval(src.match(/const PUBLIC = (\/.*\/);/)[1]);
  assert.ok(PUBLIC.test("/assets/players/btrust.png"));
  for (const bad of ["/assets/players/../server.mjs", "/assets/players/x.svg", "/assets/other/x.png", "/yebente/app/assets/players/x.png"]) assert.equal(PUBLIC.test(bad), false, bad);
  const html = fs.readFileSync(path.join(root, "players.html"), "utf8");
  for (const [, slug] of html.matchAll(/src="\/assets\/players\/([\w-]+)\.png"/g)) assert.ok(fs.existsSync(path.join(root, "assets/players", `${slug}.png`)), `${slug}.png`);
});

test("the marketing schedule and templates are served locally, and nothing else under assets/marketing", () => {
  const root = new URL("..", import.meta.url).pathname;
  const src = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
  const PUBLIC = eval(src.match(/const PUBLIC = (\/.*\/);/)[1]);
  for (const good of ["/assets/marketing/months.json", "/assets/marketing/templates.json", "/assets/marketing/2026-11.json",
    "/assets/marketing/2026-11/min-13.jpg", "/assets/marketing/2026-12/dec-01.jpg", "/assets/marketing/templates/tpl-01.jpg"]) assert.ok(PUBLIC.test(good), good);
  for (const m of JSON.parse(fs.readFileSync(path.join(root, "assets/marketing/months.json"), "utf8"))) assert.ok(PUBLIC.test(`/assets/marketing/${m}.json`), m);
  for (const bad of ["/assets/marketing/../server.mjs", "/assets/marketing/2026-11/../../server.mjs", "/assets/marketing/a/b/c.jpg",
    "/assets/marketing/", "/assets/other/x.png"]) assert.equal(PUBLIC.test(bad), false, bad);
});

test("the admin API accepts full-size pictures, other APIs stay capped", () => {
  const root = new URL("..", import.meta.url).pathname;
  const src = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
  assert.match(src, /const limit = api\[1\] === "admin" \? 1_000_000 : 100_000;/, "admin takes ~1 MB for pictures, the rest stay at 100 KB");
});
