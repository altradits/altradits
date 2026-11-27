// Lightning sends never invite a blind retry: an answer lost to a timeout or
// a dropped connection may mean the money moved (a fresh invoice per try for
// addresses), so uncertain failures show Done with a History pointer while
// plain refusals keep their retry. Run: node --test test/send-retry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("uncertain sends end as Done, refusals keep Retry", () => {
  const api = read("yebente/src/services/altraditsWallet.ts");
  assert.match(api, /err\.status = 0/, "thrown network errors carry their status");
  assert.match(api, /err\.status = res\.status/, "thrown answers carry their status");
  const et = read("yebente/src/services/errorText.ts");
  assert.match(et, /export function sendUncertain/, "uncertain outcomes have one rule");
  assert.match(et, /s >= 500/, "server-side failures count as uncertain");
  const modal = read("yebente/src/components/SendBtcModal.tsx");
  assert.match(modal, /setFatal\(unknown\)/, "uncertain sends turn fatal");
  assert.match(modal, /fatal \? 'Done' : 'Retry'/, "fatal errors offer Done, refusals offer Retry");
  const bundle = fs.readdirSync(path.join(ROOT, "yebente/app/assets")).find((f) => /^index-[\w-]+\.js$/.test(f));
  const hits = bundle && read(`yebente/app/assets/${bundle}`).match(/may have gone through/g);
  assert.ok(hits && hits.length >= 2, "the built bundle carries both History pointers (rebuild: cd yebente && npm run build)");
});
