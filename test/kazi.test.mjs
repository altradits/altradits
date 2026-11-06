// Kazi board (issue #410): a moderated noticeboard of small paid tasks for
// Kisumu people. Posters pay workers directly, peer to peer; Altradits never
// holds money. Nothing goes public until Stanley approves it.
// Run: npm test (focused: node --test test/kazi.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-kazi-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "KAZI", "KAZI_MAX_OPEN", "KAZI_MAX_PENDING", "KAZI_TASK_DAYS", "KAZI_HELP", "ADMIN_TOKEN"]) delete process.env[k];
Object.assign(process.env, { KAZI: "on", SITE_URL: "https://altradits.test", KAZI_MAX_OPEN: "1000", KAZI_MAX_PENDING: "1000", ADMIN_TOKEN: "kazi-test-admin-token" });

const kz = await import("../lib/kazi.js");
const api = await import("../api/kazi.js");
const adminApi = await import("../api/admin.js");

const get = (p) => api.GET(new Request(`https://altradits.test/api/kazi/${p}`, { headers: { "x-remote-addr": "203.0.113.7" } }));
const post = (p, body, ip = "203.0.113.7") => api.POST(new Request(`https://altradits.test/api/kazi/${p}`,
  { method: "POST", headers: { "Content-Type": "application/json", "x-remote-addr": ip }, body: JSON.stringify(body) }));
const admin = (body) => adminApi.POST(new Request("https://altradits.test/api/admin",
  { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer kazi-test-admin-token" }, body: JSON.stringify(body) }));
const TASK = (over = {}) => ({ title: "Translate one page to Kiswahili", desc: "A shop sign needs checking.", reward: 2000, unit: "SATS",
  location: "Kondele", poster: "Stan", contact: "WhatsApp 0712 000 000", agree: true, ...over });

test("health always answers; everything else waits on the KAZI switch", async () => {
  assert.equal((await (await get("health")).json()).on, true);
  process.env.KAZI = "off";
  assert.equal((await (await get("health")).json()).on, false);
  assert.equal((await get("list")).status, 501);
  assert.equal((await post("post", TASK())).status, 501);
  process.env.KAZI = "on";
});

test("posting validates every field and stays pending, never public", async () => {
  for (const bad of [{ ...TASK(), title: "" }, { ...TASK(), desc: "" }, { ...TASK(), reward: 0 },
    { ...TASK(), reward: 1.5 }, { ...TASK(), unit: "BTC" }, { ...TASK(), location: "" },
    { ...TASK(), poster: "" }, { ...TASK(), contact: "" }, { ...TASK(), agree: false }, { ...TASK(), agree: undefined }]) {
    const r = await post("post", bad);
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 80));
  }
  const long = await post("post", TASK({ title: "Long task", desc: "x".repeat(2001) })); // too long is cut, not refused
  assert.equal(long.status, 200);
  const stored = await post("manage", { ...(await long.json()), action: "get" });
  assert.equal((await stored.json()).task.desc.length, 2000);
  const r = await post("post", TASK());
  assert.equal(r.status, 200);
  const { id, token } = await r.json();
  assert.ok(id && token && token.length >= 20);
  assert.deepEqual((await (await get("list")).json()).tasks, []);
  const m = await post("manage", { id, token, action: "get" });
  assert.equal((await m.json()).task.status, "pending");
});

test("approval publishes; stored text is inert data, never markup", async () => {
  const { id } = await (await post("post", TASK({ title: "<script>alert(1)</script> paint", desc: "A <b>bold</b> line\nand a second." }))).json();
  assert.equal((await admin({ action: "kazi_approve", id })).status, 200);
  const tasks = (await (await get("list")).json()).tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "<script>alert(1)</script> paint"); // kept verbatim as data; inert under textContent
  assert.equal(tasks[0].desc, "A <b>bold</b> line\nand a second."); // kept verbatim as data; inert under textContent
  assert.ok(!("manageHash" in tasks[0]) && !("flags" in tasks[0]));
});

test("the manage token edits (back to review) and closes with how pay went", async () => {
  const { id, token } = await (await post("post", TASK({ title: "First title" }))).json();
  await admin({ action: "kazi_approve", id });
  assert.equal((await post("manage", { id, token: "wrong-token-here-000000", action: "get" })).status, 403);
  const edited = await post("manage", { id, token, action: "edit", title: "Second title" });
  assert.equal((await edited.json()).task.status, "pending"); // edits go back to review
  assert.ok(!(await (await get("list")).json()).tasks.some((t) => t.id === id));
  await admin({ action: "kazi_approve", id });
  const closed = await post("manage", { id, token, action: "close", paidHow: "sats" });
  assert.equal((await closed.json()).task.status, "done");
  assert.ok(!(await (await get("list")).json()).tasks.some((t) => t.id === id));
  for (const bad of ["cash", "", 42]) assert.equal((await post("manage", { id, token, action: "close", paidHow: bad })).status, 400);
});

test("flags reach Stanley but never hide a task by themselves", async () => {
  const { id } = await (await post("post", TASK({ title: "Flagged task" }))).json();
  await admin({ action: "kazi_approve", id });
  assert.equal((await post("flag", { id, reason: "" })).status, 400);
  assert.equal((await post("flag", { id, reason: "Looks off." })).status, 200);
  assert.ok((await (await get("list")).json()).tasks.some((t) => t.id === id)); // still public
  const list = await (await admin({ action: "kazi_list" })).json();
  assert.equal(list.tasks.find((t) => t.id === id).flags, 1);
  assert.equal((await admin({ action: "kazi_hide", id })).status, 200);
  assert.ok(!(await (await get("list")).json()).tasks.some((t) => t.id === id));
});

test("tasks expire after their days; the pilot caps hold", async () => {
  const before = await (await admin({ action: "kazi_list" })).json();
  for (const t of before.tasks.filter((t) => t.status === "open")) await admin({ action: "kazi_hide", id: t.id });
  process.env.KAZI_TASK_DAYS = "0";
  const { id } = await (await post("post", TASK({ title: "Old task" }))).json();
  await admin({ action: "kazi_approve", id });
  assert.ok(!(await (await get("list")).json()).tasks.some((t) => t.id === id)); // lazy expiry on read
  delete process.env.KAZI_TASK_DAYS;
  process.env.KAZI_MAX_OPEN = "1";
  const a = await (await post("post", TASK({ title: "Only slot" }))).json();
  await admin({ action: "kazi_approve", id: a.id });
  const full = await post("post", TASK({ title: "No room" }));
  assert.equal(full.status, 400);
  assert.match((await full.json()).error, /full/);
  process.env.KAZI_MAX_OPEN = "1000";
  process.env.KAZI_MAX_PENDING = "3"; // two stale pendings from an earlier test plus one new one fills it
  assert.equal((await post("post", TASK({ title: "Pending one" }))).status, 200);
  assert.equal((await post("post", TASK({ title: "Pending two" }))).status, 400);
  process.env.KAZI_MAX_PENDING = "1000";
});

test("public routes are rate-limited per visitor", async () => {
  const ip = "198.51.100.9";
  for (let i = 0; i < 130; i++) await get("list");
  assert.equal(await get("list").then((r) => r.status), 200); // reads stay generous on shared mobile addresses
  let limited = 0;
  for (let i = 0; i < 40; i++) { if ((await post("post", TASK({ title: `Spam ${i}` }), ip)).status === 429) limited++; }
  assert.ok(limited > 0, "posting is capped per visitor");
});
