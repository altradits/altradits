// Finance's statement of money received through the website.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-statement-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
process.env.EMAIL_APPROVAL = "off";

const { setJSON, pushId } = await import("../lib/store.js");
const { statement, statementCsv } = await import("../lib/statement.js");
const put = async (p) => { await setJSON(`proposal:${p.id}`, p); await pushId("proposals", p.id); };

test("totals, sales vs donations, channels, months, services, and a safe CSV", async () => {
  await put({ id: "a", status: "paid", title: "Pay as you go (2 hours)", order: { name: "Pay as you go (2 hours)" }, client: { name: "Jo", email: "jo@x.co" }, totals: { dueNow: 50 }, receipt: { no: "R-2026-00001" },
    payment: { method: "Bitcoin (Lightning)", sats: 62000, reference: "hash1", confirmedAt: "2026-10-02T10:00:00Z" } });
  await put({ id: "b", status: "paid", title: "Donation: Bitcoin education", donation: { message: "" }, client: { name: "=cmd()" }, totals: { dueNow: 20 },
    payment: { method: "Bitcoin (on-chain)", sats: 25000, reference: "onchain:bc1qxyz", confirmedAt: "2026-11-05T10:00:00Z" } });
  await put({ id: "c", status: "accepted", title: "Not paid", totals: { dueNow: 999 } }); // ignored
  const s = await statement();
  assert.deepEqual(s.total, { sats: 87000, count: 2 });
  assert.equal(s.sales.sats, 62000);
  assert.equal(s.donations.sats, 25000);
  assert.ok(!JSON.stringify(s).includes('"usd"')); // sats only
  assert.equal(s.channels.lightning.sats, 62000);
  assert.equal(s.channels.onchain.sats, 25000);
  assert.deepEqual(s.months.map((m) => [m.key, m.sales, m.donations]), [["2026-11", 0, 25000], ["2026-10", 62000, 0]]);
  assert.deepEqual(s.services.map((x) => x.key), ["Pay as you go (2 hours)"]); // donations aren't a service
  assert.equal(s.payments[0].type, "donation"); // newest first
  const csv = await statementCsv();
  assert.match(csv, /^date,receipt,type,client,email,what,sats,channel,held_in,reference,coupon\n/);
  assert.match(csv, /2026-10-02T10:00:00Z,R-2026-00001,sale,Jo,jo@x\.co,Pay as you go \(2 hours\),62000,lightning,node,hash1,/);
  assert.match(csv, /,'=cmd\(\),/); // no spreadsheet formulas
});
