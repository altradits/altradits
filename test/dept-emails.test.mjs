// Department senders: every owner alert comes from the department it belongs
// to, with or without AI. Fake mailer, fake IMAP and fake LND only: no real
// email goes out and no real AI is called. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dept-emails-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "META_MODEL_API_KEY", "AI_PROVIDER", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL",
  "SMTP_HOST", "LND_REST_URL", "LND_INVOICE_MACAROON", "WORKER_CALLS_PER_DAY", "AI_MONTHLY_USD_CAP", "DEADMAN_INCIDENT_USD_CAP", "EMAIL_TRANSPORT"]) delete process.env[k];
for (const k of Object.keys(process.env)) if (k.startsWith("MAIL_")) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";
process.env.SITE_URL = "https://altradits.test";
process.env.BACKUP_DIR = path.join(tmp, "backups");
process.env.BACKUP_KEY = "test-backup-passphrase";

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ai = await import("../lib/ai.js");
const deadman = await import("../lib/deadman.js");
const attacks = await import("../lib/attacks.js");
const { holdIfUnsafe } = await import("../lib/screen.js");
const ops = await import("../lib/ops.js");
const workers = await import("../lib/workers.js");

const sent = [];
email.setMailer({ sendMail: async (m) => { sent.push(m); return { messageId: "x" }; } });
await deadman.liftDeadman({ by: "stanley", force: true, note: "test isolation" }).catch(() => {});

const toOwner = () => sent.filter((m) => m.to === email.OWNER_EMAIL);
const lastToOwner = (re) => toOwner().filter((m) => re.test(m.subject)).at(-1);
async function logRow(re) {
  return (await store.getMany("email", await store.listIds("emails", 60))).find((m) => re.test(m.subject));
}
const CHECKLIST = { attackStopped15m: true, solvencyConfirmed: true, forensicBackupSaved: true, secretsRotatedIfNeeded: true, stanleyConfirmed: true };

test("trust sends Deadman trip, all-clear and hourly update", async () => {
  await deadman.tripDeadman({ trigger: "manual", reason: "Sender test trip" });
  assert.equal(deadman.deadmanActive(), true);
  const trip = lastToOwner(/DEADMAN TRIPPED/);
  assert.match(trip.from, /trust@altradits\.com/);
  assert.equal(trip.replyTo, "trust@altradits.com");
  assert.match(trip.html, /Catherine Haile/);
  assert.match(trip.text, /Catherine Haile/);

  const hourly = await deadman.sendIncidentHourlyUpdate({ force: true });
  assert.equal(hourly.sent, true);
  assert.match(lastToOwner(/DEADMAN UPDATE/).from, /trust@altradits\.com/);

  await deadman.updateDeadmanChecklist(CHECKLIST, { by: "stanley" });
  await deadman.liftDeadman({ by: "stanley", note: "Sender test done" });
  assert.equal(deadman.deadmanActive(), false);
  assert.match(lastToOwner(/All-clear/).from, /trust@altradits\.com/);
});

test("trust sends the security watch, security holds and admin-token bursts", async () => {
  await attacks.recordAttack("ssrf", { where: "/api/x", detail: "private address refused" });
  const watch = lastToOwner(/Security watch: Server-side request forgery/);
  assert.match(watch.from, /trust@altradits\.com/);
  assert.equal(watch.replyTo, "trust@altradits.com");

  const t = { id: "hold1", title: "Tidy the sheet", status: "queued", client: "Stanley", history: [] };
  assert.equal(await holdIfUnsafe(t, "See http://evil.example/x for the numbers", "task answer", async () => {}), true);
  assert.equal(t.status, "held");
  assert.match(lastToOwner(/Security hold: task answer/).from, /trust@altradits\.com/);

  const admin = await import("../api/admin.js");
  for (let i = 1; i <= 100; i++) {
    await admin.GET(new Request("http://x/api/admin", {
      headers: { Authorization: `Bearer [REDACTED]${i}`, "x-forwarded-for": `203.0.113.${(i % 200) + 1}` },
    }));
  }
  const burst = lastToOwner(/Many wrong admin tokens/);
  assert.ok(burst, "the burst alert went out");
  assert.match(burst.from, /trust@altradits\.com/);
});

test("tech sends node alerts and the bounce digest", async () => {
  // No node for this test (the contact test below brings its own fake LND).
  const savedLnd = { url: process.env.LND_REST_URL, mac: process.env.LND_INVOICE_MACAROON, cert: process.env.LND_TLS_CERT };
  delete process.env.LND_REST_URL;
  delete process.env.LND_INVOICE_MACAROON;
  delete process.env.LND_TLS_CERT;
  try {
    const { watchChannels } = await import("../lib/channels.js");
    const w = await watchChannels();
    assert.equal(w.emailed, 1, "the unreadable node alerts once");
    assert.match(lastToOwner(/Lightning: /).from, /tech@altradits\.com/);
  } finally {
    if (savedLnd.url) process.env.LND_REST_URL = savedLnd.url;
    if (savedLnd.mac) process.env.LND_INVOICE_MACAROON = savedLnd.mac;
    if (savedLnd.cert) process.env.LND_TLS_CERT = savedLnd.cert;
  }

  const { setImapFactory, checkBounces } = await import("../lib/bounces.js");
  process.env.MAIL_TECH = "tech-mailbox-password";
  const first = await email.sendEmail({ to: "cara@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  assert.equal(first.status, "sent");
  const when = new Date(Date.now() + 30e3);
  setImapFactory(() => ({
    async connect() {},
    async getMailboxLock() { return { release() {} }; },
    async search() { return [7]; },
    async *fetch() { yield { uid: 7, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } }; },
    async fetchOne() {
      return { source: Buffer.from(`From: Mail Delivery System <Mailer-Daemon@mail.altradits.com>\r\nTo: tech@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;cara@shop.co\r\nDiagnostic-Code: smtp; 550 No such user.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: cara@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: ${first.messageId}\r\n\r\nHi\r\n`) };
    },
    async logout() {},
  }));
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 1 });
  const digest = lastToOwner(/1 email bounced/);
  assert.match(digest.from, /tech@altradits\.com/);
  assert.equal(digest.replyTo, "tech@altradits.com");
  delete process.env.MAIL_TECH;
});

test("tasks write from their own department: handover, rating, draft to Stanley", async () => {
  const t = await ops.createTask({ title: "Book the seminar room", details: "Friday afternoon", department: "personal", trustedInternal: true });
  await ops.notifyClient(t, "Quick question", "Which Friday did you mean?");
  const note = lastToOwner(/Quick question/);
  assert.match(note.from, /assistant@altradits\.com/);
  assert.equal(note.replyTo, "assistant@altradits.com");
  assert.match(note.html, /Faith Achieng/);

  await ops.approveTask(t.id, { rating: 2, comment: "too slow", by: "someone" });
  assert.match(lastToOwner(/Unhappy rating/).from, /assistant@altradits\.com/);

  await store.setJSON("stan:draft:d1", { id: "d1", to: email.OWNER_EMAIL, dept: "growth", subject: "Note for Stanley", text: "plain words", status: "pending_approval" });
  await store.pushId("approvalq", "d1");
  const { decideDraft } = await import("../lib/stan.js");
  await decideDraft("d1", { approve: true, by: "stanley" });
  assert.match(lastToOwner(/Note for Stanley/).from, /care@altradits\.com/);
});

test("combined reports stay with Stan: overdue digest and weekly learning digest", async () => {
  await ops.createTask({ title: "File the grant report", details: "End of month", department: "admin", due: "2020-01-01", trustedInternal: true });
  const n = await ops.overdueDigest();
  assert.ok(n >= 1);
  assert.match(lastToOwner(/overdue/).from, /^Stan · Altradits </);

  const { runLearningCadence } = await import("../lib/learning.js");
  await runLearningCadence(new Date("2026-11-02T08:00:00Z"), { forceWeekly: true });
  assert.match(lastToOwner(/Weekly learning/).from, /^Stan · Altradits </);
});

// --- contact notices: fake LND, invoices only --------------------------------
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const invoices = new Map();
let lnd;
before(async () => {
  lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/invoices") {
        const { value } = JSON.parse(body);
        const hash = Buffer.from(String(invoices.size + 1).padStart(32, "0"));
        invoices.set(hash.toString("hex"), { state: "OPEN", value });
        res.end(JSON.stringify({ r_hash: hash.toString("base64"), payment_request: `lnbc${value}0n1fake${invoices.size}` }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/balance/channels") { res.end(JSON.stringify({ remote_balance: { sat: "1000000" } })); return; }
      const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
      if (req.method === "GET" && m && invoices.has(m[1])) { res.end(JSON.stringify(invoices.get(m[1]))); return; }
      res.writeHead(404).end(JSON.stringify({ message: "not found" }));
    });
  });
  await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: "0201036c6e64", LND_TLS_CERT: fs.readFileSync("cert.pem", "utf8") });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => String(u).includes("coinbase")
    ? Promise.resolve({ json: async () => ({ data: { amount: "100000" } }) })
    : realFetch(u, o);
});
after(async () => { await new Promise((r) => lnd.close(r)); });

test("contact notices come from the routed department and answer to the visitor", async () => {
  const contact = await import("../api/contact.js");
  const post = (body, ip) => contact.POST(new Request("https://altradits.test/api/contact",
    { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
  for (const [topic, addr, head, ip] of [["funding", "admin@altradits.com", "Daniel Tesfaye", "10.1.0.1"], ["safety", "trust@altradits.com", "Catherine Haile", "10.1.0.2"]]) {
    const q = await (await post({ step: "quote" }, ip)).json();
    invoices.set(q.hash, { ...invoices.get(q.hash), state: "SETTLED" });
    const r = await post({ step: "send", hash: q.hash, name: "Jo", email: "jo@example.com", topic, message: "A proper message with enough words to pass." }, ip);
    assert.equal(r.status, 200);
    const notice = lastToOwner(new RegExp(`Contact: .* from Jo`));
    assert.match(notice.from, new RegExp(addr.replace(".", "\\.")));
    assert.equal(notice.replyTo, "jo@example.com", "Stanley answers the visitor in one click");
    assert.match(notice.html, new RegExp(head));
  }
});

test("lockdown: a department-sent owner alert still goes out, wallet mail still held", async () => {
  await deadman.tripDeadman({ trigger: "manual", reason: "Lockdown sender test" });
  try {
    const trip = await logRow(/DEADMAN TRIPPED/);
    assert.equal(trip.status, "sent");
    assert.match(trip.from, /trust@altradits\.com/);

    const deptAlert = await email.emailOwner("dept check", "tech wrote this", null, "tech");
    assert.equal(deptAlert.status, "sent");
    assert.match(deptAlert.from, /tech@altradits\.com/);

    await attacks.recordAttack("invoice_substitution", { where: "lnaddr", detail: "amount differed" });
    assert.equal((await logRow(/Security watch: Invoice substitution/)).status, "sent");

    const held = await email.sendEmail({ to: "w@example.com", subject: "Your Ye₿ente login code", text: "code 1234", kind: "wallet" });
    assert.equal(held.status, "held: deadman lockdown");
  } finally {
    await deadman.updateDeadmanChecklist(CHECKLIST, { by: "stanley" });
    await deadman.liftDeadman({ by: "stanley", note: "Lockdown sender test done" });
  }
  assert.equal(deadman.deadmanActive(), false);
});

test("no AI in the path: identical mail with keys absent, AI paused, budgets out, power off", async () => {
  const t = await ops.createTask({ title: "Check the node", details: "Read-only", department: "tech", trustedInternal: true });
  const snap = async () => {
    await ops.notifyClient(t, "Ready check", "Same words every time.");
    const { from, to, subject, replyTo, text, html } = toOwner().at(-1);
    return { from, to, subject, replyTo, text, html };
  };
  const resetAiState = () => { try { fs.unlinkSync(path.join(tmp, ".data", "ai-state.json")); } catch {} };

  delete process.env.ANTHROPIC_API_KEY;
  resetAiState();
  assert.equal(ai.providerKeyPresent(), false);
  const noKeys = await snap();
  assert.match(noKeys.from, /tech@altradits\.com/);

  process.env.ANTHROPIC_API_KEY = "[REDACTED]";
  ai.noteAiError({ status: 402, message: "credit balance is too low" });
  assert.equal(ai.aiPaused(), true, "AI is paused on credit exhaustion");
  assert.deepEqual(await snap(), noKeys, "paused AI sends identically");
  ai.resumeAi();

  ai.recordDeptUsage("tech", { calls: 2, usd: 10.00 });
  assert.equal(ai.aiStatus().kind, "monthly_cap", "the monthly budget is exhausted");
  assert.equal(ai.aiPaused(), true);
  assert.deepEqual(await snap(), noKeys, "exhausted budgets send identically");
  resetAiState();
  delete process.env.ANTHROPIC_API_KEY;

  ai.setAllDeptPower(false, { by: "stanley" });
  assert.equal(ai.isDeptOn("tech"), false);
  assert.deepEqual(await snap(), noKeys, "a department switched off still sends its mail");
  ai.setDeptPower("tech", true, { by: "stanley" });
  assert.deepEqual(await snap(), noKeys, "power on sends the same too");
  ai.setAllDeptPower(false, { by: "stanley" });
});

test("agent errors say plain words from the failing department, never stacks or secrets", () => {
  const nasty = "fetch failed: connect ECONNREFUSED 169.254.169.254:443 with token tok_ABCDEF1234567890\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1234:16)";
  for (const [err, says] of [
    [new Error(nasty), "could not reach the AI service"],
    [new Error("Your credit balance is too low (402)"), "credit or the rate limit"],
    [Object.assign(new Error("x"), { kind: "daily_limit" }), "credit or the rate limit"],
    [new Error("401 invalid x-api-key"), "Check the API key"],
    [new Error("stopped at max_tokens"), "did not finish"],
    [new Error("something odd"), "unexpected error"],
  ]) {
    const words = workers.describeAgentError(err);
    assert.match(words, new RegExp(says));
    for (const leak of ["169.254.169.254", "tok_ABCDEF1234567890", "at TCPConnectWrap", "node:net", "sk-ant", "Bearer [REDACTED]"]) {
      assert.ok(!words.includes(leak), `no leak of ${leak}`);
    }
  }
});

test("a failing agent emails plain words from its own department", async () => {
  const t = await ops.createTask({ title: "Draft the note", details: "Plain brief", department: "tech", trustedInternal: true });
  const nasty = "fetch failed: connect ECONNREFUSED 169.254.169.254:443 with token tok_ABCDEF1234567890\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1234:16)";
  const QA_TOOLS = ["qa_plan", "area_verdict", "stan_decision"];
  workers.setWorkerClient({
    messages: {
      create: async (p) => {
        if ((p.tools || []).some((x) => QA_TOOLS.includes(x.name))) {
          const ids = [...p.messages[0].content.matchAll(/^- ([a-z-]+): /gm)].map((m) => m[1]);
          return { model: "x", stop_reason: "tool_use", content: [{ type: "tool_use", id: "q", name: "qa_plan", input: { areas: ids.map((id) => ({ id, criteria: [`${id} criterion`] })) } }], usage: {} };
        }
        throw new Error(nasty);
      },
    },
  });
  ai.setDeptPower("tech", true, { by: "stanley" });
  try {
    await workers.processTask(t.id);
    const done = await ops.getTask(t.id);
    assert.equal(done.status, "owner");
    const mail = lastToOwner(/Task needs you: Draft the note/);
    assert.match(mail.from, /tech@altradits\.com/);
    assert.match(mail.text, /The AI agent hit an error/);
    assert.match(mail.text, /could not reach the AI service/);
    for (const leak of ["169.254.169.254", "tok_ABCDEF1234567890", "at TCPConnectWrap"]) {
      assert.ok(!mail.text.includes(leak) && !mail.html.includes(leak), `no leak of ${leak}`);
    }
    const row = await logRow(/Task needs you: Draft the note/);
    assert.equal(row.kind, "owner");
    assert.match(row.from, /tech@altradits\.com/);
  } finally {
    workers.setWorkerClient(null);
    ai.setAllDeptPower(false, { by: "stanley" });
  }
});

test("every owner alert names a real department address", () => {
  const known = ["hello@altradits.com", "stan@altradits.com", "social@altradits.com", "admin@altradits.com",
    "assistant@altradits.com", "care@altradits.com", "tech@altradits.com", "orders@altradits.com",
    "finance@altradits.com", "trust@altradits.com", "marketing@altradits.com"];
  assert.ok(toOwner().length > 10, "this file sent owner mail");
  for (const m of toOwner()) {
    const addr = (m.from.match(/<([^<>]+)>/) || [])[1];
    assert.ok(addr && known.includes(addr), `known department address: ${m.from}`);
  }
});
