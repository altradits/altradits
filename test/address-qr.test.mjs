// Paste-an-address QR codes: the dashboard encodes only bc1q-shaped text, makes
// nothing on the node, and holds no address-making key.
// Run: node --test test/address-qr.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-addrqr-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "LND_ADDRESS_MACAROON"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";

const admin = await import("../api/admin.js");
const { validDepositAddress } = await import("../lib/lightning.js");
const post = (body) => admin.POST(new Request("http://x/api/admin", { method: "POST",
  headers: { Authorization: "Bearer secret-admin", "Content-Type": "application/json", "x-remote-addr": "127.0.0.1" },
  body: JSON.stringify(body) }));
const ADDR = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

test("only bc1q-shaped text is accepted", () => {
  assert.equal(validDepositAddress(ADDR), true);
  for (const bad of ["", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bc1qxyz", `${ADDR}<script>`, null]) {
    assert.equal(validDepositAddress(bad), false, String(bad));
  }
});

test("a pasted address comes back with a plain QR picture, nothing else", async () => {
  const r = await post({ action: "address_qr", address: ADDR });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.address, ADDR);
  assert.ok(b.qr.startsWith("<svg"), "a QR picture");
  assert.ok(!/<script|on\w+\s*=|javascript:/i.test(b.qr), "no scripts in the picture");
});

test("anything else is refused, and the old make-on-server action is gone", async () => {
  for (const address of ["hello", "bc1qxyz", "", null]) {
    const r = await post({ action: "address_qr", address });
    assert.equal(r.status, 400, String(address));
    assert.match((await r.json()).error, /bc1q/);
  }
  const gone = await post({ action: "node_address" });
  assert.equal(gone.status, 400);
  assert.equal((await gone.json()).error, "Unknown action.");
});

test("QR codes are capped per hour", async () => {
  let limited = 0;
  for (let i = 0; i < 61; i++) {
    const r = await post({ action: "address_qr", address: ADDR });
    if (r.status === 429) limited++;
    else assert.equal(r.status, 200);
  }
  assert.ok(limited >= 1, "the tap runs out within 61 requests");
});
