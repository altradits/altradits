// Tests for Step 1 of the Deadman's Switch (lib/deadman.js): plain-code lockdown,
// tested with no ANTHROPIC_API_KEY set.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-deadman-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR"]) {
  delete process.env[k];
}
process.env.BACKUP_DIR = path.join(tmp, "backups");
process.env.BACKUP_KEY = "test-backup-passphrase";
process.env.YEBENTE_WALLETS = "on";
process.env.ADMIN_TOKEN = "test-admin-token-long-and-random-32bytes";

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ai = await import("../lib/ai.js");
const attacks = await import("../lib/attacks.js");
const deadman = await import("../lib/deadman.js");
const ywallet = await import("../lib/ywallet.js");
const adminApi = await import("../api/admin.js");

async function resetDeadman() {
  if (deadman.deadmanActive()) {
    await deadman.liftDeadman({ by: "stanley", note: "test reset" });
  }
  for (const kind of Object.keys(deadman.DEADMAN_THRESHOLDS)) {
    // expire rolling window counters in local store
    await store.setJSON(`deadman:hit:${kind}`, null);
  }
  store.purgeCounters(Date.now() + 3600_000);
}

test("deadman: trips and lifts in plain code with no ANTHROPIC_API_KEY, saves backup, holds non-owner mail, and restores button states", async () => {
  await resetDeadman();
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(deadman.deadmanActive(), false);

  // Stanley has marketing on and everything else off before the incident
  ai.setAllDeptPower(false, { by: "stanley" });
  ai.setDeptPower("marketing", true, { by: "stanley" });
  assert.equal(ai.isDeptOn("marketing"), true);
  assert.equal(ai.isDeptOn("trust"), false);

  const st = await deadman.tripDeadman({
    trigger: "manual",
    reason: "Security drill",
    detail: "Testing Step 1 lockdown",
  });

  assert.equal(deadman.deadmanActive(), true);
  assert.equal(st.active, true);
  assert.equal(st.trigger, "manual");
  assert.equal(st.frozen.yebenteSends, true);
  assert.equal(st.frozen.yebenteTransfers, true);
  assert.equal(st.frozen.yebenteBuys, true);
  assert.equal(st.frozen.yebenteReceive, false, "receiving stays on");
  assert.equal(st.forensicBackup?.ok, true, "encrypted forensic backup saved");
  assert.equal(st.forensicBackup?.encrypted, true);

  // Emergency override powered on the 5 incident response departments
  for (const d of ["founder", "trust", "tech", "finance", "quality"]) {
    assert.equal(ai.isDeptOn(d), true, `${d} powered on for incident response`);
  }

  // Non-owner outbound emails are held during lockdown; owner emails go through
  const walletMail = await email.sendEmail({
    to: "client@example.org",
    subject: "Your wallet link",
    text: "Hello",
    kind: "wallet",
  });
  assert.equal(walletMail.status, "held: deadman lockdown");

  const ownerMail = await email.emailOwner("Lockdown test update", "Owner alert goes through");
  assert.notEqual(ownerMail.status, "held: deadman lockdown");

  // Only Stanley can lift the Deadman's Switch
  await assert.rejects(() => deadman.liftDeadman({ by: "worker" }), /Only Stanley/);
  assert.equal(deadman.deadmanActive(), true);

  const lifted = await deadman.liftDeadman({ by: "stanley", note: "Drill complete" });
  assert.equal(lifted.active, false);
  assert.equal(deadman.deadmanActive(), false);

  // Department power buttons restored to Stanley's exact pre-incident state
  assert.equal(ai.isDeptOn("marketing"), true, "marketing stayed on");
  assert.equal(ai.isDeptOn("trust"), false, "trust returned to off");
  assert.equal(ai.isDeptOn("founder"), false, "founder returned to off");
});

test("deadman: freezes Ye₿ente outbound sends, transfers and M-Pesa buys while keeping receiving live", async () => {
  await resetDeadman();
  const alice = await ywallet.createWallet({ pin: "194827", handle: "dm_alice" });
  const bob = await ywallet.createWallet({ pin: "283910", handle: "dm_bob" });
  await ywallet.credit({ walletId: alice.wallet.id, sats: 20_000, kind: "receive", ref: "init-alice-1" });

  // Trip the Deadman's Switch
  await deadman.tripDeadman({ trigger: "manual", reason: "Freeze check" });

  // 1. Internal transfer is frozen (503)
  await assert.rejects(
    () => ywallet.transfer({ from: alice.wallet, toHandle: "dm_bob", sats: 1000, pin: "194827" }),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );

  // 2. Outbound payOut is frozen (503)
  await assert.rejects(
    () => ywallet.payOut({ from: alice.wallet, to: "dm_bob", sats: 1000, pin: "194827" }),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );

  // 3. M-Pesa buy (quoteBuy & startBuy) is frozen (503)
  await assert.rejects(
    () => ywallet.quoteBuy(alice.wallet, 100),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );
  await assert.rejects(
    () => ywallet.startBuy(alice.wallet, { kes: 100, sats: 500, rate: 10_000_000 }, "ws_CO_test_1"),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );

  // 4. Receiving sats into a wallet stays LIVE during lockdown
  const credited = await ywallet.credit({ walletId: bob.wallet.id, sats: 5_000, kind: "receive", ref: "inbound-during-lockdown" });
  assert.equal(credited.wallet.balance, 5_000, "inbound receive credited normally during lockdown");

  // Lift lockdown and verify transfer works again
  await deadman.liftDeadman({ by: "stanley", note: "Unfreeze check" });
  const tx = await ywallet.transfer({ from: alice.wallet, toHandle: "dm_bob", sats: 1_000, pin: "194827" });
  assert.equal(tx.wallet.balance, 19_000);
});

test("deadman: triggers 1, 2, 3 and 5 trip automatically at their exact thresholds", async () => {
  // Trigger 1: admin_token_guess >= 10 in 10m
  await resetDeadman();
  for (let i = 1; i <= 9; i++) {
    await attacks.recordAttack("admin_token_guess", { where: "/api/admin", ip: `10.${i}` });
  }
  assert.equal(deadman.deadmanActive(), false, "9 wrong admin tokens do not trip");
  await attacks.recordAttack("admin_token_guess", { where: "/api/admin", ip: "10.10" });
  assert.equal(deadman.deadmanActive(), true, "10th wrong admin token trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "admin_token_guess");

  // Trigger 2: secret_guess >= 5 in 10m
  await resetDeadman();
  for (let i = 1; i <= 4; i++) {
    await attacks.recordAttack("secret_guess", { where: "/api/deploy", ip: `20.${i}` });
  }
  assert.equal(deadman.deadmanActive(), false, "4 wrong secrets do not trip");
  await attacks.recordAttack("secret_guess", { where: "/api/deploy", ip: "20.5" });
  assert.equal(deadman.deadmanActive(), true, "5th wrong secret trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "secret_guess");

  // Trigger 3: passkey_forgery >= 3 in 10m
  await resetDeadman();
  await attacks.recordAttack("passkey_forgery", { where: "wallet a", ip: "30.1" });
  await attacks.recordAttack("passkey_forgery", { where: "wallet a", ip: "30.2" });
  assert.equal(deadman.deadmanActive(), false, "2 passkey failures do not trip");
  await attacks.recordAttack("passkey_forgery", { where: "wallet a", ip: "30.3" });
  assert.equal(deadman.deadmanActive(), true, "3rd passkey failure trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "passkey_forgery");

  // Trigger 5: pin_guessing >= 10 in 10m
  await resetDeadman();
  for (let i = 1; i <= 9; i++) {
    await attacks.recordAttack("pin_guessing", { where: `wallet ${i}`, ip: `50.${i}` });
  }
  assert.equal(deadman.deadmanActive(), false, "9 PIN lockouts do not trip");
  await attacks.recordAttack("pin_guessing", { where: "wallet 10", ip: "50.10" });
  assert.equal(deadman.deadmanActive(), true, "10th PIN lockout trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "pin_guessing");
});

test("deadman: Trigger 4 — custodial solvency shortfall stays an alert, while an unexplained node balance drop trips", async () => {
  await resetDeadman();

  // Custodial solvency shortfall alone must NOT trip the Deadman's Switch
  await attacks.recordAttack("solvency", { where: "Ye₿ente wallets", detail: "Owed 500000 sats; node can send 400000 sats" });
  assert.equal(deadman.deadmanActive(), false, "custodial solvency shortfall stays an alert only");

  // Baseline node balance: 100,000 sats
  const base = await deadman.checkNodeBalance({ totalSats: 100_000 });
  assert.equal(base.ok, true);
  assert.equal(deadman.deadmanActive(), false);

  // Legitimate recorded owner channel action or tip refund of 25,000 sats -> does NOT trip
  await deadman.recordNodeAction({ sats: 25_000, reason: "tip refund", by: "stanley" });
  const afterLegit = await deadman.checkNodeBalance({ totalSats: 75_000 });
  assert.equal(afterLegit.ok, true, "balance drop matched a recorded node action");
  assert.equal(deadman.deadmanActive(), false);

  // Unexplained node balance drop of 30,000 sats (75,000 -> 45,000) with no recorded payment -> TRIPS!
  const afterDrain = await deadman.checkNodeBalance({ totalSats: 45_000 });
  assert.equal(afterDrain.ok, false);
  assert.equal(afterDrain.unexplainedSats, 30_000);
  assert.equal(deadman.deadmanActive(), true, "unexplained node balance drop trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "unexplained_balance_drop");
});

test("deadman: Trigger 6 — file integrity ignores a clean deploy of a merged commit, but trips on tampering", async () => {
  await resetDeadman();

  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-gitcheck-"));
  fs.mkdirSync(path.join(repoDir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, ".htaccess"), "<FilesMatch \"^(server\\.mjs)$\">\nRequire all denied\n</FilesMatch>\n");
  fs.writeFileSync(path.join(repoDir, "lib", ".htaccess"), "Require all denied\n");
  fs.writeFileSync(path.join(repoDir, "server.mjs"), "export const v = 1;\n");

  execFileSync("git", ["init", "-q"], { cwd: repoDir });
  execFileSync("git", ["add", ".htaccess", "lib/.htaccess", "server.mjs"], { cwd: repoDir });
  execFileSync("git", ["-c", "user.name=altradits", "-c", "user.email=altradits@gmail.com", "commit", "-q", "-m", "Initial"], { cwd: repoDir });

  // Clean repo matches HEAD
  const clean1 = await deadman.checkFileIntegrity({ rootDir: repoDir });
  assert.equal(clean1.ok, true);
  assert.equal(deadman.deadmanActive(), false);

  // Simulate a deploy of a merged main commit (files change AND git HEAD advances)
  fs.writeFileSync(path.join(repoDir, "server.mjs"), "export const v = 2;\n");
  execFileSync("git", ["add", "server.mjs"], { cwd: repoDir });
  execFileSync("git", ["-c", "user.name=altradits", "-c", "user.email=altradits@gmail.com", "commit", "-q", "-m", "Merged deploy"], { cwd: repoDir });

  const afterDeploy = await deadman.checkFileIntegrity({ rootDir: repoDir });
  assert.equal(afterDeploy.ok, true, "clean deploy of a merged commit never trips file integrity");
  assert.equal(deadman.deadmanActive(), false);

  // Simulate on-server tampering with server.mjs outside of git HEAD
  fs.writeFileSync(path.join(repoDir, "server.mjs"), "export const v = 'tampered';\n");
  const tampered = await deadman.checkFileIntegrity({ rootDir: repoDir });
  assert.equal(tampered.ok, false);
  assert.equal(deadman.deadmanActive(), true, "uncommitted server file modification trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "file_tampering");
  await resetDeadman();
});

test("deadman: /api/admin exposes choumi & deadman views and blocks node_topup during lockdown", async () => {
  await resetDeadman();
  const headers = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "Content-Type": "application/json" };

  // Trip via /api/admin POST
  const tripRes = await adminApi.POST(new Request("http://x/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "deadman_trip", reason: "Admin API test" }),
  }));
  assert.equal(tripRes.status, 200);
  const tripJson = await tripRes.json();
  assert.equal(tripJson.active, true);

  // node_topup is blocked with 503 during lockdown
  const topupRes = await adminApi.POST(new Request("http://x/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "node_topup", sats: 50_000 }),
  }));
  assert.equal(topupRes.status, 503);

  // GET /api/admin?view=choumi returns ai power buttons and deadman status
  const choumiRes = await adminApi.GET(new Request("http://x/api/admin?view=choumi", { headers }));
  assert.equal(choumiRes.status, 200);
  const choumiJson = await choumiRes.json();
  assert.equal(choumiJson.deadman.active, true);
  assert.equal(Array.isArray(choumiJson.ai.departments), true);
  assert.equal(choumiJson.ai.departments.length, 12);

  // Lift via /api/admin POST
  const liftRes = await adminApi.POST(new Request("http://x/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "deadman_lift", note: "Admin API lift" }),
  }));
  assert.equal(liftRes.status, 200);
  assert.equal((await liftRes.json()).active, false);
});
