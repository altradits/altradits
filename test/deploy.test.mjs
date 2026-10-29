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

test("Apache never serves server code, internal data or the extension (a revert removed this once)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const ht = fs.readFileSync(path.join(root, ".htaccess"), "utf8");
  assert.match(ht, /CLOUDLINUX PASSENGER CONFIGURATION BEGIN/); // the app still starts
  for (const f of ["server\\.mjs", "app\\.cjs", "package(-lock)?\\.json", "README\\.md", "RedirectMatch 404 ^/\\.git", "RedirectMatch 404 ^/apply-extension"]) assert.ok(ht.includes(f), f);
  const data = fs.readFileSync(path.join(root, "data/.htaccess"), "utf8");
  assert.ok(data.includes("(?!catalog\\.js$|playbooks\\.js$|community\\.js$)")); // only the three public data files
  for (const d of ["lib", "api", "deploy", "test", "apply-extension"]) assert.match(fs.readFileSync(path.join(root, d, ".htaccess"), "utf8"), /Require all denied/, d);
});

test("a failed git fetch doesn't stop the deploy script before its keep-warm ping", () => {
  const sh = fs.readFileSync(new URL("../deploy/cron.sh", import.meta.url), "utf8");
  assert.match(sh, /GIT_TERMINAL_PROMPT=0/);
  assert.match(sh, /if git fetch -q origin main/);
  assert.doesNotMatch(sh, /^git fetch -q origin main$/m);
});
