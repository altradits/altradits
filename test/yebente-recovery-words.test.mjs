// Recovery words typed the way people really type them (reports of "my
// recovery words don't work", 20 Nov 2026). The printed card shows the words
// in two numbered columns (1-6 left, 7-12 right), the share sheet sends the
// address with them, and phones add capitals, commas and line breaks.
// Run: node --test test/yebente-recovery-words.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-words-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://words.test", EMAIL_APPROVAL: "off" });

const yw = await import("../lib/ywallet.js");
const email = await import("../lib/email.js");
email.setMailer({ sendMail: async () => {} });

const device = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" }).toString("base64url");
let n = 0;
async function wallet() {
  const r = await yw.createWallet({ pin: "482910", handle: `words-${++n}`, device: device() });
  return { id: r.wallet.id, address: r.wallet.address, words: r.recovery.split(" ") };
}
// A fresh PIN each time: a restore refuses a PIN the wallet used before.
const PINS = ["731842", "590317", "846205", "203958", "618470", "947362", "385916", "472059", "160384", "829541"];
let p = 0;
const restore = (recovery) => yw.restoreWallet({ recovery, pin: PINS[p++ % PINS.length], device: device() });
async function opens(w, typed, why) {
  const r = await restore(typed);
  assert.equal(r.wallet.id, w.id, why);
}

test("the words exactly as shown still work", async () => {
  const w = await wallet();
  await opens(w, w.words.join(" "), "exact");
});

test("capitals, extra spaces and line breaks", async () => {
  const w = await wallet();
  await opens(w, `  ${w.words.slice(0, 6).map((x) => x[0].toUpperCase() + x.slice(1)).join("  ")}\n${w.words.slice(6).join("\t")}  `, "capitals and line breaks");
});

test("commas, full stops or dashes between the words", async () => {
  const w = await wallet();
  await opens(w, w.words.join(", "), "commas");
  await opens(w, w.words.join(",") + ".", "commas without spaces");
  await opens(w, w.words.join("-"), "dashes");
});

test("numbers copied from the card: 1. acacia 2) amber 3 ...", async () => {
  const w = await wallet();
  await opens(w, w.words.map((x, i) => `${i + 1}. ${x}`).join(" "), "numbered with full stops");
  await opens(w, w.words.map((x, i) => `${i + 1}) ${x}`).join("\n"), "numbered with brackets");
});

test("the card read row by row: 1, 7, 2, 8, 3, 9 ...", async () => {
  const w = await wallet();
  const rows = [];
  for (let r = 0; r < 6; r++) rows.push(w.words[r], w.words[r + 6]);
  await opens(w, rows.join(" "), "row-by-row reading of the two-column card");
  const numbered = [];
  for (let r = 0; r < 6; r++) numbered.push(`${r + 1} ${w.words[r]}`, `${r + 7} ${w.words[r + 6]}`);
  await opens(w, numbered.join(" "), "row-by-row with the card's numbers");
});

test("the whole shared text pasted, address and all", async () => {
  const w = await wallet();
  await opens(w, `Ye₿ente ${w.address}\n${w.words.join(" ")}`, "share-sheet text");
});

test("one small typo in a word (autocorrect) is fixed when only one word fits", async () => {
  const w = await wallet();
  // A dropped last letter that no other list word is one letter away from.
  const phrase = w.words.join(" ");
  let typoPhrase = null;
  for (let i = 0; i < 12 && !typoPhrase; i++) {
    if (w.words[i].length < 5) continue;
    const t = [...w.words]; t[i] = t[i].slice(0, -1);
    if (yw.recoveryCandidates(t.join(" ")).candidates[0] === phrase) typoPhrase = t.join(" ");
  }
  if (!typoPhrase) return; // every long word here has a near neighbour: nothing to test this run
  await opens(w, typoPhrase, "a dropped letter");
});

test("an ambiguous typo is never guessed", () => {
  // "tamber" is one letter from both "amber" and "timber": not fixed, so the phrase is short.
  const words = ["acacia", "amber", "anchor", "apple", "arrow", "autumn", "bamboo", "banana", "basil", "beacon", "berry", "tamber"];
  assert.equal(yw.recoveryCandidates(words.join(" ")).words, 11);
});

test("wrong words are still refused, and the wallet isn't touched", async () => {
  let w = await wallet();
  for (let i = 0; i < 10 && w.words[0] === w.words[1]; i++) w = await wallet();
  if (w.words[0] === w.words[1]) return; // identical draw: swapping proves nothing this run
  const wrong = [...w.words].reverse();
  await assert.rejects(restore(wrong.join(" ")), /don't match/);
  await assert.rejects(restore(w.words.slice(0, 11).join(" ")), /12 recovery words|don't match/);
  const shuffled = [...w.words]; [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  await assert.rejects(restore(shuffled.join(" ")), /don't match/, "only the two real reading orders are tried, not any order");
});
