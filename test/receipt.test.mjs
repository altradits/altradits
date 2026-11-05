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
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const receiptApi = await import(`${ROOT}/api/receipt.js`);
const admin = await import(`${ROOT}/api/admin.js`);
const { setJSON, getJSON } = await import(`${ROOT}/lib/store.js`);
(await import(`${ROOT}/lib/email.js`)).setMailer({ sendMail: async () => {} }); // resends need a working transport stand-in
const postAdmin = (body) => admin.POST(new Request("https://altradits.test/api/admin", { method: "POST",
  headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

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

test("pre-year receipt keeps resolving, but displays year-tagged", async () => {
  const r = await receiptApi.GET(get("ALT-0001", H2));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.payer, "Nia");
  assert.equal(body.no, "ALT-2026-0001");
});

test("the year-tagged form unlocks the pre-year record too", async () => {
  const r = await receiptApi.GET(get("ALT-2026-0001", H2));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).payer, "Nia");
});

test("display derivation tags old numbers from the payment date", async () => {
  const { displayReceipt } = await import(`${ROOT}/lib/receipts.js`);
  assert.equal(displayReceipt("ALT-0001", "2026-10-30T10:00:00.000Z"), "ALT-2026-0001");
  assert.equal(displayReceipt("ALT-2026-0007", "2026-11-03T10:00:00.000Z"), "ALT-2026-0007");
  assert.equal(displayReceipt("ALT-0001", "garbage"), "ALT-0001");
  assert.equal(displayReceipt(null, "2026-10-30T10:00:00.000Z"), null);
});

test("the statement shows the year-tagged number for pre-year receipts", async () => {
  const { statement } = await import(`${ROOT}/lib/statement.js`);
  const rows = (await statement()).payments.filter((p) => p.type === "contact");
  assert.equal(rows.find((p) => p.payer === "Nia").receipt, "ALT-2026-0001");
  assert.equal(rows.find((p) => p.payer === "Ruth").receipt, "ALT-2026-0007");
});

test("resend re-sends the corrected finance email for a pre-year receipt", async () => {
  const r = await postAdmin({ action: "contact_resend", id: "m2" });
  assert.equal(r.status, 200);
  const m = await getJSON("contact:msg:m2");
  assert.equal(m.resends.length, 1);
  const { listIds } = await import(`${ROOT}/lib/store.js`);
  const mails = [];
  for (const id of await listIds("emails", 50)) mails.push(await getJSON(`email:${id}`));
  const sent = mails.find((e) => e.to === "nia@example.com");
  assert.ok(sent, "payer emailed");
  assert.ok(sent.from.includes("finance@altradits.com"), "from finance");
  assert.ok(sent.subject.includes("ALT-2026-0001"), "subject carries the year-tagged number");
});

test("ack refuses an erased message with no address left", async () => {
  const { setJSON } = await import(`${ROOT}/lib/store.js`);
  await setJSON("contact:msg:er1", { id: "er1", name: "[erased]", email: "", message: "[erased on request]", topic: "other", label: "Other", dept: "office" });
  assert.equal((await postAdmin({ action: "contact_ack", id: "er1" })).status, 400);
});

test("resend refuses unknown messages and a second resend within the hour", async () => {
  assert.equal((await postAdmin({ action: "contact_resend", id: "nope" })).status, 404);
  assert.equal((await postAdmin({ action: "contact_resend", id: "m2" })).status, 429);
});

test("wrong hash, unknown number and malformed numbers 404", async () => {
  assert.equal((await receiptApi.GET(get("ALT-2026-0007", "1".repeat(64)))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-2026-9999", H1))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-9999", H2))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-202", H1))).status, 404);
  assert.equal((await receiptApi.GET(get("ALT-2026-007", H1))).status, 404);
});
