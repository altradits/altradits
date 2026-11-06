// Mempool Mayhem live play (lib/trivia-live.js, api/trivia.js play views and
// answers, api/admin.js trivia_start): the server opens and closes rounds on
// its own clock, stamps every reply, checks correctness at resolve time, and
// moves battle sats once per settled round with the total conserved.
// Run: node --test test/trivia-live.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-trivia-live-"));
process.chdir(tmp);
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "TRIVIA", "TRIVIA_HOUSE_WALLET"]) delete process.env[k];
process.env.TRIVIA = "on";
process.env.YEBENTE_WALLETS = "on";
process.env.ADMIN_TOKEN = "test-admin-token-long-and-random-32bytes";

// A bank on disk, so the API layer (which reads data/trivia itself) plays too.
const LEVELS = ["beginner", "basic", "intermediate", "advanced", "expert"];
fs.mkdirSync(path.join(tmp, "data", "trivia"), { recursive: true });
for (let n = 1; n <= LEVELS.length; n++) {
  fs.writeFileSync(path.join(tmp, "data", "trivia", `level-${n}.json`), JSON.stringify({
    level: LEVELS[n - 1],
    questions: [1, 2, 3].map((i) => ({ id: `L${n}-q${i}`, level: LEVELS[n - 1],
      q: `Bank question ${n}.${i}?`, choices: ["a", "b", "c", "d"], answer: (i - 1) % 4, source: "test bank" })),
  }));
}

const t = await import("../lib/trivia.js");
const dn = await import("../lib/trivia-donors.js");
const live = await import("../lib/trivia-live.js");
const api = await import("../api/trivia.js");
const admin = await import("../api/admin.js");

const T0 = 1_800_000_000_000;
const first = () => 0; // deterministic draw: the first question of the level pool
const fakeBank = () => {
  const questions = [], byId = {};
  for (const level of t.LEVELS) for (let i = 0; i < 3; i++) {
    const q = { id: `${level}-${i}`, level, q: `${level} q${i}?`, choices: ["a", "b", "c", "d"], answer: i % 4, source: "test" };
    questions.push(q); byId[q.id] = q;
  }
  return { questions, byId };
};
const bank = fakeBank();
const mkGame = (id, players) => dn.createGame({ id, title: `Game ${id}`, players });
const post = (body) => api.POST(new Request("https://altradits.com/api/trivia", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const get = (qs) => api.GET(new Request(`https://altradits.com/api/trivia${qs}`));
const bodyOf = async (res) => ({ status: res.status, json: await res.json() });
const TOKEN = "test-admin-token-long-and-random-32bytes";
const adminPost = (body) => admin.POST(new Request("https://altradits.com/api/admin", { method: "POST",
  headers: { authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const adminGet = (view, extra = "") => admin.GET(new Request(`https://altradits.com/api/admin?view=${view}${extra}`,
  { headers: { authorization: `Bearer ${TOKEN}` } }));

test("starting opens round one and hides the answer", async () => {
  await mkGame("live-start-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  const v = await live.startGame("live-start-1", { totalRounds: 2 }, T0, bank, first);
  assert.equal(v.status, "live");
  assert.equal(v.round, 0);
  assert.ok(v.question.id);
  assert.equal(v.question.choices.length, 4);
  assert.ok(!("answer" in v.question));
  assert.equal(v.question.deadlineMs, T0 + t.QUESTION_MS);
  await assert.rejects(live.startGame("live-start-1", {}, T0, bank, first), /Only a scheduled game starts/);
  await assert.rejects(live.startGame("no-such-game", {}, T0, bank, first), /No such game/);
});

test("starting needs two players and different names", async () => {
  await mkGame("live-start-2", [{ name: "Solo", account: "solo.ln" }]);
  await assert.rejects(live.startGame("live-start-2", {}, T0, bank, first), /At least 2/);
  await mkGame("live-start-3", [{ name: "Same", account: "same1.ln" }, { name: "Same", account: "same2.ln" }]);
  await assert.rejects(live.startGame("live-start-3", {}, T0, bank, first), /must differ/);
});

test("off switch: starting and answering refuse, reads stay up", async () => {
  await mkGame("live-off-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  process.env.TRIVIA = "";
  await assert.rejects(live.startGame("live-off-1", {}, T0, bank, first), /off/);
  await assert.rejects(live.submitAnswer("live-off-1", { account: "amina.ln", index: 0 }, T0), /off/);
  const v = await live.playView("live-off-1", {}, T0, bank, first);
  assert.equal(v.game, "live-off-1");
  assert.equal(v.status, "scheduled");
  process.env.TRIVIA = "on";
});

test("answers count only in the window, once, from a seat", async () => {
  await mkGame("live-window-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  await live.startGame("live-window-1", { totalRounds: 2 }, T0, bank, first);
  await assert.rejects(live.submitAnswer("live-window-1", { account: "amina.ln", index: 0 }, T0 + 100), /Too fast/);
  const ok = await live.submitAnswer("live-window-1", { account: "amina.ln", index: 0 }, T0 + 1000);
  assert.equal(ok.accepted, true);
  await assert.rejects(live.submitAnswer("live-window-1", { account: "amina.ln", index: 1 }, T0 + 1100), /already in/);
  await assert.rejects(live.submitAnswer("live-window-1", { account: "stranger.ln", index: 0 }, T0 + 1200), /no seat/);
  await assert.rejects(live.submitAnswer("live-window-1", { account: "brian.ln", index: 0 }, T0 + t.QUESTION_MS + 1), /Time is up/);
  const bad = await bodyOf(await post({ action: "answer", game: "xx", account: "amina.ln", index: 0 }));
  assert.equal(bad.status, 400);
});

test("a settled round scores, costs lives, and moves battle sats conserved", async () => {
  await mkGame("live-settle-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }, { name: "Chiku", account: "chiku.ln" }]);
  const started = await live.startGame("live-settle-1", { totalRounds: 3 }, T0, bank, first);
  const right = bank.byId[started.question.id].answer;
  await live.submitAnswer("live-settle-1", { account: "amina.ln", index: right }, T0 + 600);
  await live.submitAnswer("live-settle-1", { account: "brian.ln", index: (right + 1) % 4 }, T0 + 700);
  const open = await live.playView("live-settle-1", { account: "chiku.ln" }, T0 + 2500, bank, first);
  assert.equal(open.round, 0); // Chiku is silent but the clock is still running
  assert.equal(open.question.id, started.question.id);
  const v = await live.playView("live-settle-1", { account: "amina.ln" }, T0 + t.QUESTION_MS + 100, bank, first);
  assert.equal(v.round, 1);
  assert.equal(v.lastResult.answer, right);
  const ranks = Object.fromEntries(v.ranks.map((p) => [p.name, p]));
  assert.equal(ranks.Amina.score, 100);
  assert.equal(ranks.Amina.lives, 3);
  assert.equal(ranks.Brian.score, 0);
  assert.equal(ranks.Brian.lives, 2);
  assert.equal(ranks.Chiku.lives, 2); // silence costs a life
  assert.deepEqual(v.battle, { p1: 1020, p2: 990, p3: 990 }); // 30 antes to the one right answer, less her own ante
  assert.equal(Object.values(v.battle).reduce((n, s) => n + s, 0), 3000);
  assert.equal(v.me.name, "Amina");
  assert.equal(v.me.battleSats, 1020);
});

test("the earliest right answer takes the leftover sat", async () => {
  const out = { p1: { answered: true, correct: true }, p2: { answered: true, correct: true },
    p3: { answered: true, correct: true }, p4: { answered: true, correct: false } };
  const battle = { p1: 1000, p2: 1000, p3: 1000, p4: 1000 };
  const r = live.settleBattle(battle, out, { p1: 3000, p2: 1000, p3: 2000, p4: 1500 });
  assert.equal(r.pot, 40);
  assert.equal(r.correct, 3);
  assert.deepEqual(battle, { p1: 1003, p2: 1004, p3: 1003, p4: 990 }); // 13 each, leftover to p2
  const back = { p1: 1000, p2: 1000 };
  const r2 = live.settleBattle(back, { p1: { answered: true, correct: false }, p2: { answered: false, correct: false } }, {});
  assert.equal(r2.refunded, true);
  assert.deepEqual(back, { p1: 1000, p2: 1000 });
});

test("the game ends with named winners and no open question", async () => {
  await mkGame("live-end-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  const started = await live.startGame("live-end-1", { totalRounds: 1 }, T0, bank, first);
  const right = bank.byId[started.question.id].answer;
  await live.submitAnswer("live-end-1", { account: "amina.ln", index: right }, T0 + 900);
  await live.submitAnswer("live-end-1", { account: "brian.ln", index: (right + 2) % 4 }, T0 + 950);
  const v = await live.playView("live-end-1", {}, T0 + 1000, bank, first);
  assert.equal(v.status, "over");
  assert.deepEqual(v.winners, ["Amina"]);
  assert.equal(v.question, null);
  const meta = await dn.gameMeta("live-end-1");
  assert.equal(meta.status, "over");
  assert.deepEqual(meta.winners, ["Amina"]);
});

test("a late read settles the open round and gives the next its full time", async () => {
  await mkGame("live-jump-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  await live.startGame("live-jump-1", { totalRounds: 2 }, T0, bank, first);
  const late = T0 + 3 * t.QUESTION_MS + 5000;
  const v = await live.playView("live-jump-1", {}, late, bank, first);
  assert.equal(v.status, "live"); // only the open round was due; the next opens now
  assert.equal(v.round, 1);
  assert.equal(v.question.deadlineMs, late + t.QUESTION_MS);
  assert.equal(Object.values(v.battle).reduce((n, s) => n + s, 0), 2000);
  const end = await live.playView("live-jump-1", {}, late + t.QUESTION_MS + 1000, bank, first);
  assert.equal(end.status, "over");
  assert.equal(end.round, 2);
});

test("a cancelled game freezes: no answers, no open question", async () => {
  await mkGame("live-cancel-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  await live.startGame("live-cancel-1", { totalRounds: 5 }, T0, bank, first);
  await dn.cancelGame("live-cancel-1", { rule: "return" });
  await assert.rejects(live.submitAnswer("live-cancel-1", { account: "amina.ln", index: 0 }, T0 + 1000), /No round is open/);
  const v = await live.playView("live-cancel-1", {}, T0 + t.QUESTION_MS + 100, bank, first);
  assert.equal(v.status, "cancelled");
  assert.equal(v.question, null);
});

test("api: games and play views answer, answers post", async () => {
  await mkGame("live-api-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  await live.startGame("live-api-1", { totalRounds: 2 }); // the bank on disk
  const games = await bodyOf(await get("?view=games"));
  assert.ok(games.json.games.some((g) => g.id === "live-api-1"));
  const play = await bodyOf(await get("?view=play&game=live-api-1&account=amina.ln"));
  assert.equal(play.json.status, "live");
  assert.ok(play.json.question.choices.length === 4);
  assert.ok(!("answer" in play.json.question));
  await new Promise((r) => setTimeout(r, 650)); // past the too-fast window
  const ans = await bodyOf(await post({ action: "answer", game: "live-api-1", account: "brian.ln", index: 1 }));
  assert.equal(ans.json.accepted, true);
  const missing = await bodyOf(await get("?view=play&game=no-such-game"));
  assert.equal(missing.status, 404);
});

test("admin starts games and watches live play", async () => {
  await mkGame("live-admin-1", [{ name: "Amina", account: "amina.ln" }, { name: "Brian", account: "brian.ln" }]);
  const started = await bodyOf(await adminPost({ action: "trivia_start", id: "live-admin-1", totalRounds: 2 }));
  assert.equal(started.json.ok, true);
  assert.equal(started.json.live.status, "live");
  assert.ok(started.json.live.question.id);
  const again = await bodyOf(await adminPost({ action: "trivia_start", id: "live-admin-1" }));
  assert.match(again.json.error, /Only a scheduled game starts/);
  const one = await bodyOf(await adminGet("trivia_game", "&game=live-admin-1"));
  assert.equal(one.json.live.status, "live");
  assert.equal(one.json.meta.status, "live");
});
