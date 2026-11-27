// Screen words stay user-shaped: no operator instructions on success
// screens, and link labels name where the link actually goes.
// Run: node --test test/screen-words.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the buy success screen carries no operator instructions", () => {
  const buy = read("yebente/src/components/BuyBtcModal.tsx");
  assert.doesNotMatch(buy, /LNBITS_URL|LND_REST_URL|\.env/, "no dev configuration leaks to users");
  assert.ok(buy.includes("Sats have been credited to your Ye₿ente vault balance."), "the credit line stays");
});

test("the receipt link names its real host", () => {
  const tx = read("yebente/src/components/TransactionDetailModal.tsx");
  assert.doesNotMatch(tx, /<span>bitcoin\.co\.ke<\/span>/, "no hardcoded host");
  assert.match(tx, /receiptHost\(transaction\.receiptUrl/, "the label follows the link");
  assert.match(tx, /u\.protocol !== "https:" && u\.protocol !== "http:"/, "non-HTTP URLs fall back to Receipt");
});

test("the worker cache is bumped in source and bundle", () => {
  assert.match(read("yebente/public/sw.js"), /const CACHE = "yebente-v3"/, "worker source carries v3");
  assert.match(read("yebente/app/sw.js"), /const CACHE = "yebente-v3"/, "built bundle carries v3");
});
