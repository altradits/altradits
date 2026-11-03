// Receipt lookup: year-tagged numbers (ALT-2026-0007) resolve, and pre-year
// numbers (ALT-0001) keep working for receipts already sent out.
// Run: node --test test/receipt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-receipt-"));
process.chdir(tmp);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const receiptApi = await import(`${ROOT}/api/receipt.js`);
const { setJSON } = await import(`${ROOT}/lib/store.js`);

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
await setJSON("contact:msg:m1", { id: "m1", at: "2026-11-03T10:00:00.000Z", paidAt: "2026-11-03T10:00:00.000Z",
  name: "Ruth", email: "ruth@example.com", topic: "learn", label: "Learning", sats: 1000, hash: H1, receipt: "ALT-2026-0007" });
await setJSON("contact:msg:m2", { id: "m2", at: "2026-10-30T10:00:00.000Z", paidAt: "2026-10-30T10:00:00.000Z",
  name: "Nia", email: "nia@example.com", topic: "other", label: "Other", sats: 1000, hash: H2, receipt: "ALT-0001" });

const get = (no, h) => new Request(`https://altradits.test/api/receipt?no=${encodeURIComponent(no)}&h=${h}`);

test("year-tagged receipt resolves with the payer's own payment hash", async () => {
  const r = await receiptApi.GET(get("ALT-2026-0007", H1));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.no, "ALT-2026-0007");
  assert.equal(body.payer, "Ruth");
  assert.equal(body.date, "2026-11-03");
});

test("pre-year receipt keeps resolving", async () => {
  const r = await receiptApi.GET(get("ALT-0001", H2));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).payer, "Nia");
});

test("wrong hash, unknown number and malformed numbers 404", async () => {
  assert.equal((await receiptApi.GET(get("ALT-2026-0007", "1".repeat(64)))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-2026-9999", H1))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-9999", H2))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-202", H1))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-2026-007", H1))).status, 404);
});
