// History shows pending and failed payments, not just completed ones: the app
// tells people with a payment on its way to check History, where they must
// find it. Run: node --test test/history-pending.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("history lists pending and failed entries with plain marks", () => {
  const h = read("yebente/src/components/TransactionHistory.tsx");
  assert.match(h, /tx\.status !== 'completed' && tx\.status !== 'pending' && tx\.status !== 'failed'/, "all three states pass the filter");
  assert.match(h, /tx\.status === 'pending' \? 'Pending' : 'Failed'/, "unfinished entries carry their plain mark");
  const bundle = fs.readdirSync(path.join(ROOT, "yebente/app/assets")).find((f) => /^index-[\w-]+\.js$/.test(f));
  const js = bundle ? read(`yebente/app/assets/${bundle}`) : "";
  assert.ok((js.match(/Pending/g) || []).length >= 14, "the built bundle carries Pending marks (rebuild: cd yebente && npm run build)");
  assert.ok((js.match(/Failed/g) || []).length >= 8, "the built bundle carries Failed marks (rebuild: cd yebente && npm run build)");
});
