// Mempool Mayhem staked play (lib/trivia-stakes.js, hold invoices, the admin
// stake actions): one equal own stake per player, locked on hold invoices
// until the game ends, behind TRIVIA_STAKES=on (default off). When off, every
// staked endpoint refuses with plain words and donor mode stays live.
// Run: node --test test/trivia-stakes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-trivia-stakes-"));
process.chdir(tmp);
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "TRIVIA", "TRIVIA_STAKES", "TRIVIA_HOUSE_WALLET"]) delete process.env[k];
process.env.TRIVIA = "on";
process.env.TRIVIA_STAKES = "on";
process.env.YEBENTE_WALLETS = "on";
process.env.ADMIN_TOKEN = "test-admin-token-long-and-random-32bytes";

const t = await import("../lib/trivia.js");
const sk = await import("../lib/trivia-stakes.js");
const dn = await import("../lib/trivia-donors.js");
const led = await import("../lib/trivia-ledger.js");
const live = await import("../lib/trivia-live.js");
const yw = await import("../lib/ywallet.js");
const api = await import("../api/trivia.js");
const admin = await import("../api/admin.js");
const store = await import("../lib/store.js");
const { holdStateOf } = await import("../lib/lightning.js");

await yw.createWallet({ pin: "482910", handle: "trvhouse" });
await yw.createWallet({ pin: "482911", handle: "trvwinner" });
process.env.TRIVIA_HOUSE_WALLET = "trvhouse";

// A stand-in node for hold invoices: locks are made here, and each hash locks
// when its payer pays (payHold), then settles or cancels on our call.
const holds = new Map();
let holdSeq = 0;
const payHold = (hash) => { holds.get(hash).state = "accepted"; };
sk.setTriviaStakesLightning({
  createHoldInvoice: async ({ sats }) => {
    const preimage = `${(holdSeq++).toString(16).padStart(8, "0")}${"d".repeat(56)}`;
    const paymentHash = crypto.createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
    holds.set(paymentHash, { sats, state: "open", preimage });
    return { bolt11: `lnbc${sats * 10}n1stakefake`, paymentHash, preimage, expiresAt: new Date(Date.now() + 86400e3).toISOString() };
  },
  holdInvoiceState: async (hash) => holds.get(hash)?.state || "unknown",
  settleHoldInvoice: async (preimage) => {
    for (const v of holds.values()) if (v.preimage === preimage) v.state = "settled";
    return true;
  },
  cancelHoldInvoice: async (hash) => {
    if (holds.has(hash)) holds.get(hash).state = "cancelled";
    return true;
  },
  qrSvg: async () => "<svg></svg>",
});

// Donor invoices stay separate, so the off test can prove donor mode lives on.
dn.setTriviaLightning({
  createInvoice: async () => ({ bolt11: "lnbc10n1donorfake", paymentHash: `${"e".repeat(64)}`, expiresAt: new Date(Date.now() + 3600e3).toISOString() }),
  invoicePaid: async () => false,
  qrSvg: async () => "<svg></svg>",
});

const post = (body) => api.POST(new Request("https://altradits.com/api/trivia", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const get = (qs) => api.GET(new Request(`https://altradits.com/api/trivia${qs}`));
const bodyOf = async (res) => ({ status: res.status, json: await res.json() });
const TOKEN = "test-admin-token-long-and-random-32bytes";
const adminPost = (body) => admin.POST(new Request("https://altradits.com/api/admin", { method: "POST",
  headers: { authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const T0 = 1_800_000_000_000;
const first = () => 0;
const fakeBank = () => {
  const questions = [], byId = {};
  for (const level of t.LEVELS) for (let i = 0; i < 3; i++) {
    const q = { id: `${level}-st${i}`, level, q: `${level} q${i}?`, choices: ["a", "b", "c", "d"], answer: i % 4, source: "test" };
    questions.push(q); byId[q.id] = q;
  }
  return { questions, byId };
};
const bank = fakeBank();

test("off switch: staked endpoints refuse in plain words, donor mode stays live", async () => {
  await dn.createGame({ id: "stake-off-1", title: "Off game", players: [{ name: "Amina", account: "amina.ln" }] });
  delete process.env.TRIVIA_STAKES;
  await assert.rejects(sk.setStake("stake-off-1", 1000), /Staked play is off/);
  await assert.rejects(sk.stakeSeat("stake-off-1", "amina.ln"), /Staked play is off/);
  await assert.rejects(sk.stakeStatus("a".repeat(64)), /Staked play is off/);
  await assert.rejects(sk.stakesOf("stake-off-1"), /Staked play is off/);
  await assert.rejects(sk.settleStakes("stake-off-1"), /Staked play is off/);
  await assert.rejects(sk.cancelStakes("stake-off-1"), /Staked play is off/);
  const action = await bodyOf(await post({ action: "stake", game: "stake-off-1", account: "amina.ln" }));
  assert.equal(action.status, 503);
  assert.match(action.json.error, /Staked play is off/);
  assert.equal((await bodyOf(await get("?view=stakes&game=stake-off-1"))).status, 503);
  assert.equal((await bodyOf(await get(`?view=stake&hash=${"a".repeat(64)}`))).status, 503);
  const adminSet = await bodyOf(await adminPost({ action: "trivia_stake_set", id: "stake-off-1", sats: 1000 }));
  assert.equal(adminSet.status, 503);
  assert.match(adminSet.json.error, /Staked play is off/);
  const health = await bodyOf(await get(""));
  assert.equal(health.json.stakes, false);
  assert.equal(health.json.on, true);
  const donor = await dn.fundGame("stake-off-1", { sats: 100 });
  assert.ok(donor.bolt11.startsWith("lnbc")); // donor mode lives on
  assert.equal((await yw.walletByHandle("trvhouse")).balance, 0); // no stake moved while off
  process.env.TRIVIA_STAKES = "on";
});

test("node states map to one plain word each", () => {
  assert.equal(holdStateOf("OPEN"), "open");
  assert.equal(holdStateOf("ACCEPTED"), "accepted");
  assert.equal(holdStateOf("SETTLED"), "settled");
  assert.equal(holdStateOf("CANCELED"), "cancelled");
  assert.equal(holdStateOf("whatever"), "unknown");
});

test("one equal stake per game, set before play", async () => {
  await dn.createGame({ id: "stake-set-1", title: "Set game" });
  await assert.rejects(sk.setStake("no-such-game", 1000), /No such game/);
  await assert.rejects(sk.setStake("stake-set-1", 50), /100 to 100,000/);
  await assert.rejects(sk.setStake("stake-set-1", 100.5), /100 to 100,000/);
  await assert.rejects(sk.setStake("stake-set-1", 200000), /100 to 100,000/);
  const set = await bodyOf(await adminPost({ action: "trivia_stake_set", id: "stake-set-1", sats: 1000 }));
  assert.equal(set.json.ok, true);
  assert.equal(set.json.stake.sats, 1000);
  assert.equal((await sk.setStake("stake-set-1", 2000)).sats, 2000); // no locks yet, so a fix is allowed
  const view = await bodyOf(await get("?view=stakes&game=stake-set-1"));
  assert.equal(view.json.staked, true);
  assert.equal(view.json.sats, 2000);
  assert.ok(!("players" in view.json)); // the public view never names accounts
});

test("each seat locks the same own stake, once", async () => {
  await dn.createGame({ id: "stake-seat-1", title: "Seat game",
    players: [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }] });
  await assert.rejects(sk.stakeSeat("stake-seat-1", "amina.ln"), /takes no stake/);
  await sk.setStake("stake-seat-1", 1000);
  const a = await sk.stakeSeat("stake-seat-1", "amina.ln");
  assert.ok(a.bolt11.startsWith("lnbc"));
  assert.equal(a.sats, 1000);
  await assert.rejects(sk.stakeSeat("stake-seat-1", "amina.ln"), /already locking/);
  await assert.rejects(sk.stakeSeat("stake-seat-1", "stranger.ln"), /no seat/);
  await assert.rejects(sk.setStake("stake-seat-1", 2000), /already locking/);
  const b = await bodyOf(await post({ action: "stake", game: "stake-seat-1", account: "brian.ln" }));
  assert.equal(b.json.sats, 1000); // the same equal stake, from his own wallet
  payHold(a.hash);
  payHold(b.json.hash);
  assert.equal((await sk.stakeStatus(a.hash)).state, "locked");
  assert.equal((await sk.stakeStatus(b.json.hash)).state, "locked");
  assert.equal((await led.totals("stake-seat-1")).net, 0); // locked is not ours yet: the books stay empty
  const full = await sk.stakesOf("stake-seat-1");
  assert.equal(full.ready, true);
  assert.equal(full.locked, 2);
});

test("locks open only at the end, then winners are paid from the pool", async () => {
  await dn.createGame({ id: "stake-end-1", title: "End game",
    players: [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }] });
  await sk.setStake("stake-end-1", 1000);
  const a = await sk.stakeSeat("stake-end-1", "amina.ln");
  const b = await sk.stakeSeat("stake-end-1", "brian.ln");
  payHold(a.hash);
  payHold(b.hash);
  await sk.stakeStatus(a.hash);
  await sk.stakeStatus(b.hash);
  await assert.rejects(sk.settleStakes("stake-end-1"), /when the game ends/);
  const meta = await dn.gameMeta("stake-end-1");
  meta.status = "over";
  meta.winners = ["Amina"];
  await store.setJSON("trv:meta:stake-end-1", meta);
  const done = await bodyOf(await adminPost({ action: "trivia_stake_settle", id: "stake-end-1" }));
  assert.equal(done.json.settled.settled, 2);
  assert.equal(done.json.settled.settledSats, 2000);
  assert.equal((await sk.stakeStatus(a.hash)).state, "settled");
  assert.equal((await led.verify("stake-end-1")).ok, true);
  assert.equal((await dn.poolView("stake-end-1")).poolSats, 2000); // stakes join the pool
  assert.ok((await yw.walletByHandle("trvhouse")).balance >= 2000);
  const again = await sk.settleStakes("stake-end-1");
  assert.equal(again.settled, 0); // rerunning books nothing twice
  assert.equal((await led.totals("stake-end-1")).count, 2);
  dn.setTriviaPayer(async () => ({ ref: "staketest", status: "completed", fee: 0 }));
  try {
    const paid = await bodyOf(await adminPost({ action: "trivia_payout", game: "stake-end-1", winner: "Amina", to: "trvwinner", pin: "482910" }));
    assert.equal(paid.json.payout.state, "done");
    assert.equal(paid.json.payout.sats, 2000); // the winner takes the staked pool
  } finally { dn.setTriviaPayer(null); }
  assert.equal((await led.totals("stake-end-1")).net, 0);
});

test("cancelled locks refund and never touch the books", async () => {
  await dn.createGame({ id: "stake-cancel-1", title: "Cancel game",
    players: [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }] });
  await sk.setStake("stake-cancel-1", 500);
  const a = await sk.stakeSeat("stake-cancel-1", "amina.ln");
  await sk.stakeSeat("stake-cancel-1", "brian.ln");
  payHold(a.hash);
  await sk.stakeStatus(a.hash);
  const out = await sk.cancelStakes("stake-cancel-1");
  assert.equal(out.cancelled, 2);
  assert.equal(holds.get(a.hash).state, "cancelled"); // the node refunds the payer
  assert.equal((await sk.stakeStatus(a.hash)).state, "cancelled");
  assert.equal((await led.totals("stake-cancel-1")).net, 0);
  assert.equal((await led.totals("stake-cancel-1")).count, 0);
});

test("an expired unpaid lock dies, and the seat can lock again", async () => {
  await dn.createGame({ id: "stake-exp-1", title: "Expiry game", players: [{ name: "Amina", account: "amina.ln" }] });
  await sk.setStake("stake-exp-1", 500);
  const a = await sk.stakeSeat("stake-exp-1", "amina.ln");
  const it = await store.getJSON(`trv:sk:${a.hash}`);
  it.expiresAt = new Date(Date.now() - 3600e3).toISOString();
  await store.setJSON(`trv:sk:${a.hash}`, it);
  assert.equal((await sk.stakeStatus(a.hash)).state, "expired");
  const again = await sk.stakeSeat("stake-exp-1", "amina.ln");
  assert.notEqual(again.hash, a.hash);
});

test("a staked game starts only with the switch on and every seat locked", async () => {
  await dn.createGame({ id: "stake-start-1", title: "Start game",
    players: [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }] });
  await sk.setStake("stake-start-1", 500);
  await assert.rejects(live.startGame("stake-start-1", { totalRounds: 1 }, T0, bank, first), /Every seat locks/);
  const a = await sk.stakeSeat("stake-start-1", "amina.ln");
  payHold(a.hash);
  await sk.stakeStatus(a.hash);
  await assert.rejects(live.startGame("stake-start-1", { totalRounds: 1 }, T0, bank, first), /Every seat locks/);
  const b = await sk.stakeSeat("stake-start-1", "brian.ln");
  payHold(b.hash);
  await sk.stakeStatus(b.hash);
  delete process.env.TRIVIA_STAKES;
  await assert.rejects(live.startGame("stake-start-1", { totalRounds: 1 }, T0, bank, first), /Staked play is off/);
  process.env.TRIVIA_STAKES = "on";
  const v = await live.startGame("stake-start-1", { totalRounds: 1 }, T0, bank, first);
  assert.equal(v.status, "live");
});
