// Push-to-deploy endpoint. Run: npm test
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
process.env.DEPLOY_CMD = `touch ${marker}`;
process.env.HOME = tmp;

const deploy = await import(new URL("../api/deploy.js", import.meta.url));

test("deploy runs once, then is rate limited for a minute", async () => {
  const first = await deploy.POST(new Request("https://altradits.test/api/deploy", { method: "POST" }));
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), { started: true });
  for (let i = 0; i < 50 && !fs.existsSync(marker); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(fs.existsSync(marker), "deploy command ran");

  const second = await deploy.POST(new Request("https://altradits.test/api/deploy", { method: "POST" }));
  assert.equal(second.status, 429);
  assert.equal((await second.json()).started, false);
});
