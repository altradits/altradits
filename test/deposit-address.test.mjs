// Dashboard deposit addresses: off unless the address-only key is set, and only
// a few a day (every address shown burns a fresh one).
// Run: node --test test/deposit-address.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-deposit-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "LND_ADDRESS_MACAROON"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";

const admin = await import("../api/admin.js");
const { newDepositAddress, validDepositAddress, depositAddressOn } = await import("../lib/lightning.js");
const post = (body) => admin.POST(new Request("http://x/api/admin", { method: "POST",
  headers: { Authorization: "Bearer secret-admin", "Content-Type": "application/json", "x-remote-addr": "127.0.0.1" },
  body: JSON.stringify(body) }));

test("off without the key: the endpoint says how to switch it on", async () => {
  assert.equal(depositAddressOn(), false);
  const r = await post({ action: "node_address" });
  assert.equal(r.status, 501);
  assert.match((await r.json()).error, /LND_ADDRESS_MACAROON/);
  await assert.rejects(newDepositAddress(), /LND_ADDRESS_MACAROON/);
});

test("only a bc1q address is ever shown", () => {
  assert.equal(validDepositAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), true);
  for (const bad of ["", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bc1qxyz", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4<script>", null]) {
    assert.equal(validDepositAddress(bad), false, String(bad));
  }
});

test("only a few addresses a day, even when the key is set", async () => {
  process.env.LND_ADDRESS_MACAROON = "aa".repeat(32);
  assert.equal(depositAddressOn(), true);
  let limited = 0;
  for (let i = 0; i < 11; i++) {
    const r = await post({ action: "node_address" });
    if (r.status === 429) limited++;
    else assert.equal(r.status, 502, "no node here: each attempt fails cleanly");
  }
  assert.equal(limited, 1, "the 11th request is turned away");
  delete process.env.LND_ADDRESS_MACAROON;
});
