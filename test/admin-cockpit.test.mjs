// The Overview cockpit (#519): Ye₿ente per Kenyan day for the last 30 days,
// and the 30 days before for the change. Counts and sums only.
// Run: node --test test/admin-cockpit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-cockpit-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
const store = await import("../lib/store.js");
const { cockpitSeries } = await import("../lib/activity.js");

test("per-day series, the 30 days before, active wallets, failed sends, nothing private", async () => {
  // 20:00 UTC is 23:00 in Kenya: still 15 Nov there.
  const now = Date.parse("2026-11-15T20:00:00Z"), day = 864e5, at = (d, h = 0) => new Date(now - d * day + h * 3600e3).toISOString();
  const wallet = async (id, handle, made, balance) => { await store.setJSON(`yw:${id}`, { id, handle, email: `${handle}@example.com`, balance, createdAt: at(made) }); await store.pushId("ywallets", id); };
  let n = 0;
  const entry = async (w, kind, sats, d, status = "completed", h = 0) => { const id = `c${++n}`; await store.setJSON(`ywe:${id}`, { id, walletId: w, kind, sats, status, at: at(d, h) }); await store.pushId(`ywtx:${w}`, id); };
  await wallet("a", "amina", 2, 4000); await wallet("b", "brian", 40, 1000); await wallet("c", "old", 300, 0);
  await entry("a", "receive", 5000, 0); await entry("a", "send", -1000, 0); await entry("a", "send", -700, 1, "failed");
  await entry("b", "buy", 2000, 35); await entry("b", "transfer_out", -100, 3);
  await entry("c", "receive", 999, 120); // long before both periods
  await entry("a", "receive", 1, 0, "completed", 1); // 00:00 EAT on 16 Nov: not yet, tomorrow in Kenya
  const r = await cockpitSeries({ days: 30, now });
  assert.equal(r.series.length, 30);
  assert.equal(r.series.at(-1).day, "2026-11-15", "the last day is today in Kenya");
  assert.equal(r.wallets, 3); assert.equal(r.heldSats, 5000);
  const today = r.series.at(-1);
  assert.deepEqual([today.deposits, today.depositSats, today.sends, today.sentSats, today.active], [1, 5000, 1, 1000, 1]);
  assert.equal(r.series.at(-2).failedSends, 1, "a failed send counts on its day, and never as money out");
  assert.equal(r.totals.newWallets, 1); assert.equal(r.previous.newWallets, 1, "brian joined in the 30 days before");
  assert.equal(r.totals.active, 2, "amina and brian were active");
  assert.equal(r.previous.active, 1); assert.equal(r.previous.depositSats, 2000);
  assert.equal(r.totals.transfers, 1);
  assert.ok(!JSON.stringify(r).match(/example\.com|amina|brian/), "no handles or emails");
});

test("the dashboard: the cockpit sits first on the Overview and its view is cached", () => {
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../api/admin.js", import.meta.url), "utf8");
  const pane = html.slice(html.indexOf('data-pane="overview"'));
  assert.ok(pane.indexOf('id="cockpit"') < pane.indexOf('id="hCheck"'), "the cockpit comes before the checklist");
  assert.match(api, /const CACHED = new Set\(\[[^\]]*"cockpit"/, "answered from the cached copy");
  assert.match(js, /loadCockpit\(\)/);
  for (const part of ["CK.P = P", "CK.L = L", "CK.B = B", "CK.D = D", "CK.shopsLoaded = true"]) assert.ok(js.includes(part), `the cockpit updates when ${part.split(" ")[0]} loads`);
});

test("why payments failed (last period only), what is stuck now, and kTown payments per day", async () => {
  const { openItems, ktownSeries } = await import("../lib/activity.js");
  const now = Date.parse("2026-11-21T09:00:00Z"), at = (min) => new Date(now - min * 60e3).toISOString();
  // Failure reasons: their first sentence, most frequent first.
  await store.setJSON("yw:f1", { id: "f1", handle: "fails", balance: 0, createdAt: at(60 * 24 * 5) }); await store.pushId("ywallets", "f1");
  let n = 0;
  for (const [mins, error] of [[60, "No path to the recipient's wallet was found for this amount. Nothing was taken."], [120, "No path to the recipient's wallet was found for this amount. Nothing was taken."], [180, "This invoice has expired. Nothing was taken."], [60 * 24 * 40, "Old reason. Not counted."]]) {
    const id = `fx${++n}`; await store.setJSON(`ywe:${id}`, { id, walletId: "f1", kind: "send", sats: -100, status: "failed", error, at: at(mins) }); await store.pushId("ywtx:f1", id);
  }
  const r = await cockpitSeries({ days: 30, now });
  assert.deepEqual(r.failReasons.slice(0, 2), [{ why: "No path to the recipient's wallet was found for this amount.", count: 2 }, { why: "This invoice has expired.", count: 1 }]);
  assert.ok(!r.failReasons.some((x) => /Old reason/.test(x.why)), "only the last 30 days");
  // Open right now: late means past the usual time.
  await store.setJSON("ywpay:h1", { walletId: "f1", sats: 500, at: at(30), done: false }); await store.pushId("ywpayopen", "h1");
  await store.setJSON("ywpay:h2", { walletId: "f1", sats: 300, at: at(2), done: false }); await store.pushId("ywpayopen", "h2");
  await store.setJSON("ywpay:h3", { walletId: "f1", sats: 900, at: at(90), done: true }); await store.pushId("ywpayopen", "h3");
  await store.setJSON("ywbuy:b1", { walletId: "f1", kes: 200, at: at(45), state: "pending" }); await store.pushId("ywbuyopen", "b1");
  await store.setJSON("ywbuy:b2", { walletId: "f1", kes: 100, at: at(45), state: "completed" }); await store.pushId("ywbuyopen", "b2");
  const o = await openItems({ now });
  assert.deepEqual([o.payments.count, o.payments.late, o.payments.amount], [2, 1, 800], "done payments don't count; one over 10 minutes");
  assert.deepEqual([o.buys.count, o.buys.late, o.buys.amount], [1, 1, 200]);
  assert.equal(o.payouts.count, 0);
  // kTown: paid, failed and stuck.
  await store.pushId("ktowns", "m1");
  for (const [id, mins, status, sats] of [["k1", 30, "completed", 1500], ["k2", 60 * 24, "failed", 800], ["k3", 120, "pending", 400], ["k4", 60 * 24 * 35, "completed", 999]]) {
    await store.setJSON(`kte:${id}`, { id, merchantId: "m1", at: at(mins), status, sats }); await store.pushId("kt:tx:m1", id);
  }
  const k = await ktownSeries({ days: 30, now });
  assert.deepEqual(k.total, { payments: 1, sats: 1500, failed: 1 });
  assert.deepEqual(k.previous, { payments: 1, sats: 999, failed: 0 });
  assert.equal(k.stuck, 1, "pending for over an hour");
});

test("the cockpit doesn't decorate: no coloured edge stripes, words beside every status colour", () => {
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\.ck-tile::before/, "no status stripe down the side of every card");
  assert.match(js, /"Good" : s === "warn" \? "Watch" : "Act"/, "status colours always come with a word");
  assert.match(js, /title="Nothing in the 30 days before to compare with">New</, "no percentage when there's nothing to compare");
});

test("the cockpit is interactive and live, and never polls from a hidden tab", () => {
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  assert.match(js, /class="ck-spark"[^`]*tabindex="0"/, "trend lines take keyboard focus");
  assert.match(js, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/, "and the arrow keys read each day");
  assert.match(js, /ckTimer = setInterval\(ckTick, 30e3\)/, "updates every 30 seconds");
  assert.match(js, /if \(ckBusy \|\| document\.hidden \|\| \$\("#app"\)\.hidden\) return;/, "not while hidden, signed out or already reading");
  assert.match(js, /if \(!ckBox\.contains\(document\.activeElement\) && ckTip\.hidden\) renderCockpit\(\)/, "never redraws under the pointer or the keyboard");
});
