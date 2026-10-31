// Attacks found in the October 2026 audit stay closed.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-security-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR", "JOBS_ALLOW_LOCAL"]) delete process.env[k];
process.env.EMAIL_APPROVAL = "off";

const store = await import("../lib/store.js");
const { privateIp, publicFetch, safeUrl } = await import("../lib/netsafe.js");
const tip = await import("../api/tip.js");

test("support invoices: the paid check answers only for invoices made on the support page", async () => {
  // Someone else's Ye₿ente invoice hash must not reveal whether it was paid.
  const other = "ab".repeat(32);
  const r = await tip.GET(new Request(`http://x/api/tip?hash=${other}`, { headers: { "x-forwarded-for": "203.0.113.9" } }));
  assert.equal(r.status, 404);
  for (const sats of [0, 9, 1.5, 5_000_001, "abc"]) {
    const bad = await tip.POST(new Request("http://x/api/tip", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ sats }) }));
    assert.equal(bad.status, 400, String(sats));
  }
});

test("links people give us: http(s) only, and never this machine or a private network", async () => {
  for (const u of ["ftp://example.com/", "file:///etc/passwd", "http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest", "not a link"]) await assert.rejects(safeUrl(u), u);
});

test("outside addresses: private, reserved and disguised IPv4 ranges are refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "0.0.0.0", "192.0.2.1",
    "::1", "::", "fe80::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2001::1", "2001:db8::1", "not-an-ip"]) {
    assert.equal(privateIp(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "64:ff9b::808:808"]) assert.equal(privateIp(ip), false, ip);
});

test("outside addresses: the IP actually connected to is checked (no DNS rebinding), whatever the test switch says on the server", async () => {
  const srv = http.createServer((req, res) => res.end("internal"));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    await assert.rejects(publicFetch(`http://127.0.0.1:${port}/`), /isn't a public website/);
    // A name that resolves to this machine is refused at connect time, not only when first looked up.
    await assert.rejects(publicFetch(`http://localhost:${port}/`), /isn't a public website/);
    // The test switch never opens private addresses on the live server.
    Object.assign(process.env, { JOBS_ALLOW_LOCAL: "1", PASSENGER_APP_ENV: "production" });
    await assert.rejects(publicFetch(`http://localhost:${port}/`), /isn't a public website/);
    delete process.env.PASSENGER_APP_ENV;
    assert.equal(await (await publicFetch(`http://localhost:${port}/`)).text(), "internal"); // tests only
  } finally { delete process.env.JOBS_ALLOW_LOCAL; delete process.env.PASSENGER_APP_ENV; srv.close(); }
});
