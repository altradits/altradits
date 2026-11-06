// Mempool Mayhem admin (api/admin.js trivia views and actions): scheduling,
// pool and ledger views, cancel with the written rule, and winner payouts
// through the wallet payout path with the lockdown and the off switch.
// Run: node --test test/trivia-admin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-trivia-admin-"));
process.chdir(tmp);
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "TRIVIA", "TRIVIA_HOUSE_WALLET", "ANTHROPIC_API_KEY", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
process.env.TRIVIA = "on";
process.env.YEBENTE_WALLETS = "on";
process.env.ADMIN_TOKEN = "test-admin-token-long-and-random-32bytes";
process.env.BACKUP_DIR = path.join(tmp, "backups");
process.env.BACKUP_KEY = "test-backup-passphrase";

const dn = await import("../lib/trivia-donors.js");
const led = await import("../lib/trivia-ledger.js");
const yw = await import("../lib/ywallet.js");
const admin = await import("../api/admin.js");
const deadman = await import("../lib/deadman.js");
const store = await import("../lib/store.js");

const paidHashes = new Set();
let invoiceSeq = 0;
dn.setTriviaLightning({
  createInvoice: async ({ sats, nodeOnly }) => {
    assert.equal(nodeOnly, true);
    const hash = `${(invoiceSeq++).toString(16).padStart(8, "0")}${"c".repeat(56)}`;
    return { bolt11: `lnbc${sats * 10}n1adminfake`, paymentHash: hash, expiresAt: new Date(Date.now() + 3600e3).toISOString() };
  },
  invoicePaid: async ({ paymentHash }) => paidHashes.has(paymentHash),
  qrSvg: async () => "<svg></svg>",
});

const TOKEN = "test-admin-token-long-and-random-32bytes";
const post = (body, token = TOKEN) => admin.POST(new Request("https://altradits.com/api/admin", { method: "POST",
  headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const get = (view, extra = "", token = TOKEN) => admin.GET(new Request(`https://altradits.com/api/admin?view=${view}${extra}`,
  { headers: { authorization: `Bearer ${token}` } }));
const bodyOf = async (res) => ({ status: res.status, json: await res.json() });
const fundPaid = async (game, sats) => {
  const inv = await dn.fundGame(game, { sats });
  paidHashes.add(inv.hash);
  await dn.donorStatus(inv.hash);
  return inv;
};

test("trivia admin needs the admin token", async () => {
  assert.equal((await bodyOf(await get("trivia", "", "wrong"))).status, 401);
  assert.equal((await bodyOf(await post({ action: "trivia_create", title: "No" }, "wrong"))).status, 401);
});

test("donations stay closed until the pool wallet is set", async () => {
  const created = await bodyOf(await post({ action: "trivia_create", id: "admin-house-1", title: "House game" }));
  assert.equal(created.json.ok, true);
  await assert.rejects(dn.fundGame("admin-house-1", { sats: 100 }), /not open yet/);
  await yw.createWallet({ pin: "482910", handle: "trvhouse" });
  process.env.TRIVIA_HOUSE_WALLET = "trvhouse";
  const inv = await dn.fundGame("admin-house-1", { sats: 100 });
  assert.ok(inv.bolt11.startsWith("lnbc"));
});

test("create and schedule, then the pool view lists the game", async () => {
  const created = await bodyOf(await post({ action: "trivia_create", title: "Friday battle",
    startsAt: new Date(Date.now() + 86400e3).toISOString(), players: [{ name: "Asha", account: "asha" }] }));
  assert.equal(created.json.ok, true);
  const id = created.json.game.id;
  assert.equal(created.json.game.players.length, 1);
  const bad = await bodyOf(await post({ action: "trivia_schedule", id, startsAt: new Date(Date.now() - 1000).toISOString() }));
  assert.equal(bad.status, 400);
  const moved = await bodyOf(await post({ action: "trivia_schedule", id, startsAt: new Date(Date.now() + 2 * 86400e3).toISOString() }));
  assert.equal(moved.json.ok, true);
  const view = await bodyOf(await get("trivia"));
  assert.ok(view.json.games.some((g) => g.id === id && g.poolSats === 0));
  assert.equal(view.json.house, "trvhouse");
  assert.ok(view.json.rules.keep.includes("next game"));
});

test("cancel keeps the pool for the next game, archives, deletes nothing", async () => {
  await dn.createGame({ id: "admin-keep-1", title: "Keep me" });
  await dn.createGame({ id: "admin-keep-2", title: "Next game" });
  const paid = await fundPaid("admin-keep-1", 5000);
  const open = await dn.fundGame("admin-keep-1", { sats: 1000 });
  const cancelled = await bodyOf(await post({ action: "trivia_cancel", id: "admin-keep-1", rule: "keep", nextGame: "admin-keep-2" }));
  assert.equal(cancelled.json.ok, true);
  assert.match(cancelled.json.cancel.ruleText, /next game/i);
  assert.match(cancelled.json.cancel.ruleText, /admin-keep-2/);
  assert.equal((await dn.gameMeta("admin-keep-1")).status, "cancelled");
  assert.equal(await dn.isArchived("admin-keep-1"), true);
  assert.equal((await led.totals("admin-keep-1")).net, 0); // carried out
  assert.equal((await led.totals("admin-keep-2")).net, 5000); // carried in
  assert.equal((await led.entries("admin-keep-1")).length, 2); // stake and carry, still readable
  assert.equal((await store.getJSON(`trv:don:${paid.hash}`)).carriedTo, "admin-keep-2");
  assert.equal((await store.getJSON(`trv:don:${open.hash}`)).state, "cancelled");
  const detail = await bodyOf(await get("trivia_game", "&game=admin-keep-1"));
  assert.equal(detail.json.meta.status, "cancelled");
  assert.equal(detail.json.ledger.entries.length, 2);
});

test("cancel returns the pool to donors by hand, archives, deletes nothing", async () => {
  await dn.createGame({ id: "admin-return-1", title: "Return me" });
  const paid = await fundPaid("admin-return-1", 3000);
  const cancelled = await bodyOf(await post({ action: "trivia_cancel", id: "admin-return-1", rule: "return" }));
  assert.equal(cancelled.json.ok, true);
  assert.match(cancelled.json.cancel.ruleText, /manual return/);
  assert.equal((await store.getJSON(`trv:don:${paid.hash}`)).state, "return_pending");
  assert.equal((await led.totals("admin-return-1")).net, 0);
  assert.equal((await led.entries("admin-return-1")).length, 2); // stake and refund, still readable
  assert.equal(await dn.isArchived("admin-return-1"), true);
});

test("payout guards: mid-game, unknown winner, off switch, lockdown", async () => {
  await dn.createGame({ id: "admin-pay-1", title: "Pay game" });
  await dn.joinGame("admin-pay-1", { name: "Asha", account: "asha" });
  await dn.joinGame("admin-pay-1", { name: "Brian", account: "brian" });
  await fundPaid("admin-pay-1", 10000);
  const mid = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p1", to: "someone", pin: "482910" }));
  assert.equal(mid.status, 409);
  assert.match(mid.json.error, /never leave mid-game/);
  const meta = await dn.gameMeta("admin-pay-1");
  meta.status = "over";
  meta.winners = ["p1"];
  await store.setJSON("trv:meta:admin-pay-1", meta);
  const stranger = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p2", to: "someone", pin: "482910" }));
  assert.equal(stranger.status, 404);
  process.env.TRIVIA = "";
  const off = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p1", to: "someone", pin: "482910" }));
  assert.equal(off.status, 503);
  process.env.TRIVIA = "on";
  await deadman.tripDeadman({ trigger: "manual", reason: "Payout guard test" });
  const locked = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p1", to: "someone", pin: "482910" }));
  assert.equal(locked.status, 503);
  assert.match(locked.json.error, /Deadman/);
  await deadman.liftDeadman({ by: "stanley", force: "force", note: "Payout guard test done" });
  assert.equal(deadman.deadmanActive(), false);
});

test("a finished Lightning payout books its real routing fee", async () => {
  await dn.createGame({ id: "admin-fee-1", title: "Fee game" });
  await dn.joinGame("admin-fee-1", { name: "Asha", account: "asha" });
  await dn.joinGame("admin-fee-1", { name: "Brian", account: "brian" });
  await fundPaid("admin-fee-1", 20000);
  const meta = await dn.gameMeta("admin-fee-1");
  meta.status = "over";
  meta.winners = ["p1", "p2"];
  await store.setJSON("trv:meta:admin-fee-1", meta);
  let seen = null;
  dn.setTriviaPayer(async (args) => { seen = args; return { ref: "testroute", status: "completed", fee: 50 }; });
  try {
    const r = await bodyOf(await post({ action: "trivia_payout", game: "admin-fee-1", winner: "p1", to: "p1@elsewhere.example", pin: "482910" }));
    assert.equal(r.json.payout.state, "done");
    assert.equal(r.json.payout.feePaid, 50);
    assert.equal(seen.from.handle, "trvhouse");
    assert.equal(seen.to, "p1@elsewhere.example");
    assert.equal(seen.sats, 9900); // share 10000 minus the 1% reserve
    assert.equal(seen.pin, "482910");
    const rows = await led.entries("admin-fee-1");
    assert.ok(rows.some((e) => e.kind === "prize" && e.sats === -9900));
    assert.ok(rows.some((e) => e.kind === "fee" && e.sats === -50));
  } finally { dn.setTriviaPayer(null); }
});

test("payout pays each winner once through the wallet path", async () => {
  await yw.createWallet({ pin: "194827", handle: "trvwinner" });
  const houseBefore = (await yw.walletByHandle("trvhouse")).balance;
  assert.ok(houseBefore >= 10000);
  const first = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p1", to: "trvwinner", pin: "482910" }));
  assert.equal(first.json.ok, true);
  assert.equal(first.json.payout.state, "done");
  assert.equal(first.json.payout.sats, 10000);
  assert.equal((await yw.walletByHandle("trvwinner")).balance, 10000);
  assert.equal((await yw.walletByHandle("trvhouse")).balance, houseBefore - 10000);
  assert.equal((await led.totals("admin-pay-1")).net, 0);
  const second = await bodyOf(await post({ action: "trivia_payout", game: "admin-pay-1", winner: "p1", to: "trvwinner", pin: "482910" }));
  assert.equal(second.json.payout.state, "done"); // idempotent: the first payout stands
  assert.equal((await yw.walletByHandle("trvwinner")).balance, 10000);
  assert.equal((await led.totals("admin-pay-1")).count, 2); // stake and prize
});
