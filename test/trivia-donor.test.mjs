// Mempool Mayhem donor pool (lib/trivia-donors.js, api/trivia.js): funding a
// game over Lightning, one credit per invoice, clean public messages, one
// account per player per game, equal battle sats, and the off switch.
// Run: node --test test/trivia-donor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-trivia-donor-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "TRIVIA", "TRIVIA_HOUSE_WALLET"]) delete process.env[k];
process.env.TRIVIA = "on";
process.env.YEBENTE_WALLETS = "on";

const dn = await import("../lib/trivia-donors.js");
const led = await import("../lib/trivia-ledger.js");
const yw = await import("../lib/ywallet.js");
const api = await import("../api/trivia.js");
const store = await import("../lib/store.js");

await yw.createWallet({ pin: "482910", handle: "trvhouse" });
process.env.TRIVIA_HOUSE_WALLET = "trvhouse";

// A stand-in node: invoices are made here, and each hash pays when told to.
const paidHashes = new Set();
let invoiceSeq = 0;
const fakeHash = () => `${(invoiceSeq++).toString(16).padStart(8, "0")}${"b".repeat(56)}`;
dn.setTriviaLightning({
  createInvoice: async ({ sats, nodeOnly }) => {
    assert.equal(nodeOnly, true);
    return { bolt11: `lnbc${sats * 10}n1donorfake`, paymentHash: fakeHash(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
  },
  invoicePaid: async ({ paymentHash }) => paidHashes.has(paymentHash),
  qrSvg: async () => "<svg></svg>",
  bolt11Msats: (await import("../lib/lightning.js")).bolt11Msats,
});

const post = (body) => api.POST(new Request("https://altradits.com/api/trivia", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const get = (view, extra = "") => api.GET(new Request(`https://altradits.com/api/trivia?view=${view}${extra}`));
const bodyOf = async (res) => ({ status: res.status, json: await res.json() });

test("off switch: funding and joins refuse, health still answers", async () => {
  await dn.createGame({ id: "donor-off-1", title: "Off switch game" });
  process.env.TRIVIA = "";
  const fund = await bodyOf(await post({ action: "fund", game: "donor-off-1", sats: 100 }));
  assert.equal(fund.status, 503);
  assert.match(fund.json.error, /off/);
  const join = await bodyOf(await post({ action: "join", game: "donor-off-1", name: "Asha", account: "asha" }));
  assert.equal(join.status, 503);
  const health = await bodyOf(await get("health"));
  assert.equal(health.json.ok, true);
  assert.equal(health.json.on, false);
  process.env.TRIVIA = "on";
});

test("funding needs a game that takes donations and sane sats", async () => {
  await dn.createGame({ id: "donor-shape-1", title: "Shape game" });
  await assert.rejects(dn.fundGame("no-such-game", { sats: 100 }), /No such game/);
  await assert.rejects(dn.fundGame("donor-shape-1", { sats: 9 }), /from 10/);
  await assert.rejects(dn.fundGame("donor-shape-1", { sats: 100.5 }), /whole number/);
  await assert.rejects(dn.fundGame("donor-shape-1", { sats: 100, target: { kind: "planet" } }), /game, a team, or a player/);
  await assert.rejects(dn.fundGame("donor-shape-1", { sats: 100, target: { kind: "team" } }), /Name the team/);
  await assert.rejects(dn.fundGame("donor-shape-1", { sats: 100, target: { kind: "game", id: "other" } }), /no target id/);
  const team = await dn.fundGame("donor-shape-1", { sats: 100, target: { kind: "team", id: "Red" } });
  assert.ok(team.bolt11.startsWith("lnbc"));
  assert.ok(team.qr.includes("svg"));
});

test("messages are short, plain, and carry no links", async () => {
  await dn.createGame({ id: "donor-msg-1", title: "Message game" });
  await assert.rejects(dn.fundGame("donor-msg-1", { sats: 50, message: "Go Asha, see https://example.com" }), /links/);
  await assert.rejects(dn.fundGame("donor-msg-1", { sats: 50, message: "pay me at www.example.com" }), /links/);
  await assert.rejects(dn.fundGame("donor-msg-1", { sats: 50, message: "tip me at asha.link" }), /links/);
  const long = await dn.fundGame("donor-msg-1", { sats: 50, message: `x${"y".repeat(300)}` });
  const storedLong = await store.getJSON(`trv:don:${long.hash}`);
  assert.equal(storedLong.message.length, 140);
  const html = await dn.fundGame("donor-msg-1", { sats: 50, message: "<script>alert(1)</script> Go!" });
  const storedHtml = await store.getJSON(`trv:don:${html.hash}`);
  assert.doesNotMatch(storedHtml.message, /[<>]/);
  assert.ok(storedHtml.message.includes("Go!"));
});

test("one invoice pays the pool once, however often it is checked", async () => {
  await dn.createGame({ id: "donor-once-1", title: "Once game" });
  const inv = await dn.fundGame("donor-once-1", { sats: 1500 });
  assert.equal((await dn.donorStatus(inv.hash)).state, "open");
  assert.equal((await led.totals("donor-once-1")).net, 0);
  paidHashes.add(inv.hash);
  assert.equal((await dn.donorStatus(inv.hash)).state, "paid");
  assert.equal((await dn.donorStatus(inv.hash)).state, "paid");
  const t = await led.totals("donor-once-1");
  assert.equal(t.net, 1500);
  assert.equal(t.count, 1); // a retry records once
  assert.equal((await led.verify("donor-once-1")).ok, true);
  const house = await yw.walletByHandle("trvhouse");
  assert.ok(house.balance >= 1500); // settling credits the house wallet once
});

test("expired invoices close without paying", async () => {
  await dn.createGame({ id: "donor-exp-1", title: "Expiry game" });
  const inv = await dn.fundGame("donor-exp-1", { sats: 700 });
  const it = await store.getJSON(`trv:don:${inv.hash}`);
  it.expiresAt = new Date(Date.now() - 3600e3).toISOString();
  await store.setJSON(`trv:don:${inv.hash}`, it);
  assert.equal((await dn.donorStatus(inv.hash)).state, "expired");
  assert.equal((await led.totals("donor-exp-1")).net, 0);
});

test("the pool shows paid sats and paid messages only", async () => {
  await dn.createGame({ id: "donor-pool-1", title: "Pool game" });
  const a = await dn.fundGame("donor-pool-1", { sats: 2000, message: "For the love of the game" });
  await dn.fundGame("donor-pool-1", { sats: 9000, message: "Not paid yet" });
  paidHashes.add(a.hash);
  await dn.donorStatus(a.hash);
  const pool = await dn.poolView("donor-pool-1");
  assert.equal(pool.poolSats, 2000);
  assert.equal(pool.donatedSats, 2000);
  assert.equal(pool.donorsPaid, 1);
  assert.equal(pool.donorsOpen, 1);
  assert.equal(pool.messages.length, 1);
  assert.equal(pool.messages[0].message, "For the love of the game");
  const http = await bodyOf(await get("pool", "&game=donor-pool-1"));
  assert.equal(http.json.poolSats, 2000);
});

test("one account per player per game, and joins close at the start", async () => {
  await dn.createGame({ id: "donor-join-1", title: "Join game", startsAt: new Date(Date.now() + 3600e3).toISOString() });
  const p1 = await dn.joinGame("donor-join-1", { name: "Asha", account: "asha" });
  assert.equal(p1.id, "p1");
  await assert.rejects(dn.joinGame("donor-join-1", { name: "Asha again", account: "asha" }), /already joined/);
  const p2 = await dn.joinGame("donor-join-1", { name: "Brian", account: "brian" });
  assert.equal(p2.id, "p2");
  const meta = await dn.gameMeta("donor-join-1");
  assert.equal(meta.players.length, 2);
  meta.status = "live";
  await store.setJSON("trv:meta:donor-join-1", meta);
  await assert.rejects(dn.joinGame("donor-join-1", { name: "Late", account: "late" }), /closed to joins/);
  meta.status = "scheduled";
  meta.startsAt = new Date(Date.now() - 1000).toISOString();
  await store.setJSON("trv:meta:donor-join-1", meta);
  await assert.rejects(dn.joinGame("donor-join-1", { name: "Late", account: "late" }), /already started/);
});

test("battle sats start equal and move without appearing or vanishing", () => {
  const battle = dn.allocBattle(["p1", "p2", "p3"]);
  assert.deepEqual(battle, { p1: 1000, p2: 1000, p3: 1000 });
  dn.moveBattle(battle, "p1", "p2", 250);
  assert.deepEqual(battle, { p1: 750, p2: 1250, p3: 1000 });
  assert.equal(Object.values(battle).reduce((a, b) => a + b, 0), 3000);
  assert.throws(() => dn.moveBattle(battle, "p1", "p2", 751), /fewer battle sats/);
  assert.throws(() => dn.moveBattle(battle, "p1", "p9", 10), /Both players/);
  assert.throws(() => dn.moveBattle(battle, "p1", "p1", 10), /between two players/);
});

test("payout shares split the pool across winners", () => {
  assert.equal(dn.shareOf(10000, 1), 10000);
  assert.equal(dn.shareOf(10000, 3), 3333);
  assert.throws(() => dn.shareOf(0, 2), /empty/);
  assert.throws(() => dn.shareOf(100, 0), /No winner/);
});

test("payout quotes: handles pay the full share, addresses keep the fee", async () => {
  const handle = await dn.payoutQuote("somewinner", 10000);
  assert.deepEqual(handle, { kind: "handle", sats: 10000, fee: 0 });
  const addr = await dn.payoutQuote("winner@elsewhere.example", 10000);
  assert.equal(addr.kind, "address");
  assert.equal(addr.sats + addr.fee, 10000);
  assert.equal(addr.fee, 100);
  await assert.rejects(dn.payoutQuote("", 10000), /invoice, address, or Ye₿ente handle/);
  // An invoice above the net share is refused (amount reads from the prefix).
  await assert.rejects(dn.payoutQuote("lnbc1000000n1fakeinvoice", 10000), /above this winner's share/);
  const small = await dn.payoutQuote("lnbc50000n1fakeinvoice", 10000);
  assert.equal(small.kind, "invoice");
  assert.equal(small.sats, 5000);
});
