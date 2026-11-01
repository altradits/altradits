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
process.env.DEPLOY_SECRET = "test-deploy-secret-32bytes";

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ai = await import("../lib/ai.js");
const attacks = await import("../lib/attacks.js");
const deadman = await import("../lib/deadman.js");
const ywallet = await import("../lib/ywallet.js");
const adminApi = await import("../api/admin.js");
const deployApi = await import("../api/deploy.js");

const ALL_CHECKLIST_TRUE = {
  attackStopped15m: true,
  solvencyConfirmed: true,
  forensicBackupSaved: true,
  secretsRotatedIfNeeded: true,
  stanleyConfirmed: true,
};

async function resetDeadman() {
  if (deadman.deadmanActive()) {
    await deadman.liftDeadman({ by: "stanley", force: "force", note: "test reset" });
  }
  for (const kind of Object.keys(deadman.DEADMAN_THRESHOLDS)) {
    await store.setJSON(`deadman:hit:${kind}`, null);
  }
  await store.setJSON("deadman:admin_guess_burst", null);
  await store.setJSON("secw:admin_ips", null);
  await store.setJSON("deadman:check:last", null);
  store.purgeCounters(Date.now() + 7200_000);
}

test("deadman: trips and lifts in plain code with no ANTHROPIC_API_KEY, enforces the 5-point checklist (or explicit force + note), and restores button states", async () => {
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

  // Only Stanley can lift the Deadman's Switch
  await assert.rejects(() => deadman.liftDeadman({ by: "worker", checklist: ALL_CHECKLIST_TRUE }), /Only Stanley/);

  // Refuses until every checklist item is true
  await assert.rejects(
    () => deadman.liftDeadman({ by: "stanley", note: "Incomplete checklist" }),
    /until every checklist item is true/,
  );
  assert.equal(deadman.deadmanActive(), true);

  // Force override without a written note is refused
  await assert.rejects(
    () => deadman.liftDeadman({ by: "stanley", force: "force", note: "   " }),
    /written note/,
  );
  assert.equal(deadman.deadmanActive(), true);

  // Force override WITH a written note succeeds and records the override
  const forceLifted = await deadman.liftDeadman({
    by: "stanley",
    force: "force",
    note: "Verified false alarm on phone",
  });
  assert.equal(forceLifted.active, false);
  assert.equal(forceLifted.forcedLift, true);
  assert.equal(forceLifted.liftNote, "Verified false alarm on phone");
  assert.equal(forceLifted.liftHistory[0]?.forced, true);
  assert.equal(forceLifted.liftHistory[0]?.note, "Verified false alarm on phone");

  // Department power buttons restored to Stanley's exact pre-incident state
  assert.equal(ai.isDeptOn("marketing"), true, "marketing stayed on");
  assert.equal(ai.isDeptOn("trust"), false, "trust returned to off");
  assert.equal(ai.isDeptOn("founder"), false, "founder returned to off");

  // Trip again and lift normally by completing all 5 checklist items
  await deadman.tripDeadman({ trigger: "manual", reason: "Checklist test" });
  await deadman.updateDeadmanChecklist(ALL_CHECKLIST_TRUE, { by: "stanley" });
  const cleanLift = await deadman.liftDeadman({ by: "stanley", note: "All 5 checks complete" });
  assert.equal(cleanLift.active, false);
  assert.equal(cleanLift.forcedLift, false);
});

test("deadman: wallet security notices (recovery, sign-out, PIN reset, lock-out) still go out during a lockdown; everything else is held", async () => {
  await resetDeadman();
  const w = await ywallet.createWallet({ pin: "482910", handle: "sec_mail_u" });
  const { emailPending } = await ywallet.setEmail(w.wallet, "owner@example.org", "https://altradits.test");
  assert.equal(emailPending, "owner@example.org");

  // Confirm the wallet's email before lockdown
  const confirmMailId = (await store.listIds("emails", 5))[0];
  const confirmMail = await store.getJSON(`email:${confirmMailId}`);
  // Extract token from ywec:* by setting w.email directly as confirmed for test
  const cur = await store.getJSON(`yw:${w.wallet.id}`);
  await store.setJSON(`yw:${w.wallet.id}`, { ...cur, email: "owner@example.org", emailPending: null, emailConfirmedAt: new Date().toISOString() });
  const emailHash = ywallet._internal.sha("owner@example.org");
  await store.setJSON(`yw:e:${emailHash}`, [w.wallet.id]);
  assert.ok(confirmMail);

  // Trip lockdown
  await deadman.tripDeadman({ trigger: "manual", reason: "Email gate test" });

  // 1. Non-security emails are HELD during lockdown
  const regularMail = await email.sendEmail({
    to: "client@example.org",
    subject: "Confirm your Ye₿ente email",
    text: "Confirm this address so you can log in.",
    kind: "wallet",
  });
  assert.equal(regularMail.status, "held: deadman lockdown");

  const loginCodeMail = await email.sendEmail({
    to: "owner@example.org",
    subject: "Your Ye₿ente login code",
    text: "Your Ye₿ente login code is 12345678.",
    kind: "wallet",
  });
  assert.equal(loginCodeMail.status, "held: deadman lockdown");

  // 2. Wallet security notices (recovery link, recovery completion / PIN reset / sign-out, wrong-PIN lock-out) GO OUT during lockdown
  await ywallet.requestEmailRecovery("owner@example.org", "https://altradits.test");
  // Wait a tick for fire-and-forget mail() in requestEmailRecovery
  await new Promise((r) => setTimeout(r, 30));
  const recentIds = await store.listIds("emails", 10);
  const recentMails = await store.getMany("email", recentIds);
  const recoveryMail = recentMails.find((m) => m.subject === "Recover your Ye₿ente wallet");
  assert.ok(recoveryMail, "recovery email recorded");
  assert.notEqual(recoveryMail.status, "held: deadman lockdown", "recovery email is NOT held during lockdown");
  assert.equal(recoveryMail.cta?.url, "(not stored)", "recovery link URL is never stored in log");

  // Recovery with recovery words (resets PIN, signs out other phones, sends warnOwner security notice)
  await ywallet.restoreWallet({ recovery: w.recovery, pin: "739204" });
  await new Promise((r) => setTimeout(r, 30));
  const afterRestoreMails = await store.getMany("email", await store.listIds("emails", 10));
  const restoreNotice = afterRestoreMails.find((m) => /recovered with its recovery words/i.test(m.subject));
  assert.ok(restoreNotice, "recovery words PIN-reset/sign-out notice recorded");
  assert.notEqual(restoreNotice.status, "held: deadman lockdown", "PIN-reset/sign-out notice goes out during lockdown");

  // Owner alert email also goes out
  const ownerMail = await email.emailOwner("Lockdown test update", "Owner alert goes through");
  assert.notEqual(ownerMail.status, "held: deadman lockdown");

  await resetDeadman();
});

test("deadman: freezes Ye₿ente outbound sends, transfers and quoteBuy, but startBuy still records a buy whose M-Pesa prompt was already sent", async () => {
  await resetDeadman();
  const alice = await ywallet.createWallet({ pin: "194827", handle: "dm_alice" });
  const bob = await ywallet.createWallet({ pin: "283910", handle: "dm_bob" });
  await ywallet.credit({ walletId: alice.wallet.id, sats: 20_000, kind: "receive", ref: "init-alice-1" });

  // Simulate a buy quote created BEFORE the lockdown (prompt is sent to phone)
  const inFlightQuote = { kes: 200, sats: 1_200, rate: 10_000_000, spreadPct: 0 };

  // Deadman's Switch trips while the M-Pesa prompt is in flight (between prompt and startBuy)
  await deadman.tripDeadman({ trigger: "manual", reason: "Mid-buy trip check" });

  // 1. startBuy MUST still record the buy whose prompt was already sent!
  await ywallet.startBuy(alice.wallet, inFlightQuote, "ws_CO_inflight_1");
  const recordedBuy = await store.getJSON("ywbuy:ws_CO_inflight_1");
  assert.equal(recordedBuy?.state, "pending", "in-flight buy recorded despite lockdown");
  assert.equal(recordedBuy?.sats, 1_200);

  // And when Safaricom confirms the payment, finishBuy credits the sats
  const buyState = await ywallet.finishBuy("ws_CO_inflight_1", { resultCode: 0, receipt: "QWE123RTY" });
  assert.equal(buyState, "paid");
  assert.equal((await ywallet.walletByHandle("dm_alice")).balance, 21_200);

  // 2. A new quoteBuy during lockdown is frozen (503) before any prompt is sent
  await assert.rejects(
    () => ywallet.quoteBuy(alice.wallet, 100),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );

  // 3. Internal transfer and outbound payOut are frozen (503)
  await assert.rejects(
    () => ywallet.transfer({ from: alice.wallet, toHandle: "dm_bob", sats: 1000, pin: "194827" }),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );
  await assert.rejects(
    () => ywallet.payOut({ from: alice.wallet, to: "dm_bob", sats: 1000, pin: "194827" }),
    (e) => e.status === 503 && /temporarily paused/i.test(e.message),
  );

  // 4. Receiving sats into a wallet stays LIVE during lockdown
  const credited = await ywallet.credit({ walletId: bob.wallet.id, sats: 5_000, kind: "receive", ref: "inbound-during-lockdown" });
  assert.equal(credited.wallet.balance, 5_000, "inbound receive credited normally during lockdown");

  await resetDeadman();
});

test("deadman: 100 wrong admin tokens and 100 wrong deploy secrets do NOT trip the switch; a successful admin sign-in from a new IP within an hour of a token-guessing burst DOES trip it", async () => {
  await resetDeadman();

  // Stanley signs in once from his normal IP (198.51.100.10) before any attack
  const knownHeaders = {
    Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
    "x-forwarded-for": "198.51.100.10",
  };
  const ok1 = await adminApi.GET(new Request("http://x/api/admin?view=emails", { headers: knownHeaders }));
  assert.equal(ok1.status, 200);
  assert.equal(deadman.deadmanActive(), false);

  // 100 wrong admin tokens across various connections
  for (let i = 1; i <= 100; i++) {
    const r = await adminApi.GET(new Request("http://x/api/admin", {
      headers: {
        Authorization: `Bearer wrong-token-${i}`,
        "x-forwarded-for": `203.0.113.${(i % 200) + 1}`,
      },
    }));
    assert.ok(r.status === 401 || r.status === 429);
  }
  assert.equal(deadman.deadmanActive(), false, "100 wrong admin tokens must NOT trip the Deadman's Switch");

  // 100 wrong deploy secrets
  for (let i = 1; i <= 100; i++) {
    const r = await deployApi.POST(new Request("http://x/api/deploy", {
      method: "POST",
      headers: { "x-deploy-secret": `wrong-secret-${i}` },
    }));
    assert.equal(r.status, 403);
  }
  assert.equal(deadman.deadmanActive(), false, "100 wrong deploy secrets must NOT trip the Deadman's Switch");

  // Passkey forgery and PIN guessing attempts also do NOT trip the Deadman's Switch
  for (let i = 1; i <= 20; i++) {
    await attacks.recordAttack("passkey_forgery", { where: `wallet ${i}`, ip: `30.${i}` });
    await attacks.recordAttack("pin_guessing", { where: `wallet ${i}`, ip: `50.${i}` });
  }
  assert.equal(deadman.deadmanActive(), false, "failed passkey/PIN attempts must NOT trip the Deadman's Switch");

  // Stanley signing in from his KNOWN IP (198.51.100.10) after the guessing burst does NOT trip it
  const okKnown = await adminApi.GET(new Request("http://x/api/admin?view=emails", { headers: knownHeaders }));
  assert.equal(okKnown.status, 200);
  assert.equal(deadman.deadmanActive(), false, "sign-in from known IP after burst does not trip");

  // A successful admin sign-in from a NEW IP (192.0.2.99) within an hour of the token-guessing burst TRIPS it!
  const newIpHeaders = {
    Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
    "x-forwarded-for": "192.0.2.99",
  };
  await adminApi.GET(new Request("http://x/api/admin?view=emails", { headers: newIpHeaders }));
  assert.equal(deadman.deadmanActive(), true, "successful admin sign-in from a new IP after a token-guessing burst trips Deadman's Switch");
  assert.equal(deadman.deadmanStatus().trigger, "admin_compromise");

  await resetDeadman();
});

test("deadman: custodial solvency shortfall stays an alert, while an unexplained node balance drop trips", async () => {
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

  await resetDeadman();
});

test("deadman: file integrity ignores clean deploys and DirectAdmin Passenger block edits in .htaccess, trips on tampering, and runs via 5-minute runDeadmanChecks", async () => {
  await resetDeadman();

  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-gitcheck-"));
  fs.mkdirSync(path.join(repoDir, "lib"), { recursive: true });
  const baseHtaccess =
    `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN\n` +
    `PassengerAppRoot "/home/altradit/domains/altradits.com/public_html"\n` +
    `PassengerBaseURI "/"\n` +
    `PassengerNodejs "/home/altradit/nodevenv/domains/altradits.com/public_html/24/bin/node"\n` +
    `PassengerAppType node\n` +
    `PassengerStartupFile app.cjs\n` +
    `PassengerAppLogFile "/home/altradit/logs/passenger.log"\n` +
    `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END\n` +
    `<FilesMatch "^(server\\.mjs)$">\nRequire all denied\n</FilesMatch>\n`;
  fs.writeFileSync(path.join(repoDir, ".htaccess"), baseHtaccess);
  fs.writeFileSync(path.join(repoDir, "lib", ".htaccess"), "Require all denied\n");
  fs.writeFileSync(path.join(repoDir, "server.mjs"), "export const v = 1;\n");

  execFileSync("git", ["init", "-q"], { cwd: repoDir });
  execFileSync("git", ["add", ".htaccess", "lib/.htaccess", "server.mjs"], { cwd: repoDir });
  execFileSync("git", ["-c", "user.name=altradits", "-c", "user.email=altradits@gmail.com", "commit", "-q", "-m", "Initial"], { cwd: repoDir });

  // 1. Scheduled 5-minute check (runDeadmanChecks) runs both checkFileIntegrity and checkNodeBalance
  const run1 = await deadman.runDeadmanChecks({ rootDir: repoDir, totalSats: 80_000 });
  assert.equal(run1.skipped, false);
  assert.equal(run1.files.ok, true);
  assert.equal(run1.balance.ok, true);
  assert.equal(deadman.deadmanActive(), false);

  // Calling again inside the 5-minute window is throttled unless force: true
  const throttled = await deadman.runDeadmanChecks({ rootDir: repoDir, totalSats: 80_000 });
  assert.equal(throttled.skipped, true);

  // 2. Simulate DirectAdmin rewriting the CloudLinux Passenger block (and adding CLOUDLINUX ENV VARS) in .htaccess
  const directAdminHtaccess =
    `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN\n` +
    `PassengerAppRoot "/home/altradit/domains/altradits.com/public_html"\n` +
    `PassengerBaseURI "/"\n` +
    `PassengerNodejs "/home/altradit/nodevenv/domains/altradits.com/public_html/22/bin/node"\n` +
    `PassengerAppType node\n` +
    `PassengerStartupFile app.cjs\n` +
    `PassengerAppLogFile "/home/altradit/logs/passenger.log"\n` +
    `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END\n` +
    `<FilesMatch "^(server\\.mjs)$">\nRequire all denied\n</FilesMatch>\n` +
    `# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION BEGIN\n` +
    `<IfModule Litespeed>\n` +
    `SetEnv NODE_ENV production\n` +
    `</IfModule>\n` +
    `# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION END\n`;
  fs.writeFileSync(path.join(repoDir, ".htaccess"), directAdminHtaccess);

  // Confirm git sees .htaccess as modified on disk
  const gitDirty = execFileSync("git", ["status", "--porcelain", "--", ".htaccess"], { cwd: repoDir, encoding: "utf8" }).trim();
  assert.equal(gitDirty, "M .htaccess");

  // Yet checkFileIntegrity ignores the DirectAdmin Passenger block change!
  const afterDirectAdmin = await deadman.runDeadmanChecks({ rootDir: repoDir, force: true });
  assert.equal(afterDirectAdmin.files.ok, true, "DirectAdmin Passenger block changes in .htaccess must not trip file integrity");
  assert.equal(deadman.deadmanActive(), false);

  // 3. Simulate a deploy of a merged main commit (files change AND git HEAD advances)
  fs.writeFileSync(path.join(repoDir, ".htaccess"), baseHtaccess);
  fs.writeFileSync(path.join(repoDir, "server.mjs"), "export const v = 2;\n");
  execFileSync("git", ["add", ".htaccess", "server.mjs"], { cwd: repoDir });
  execFileSync("git", ["-c", "user.name=altradits", "-c", "user.email=altradits@gmail.com", "commit", "-q", "-m", "Merged deploy"], { cwd: repoDir });

  const afterDeploy = await deadman.runDeadmanChecks({ rootDir: repoDir, force: true });
  assert.equal(afterDeploy.files.ok, true, "clean deploy of a merged commit never trips file integrity");
  assert.equal(deadman.deadmanActive(), false);

  // 4. Simulate an attacker smuggling a non-Passenger rule inside the CloudLinux Passenger markers
  const smuggledHtaccess = baseHtaccess.replace(
    "PassengerAppType node",
    "PassengerAppType node\nRequire all granted",
  );
  fs.writeFileSync(path.join(repoDir, ".htaccess"), smuggledHtaccess);
  const smuggled = await deadman.runDeadmanChecks({ rootDir: repoDir, force: true });
  assert.equal(smuggled.files.ok, false, "smuggled directive inside Passenger block trips file_tampering");
  assert.equal(deadman.deadmanActive(), true);
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

  // Lift via /api/admin POST without checklist fails (400)
  const badLiftRes = await adminApi.POST(new Request("http://x/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "deadman_lift", note: "Missing checklist" }),
  }));
  assert.equal(badLiftRes.status, 400);

  // Lift via /api/admin POST with full checklist succeeds
  const liftRes = await adminApi.POST(new Request("http://x/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "deadman_lift", note: "Admin API lift", checklist: ALL_CHECKLIST_TRUE }),
  }));
  assert.equal(liftRes.status, 200);
  assert.equal((await liftRes.json()).active, false);
});
