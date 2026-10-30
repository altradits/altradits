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

const crm = await import("../lib/crm.js");
const ops = await import("../lib/ops.js");
const store = await import("../lib/store.js");
const order = await import("../api/order.js");
const { privateIp, publicFetch } = await import("../lib/netsafe.js");

const post = (body) => order.POST(new Request("http://x/api/order", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) }));

test("typing a client's email on a new order never hands over their portal, tasks or retainer", async () => {
  const client = await crm.createLead({ email: "client@example.com", name: "Client" });
  client.stage = "active";
  client.retainer = { status: "active", baseHours: 10 };
  client.onboarding = { access: "delegate access to the shared inbox" };
  const portalToken = ops.ensurePortal(client).split("c=")[1];
  await ops.indexLead(client);
  await crm.saveLead(client);
  await store.setJSON("task:t-client", { id: "t-client", leadId: client.id, title: "Private work", history: [], status: "done" });
  await store.pushId("tasks", "t-client");

  const o = await (await post({ item: "hourly" })).json();
  assert.deepEqual(await (await post({ id: o.id, t: o.t, email: "client@example.com" })).json(), { ok: true });

  const theirs = await ops.leadByPortal(portalToken);
  assert.equal(theirs?.id, client.id, "the client's portal link still opens the client's own record");
  assert.equal((await store.getJSON("task:t-client")).leadId, client.id, "the client's task stays theirs");
  const fresh = await crm.getLead(client.id);
  assert.deepEqual(fresh.retainer, { status: "active", baseHours: 10 });
  const other = await crm.getLead((await crm.getProposal(o.id)).leadId);
  assert.notEqual(other.portalToken, portalToken);
  assert.equal(other.onboarding ?? null, null, "the client's onboarding notes aren't copied");
  assert.equal(other.retainer ?? null, null);
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
