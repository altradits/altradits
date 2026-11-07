// Leads: the free /start form, source tracking, scoring, the admin pipeline,
// kTown matching and the daily digest. No node, no mail transport: the email
// log records what would have gone out.
// Run: node --test test/leads.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-leads-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "SMTP_HOST", "KTOWN", "KTOWN_MAX_MERCHANTS"]) delete process.env[k];
Object.assign(process.env, { ADMIN_TOKEN: "secret-admin", KTOWN: "on", KTOWN_MAX_MERCHANTS: "100", SITE_URL: "https://altradits.test" });
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const api = await import(`${ROOT}/api/leads.js`);
const leads = await import(`${ROOT}/lib/leads.js`);
const admin = await import(`${ROOT}/api/admin.js`);
const kt = await import(`${ROOT}/lib/ktown.js`);
const ktApi = await import(`${ROOT}/api/ktown.js`);
const { getJSON, setJSON, listIds } = await import(`${ROOT}/lib/store.js`);

// Tando answers quotes only: enough to register merchants for matching tests.
kt.setKtownFetcher(async (raw) => {
  const u = new URL(String(raw));
  const pay = u.pathname.match(/^\/\.well-known\/lnurlp\/(\d+)$/);
  if (pay && u.searchParams.get("amount") === null)
    return new Response(JSON.stringify({ tag: "payRequest", callback: `https://bitcoin.co.ke/.well-known/lnurlp/${pay[1]}`,
      minSendable: 150000, maxSendable: 500000000, metadata: "[]",
      currency: { code: "KES", name: "Kenyan Shillings", symbol: "KSh", decimals: 0, minSendable: 15, maxSendable: 50000, multiplier: 10000 } }),
    { headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ status: "ERROR", reason: "Unknown." }), { status: 404, headers: { "Content-Type": "application/json" } });
});

let n = 0;
const ip = () => `10.8.0.${(n++ % 200) + 1}`;
const req = (body, a = ip()) => new Request("https://altradits.test/api/leads",
  { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": a }, body: JSON.stringify(body) });
const adminGet = (view) => new Request(`https://altradits.test/api/admin?view=${view}`, { headers: { Authorization: "Bearer secret-admin" } });
const adminPost = (body, token = "secret-admin") => new Request("https://altradits.test/api/admin",
  { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const form = (over = {}) => ({ name: "Achieng Shop", phone: "0707172370", email: "", segment: "shop",
  answers: { shopType: "kiosk", area: "Kondele, Kisumu", demand: "yes", smartphone: "yes" },
  message: "", consent: true, lang: "en", source: { ref: "li", utm_campaign: "journey-1" },
  startedAt: Date.now() - 8000, company: "", ...over });

test("a shop lead is stored with its score, reasons, source and timeline", async () => {
  const r = await api.POST(req(form()));
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const m = await getJSON(`lead:${id}`);
  assert.equal(m.segment, "shop");
  assert.equal(m.stage, "new");
  assert.equal(m.score, 90); // 30 Kisumu + 30 demand + 20 smartphone + 10 tracked
  assert.deepEqual(m.reasons.map((x) => x.points), [30, 30, 20, 10]);
  assert.equal(m.source.ref, "li");
  assert.equal(m.source.utm_campaign, "journey-1");
  assert.equal(m.consent.version, "dpa-ke-2019-v1");
  assert.equal(m.timeline.length, 1);
  assert.equal(m.timeline[0].by, "visitor");
  assert.ok((await listIds("leads", 10)).includes(id));
});

test("a new lead emails Stanley from the segment's department", async () => {
  const before = await listIds("emails", 50);
  const r = await api.POST(req(form({ segment: "developer", name: "A Dev",
    answers: { building: "A till app", volume: "mid", timeline: "months" }, email: "5tan@altradits.com", source: {} })));
  assert.equal(r.status, 200);
  const fresh = (await listIds("emails", 50)).filter((id) => !before.includes(id));
  assert.equal(fresh.length, 1);
  const mail = await getJSON(`email:${fresh[0]}`);
  assert.equal(mail.kind, "owner");
  assert.match(mail.from, /tech@altradits\.com/); // developers belong to tech
  assert.match(mail.subject, /new developer lead/i);
  assert.ok(mail.cta.url.endsWith("/admin#leads"));
});

test("validation refuses bad forms with plain words", async () => {
  for (const [over, want] of [
    [{ segment: "alien" }, "Pick what best describes you."],
    [{ phone: "", email: "" }, "Give a phone number or an email address"],
    [{ email: "not-an-email" }, "That email address does not look right."],
    [{ consent: false }, "Tick the consent line"],
    [{ startedAt: Date.now() }, "take a moment"],
    [{ startedAt: 0 }, "take a moment"],
    [{ answers: { shopType: "kiosk", area: "", demand: "yes", smartphone: "yes" } }, "The area in Kisumu is needed."],
  ]) {
    const r = await api.POST(req(form(over)));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.match((await r.json()).error, new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the honeypot answers like a success but stores nothing", async () => {
  const before = await listIds("leads", 500);
  const r = await api.POST(req(form({ company: "Cheap Loans Ltd", name: "Bot" })));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.deepEqual(await listIds("leads", 500), before);
});

test("per-IP and global rate limits hold", async () => {
  const a = ip();
  for (let i = 0; i < 10; i++) assert.equal((await api.POST(req(form({ phone: `07000000${String(i).padStart(2, "0")}` }), a))).status, 200);
  assert.equal((await api.POST(req(form({ phone: "0700000099" }), a))).status, 429);
});

test("scoring is explainable per segment", () => {
  const s = (seg, a, x) => leads.scoreLead(seg, a, x);
  assert.deepEqual(s("shop", { area: "Milimani", demand: "yes", smartphone: "yes" }, { bothContacts: true, isTracked: true }),
    { score: 100, reasons: [{ points: 30, text: "Shop is in Kisumu, so a visit is easy" }, { points: 30, text: "Customers already ask to pay by phone" },
      { points: 20, text: "A smartphone sits on the till" }, { points: 10, text: "Gave phone and email" }, { points: 10, text: "Came from a tracked post" }] });
  assert.equal(s("shop", { area: "Nairobi CBD", demand: "no", smartphone: "no" }, {}).score, 0);
  assert.equal(s("partner", { org: "BitDevs", support: "Seminars", timeline: "now" }, { bothContacts: true, isTracked: true }).score, 100);
  assert.equal(s("partner", { org: "X", support: "Y", timeline: "later" }, {}).score, 65);
  assert.equal(s("developer", { building: "App", volume: "vhigh", timeline: "now" }, { bothContacts: true, isTracked: true }).score, 100);
  assert.equal(s("developer", { building: "App", volume: "mid", timeline: "months" }, {}).score, 65);
  assert.equal(s("learner", { level: "building", attend: "yes" }, { bothContacts: true, isTracked: true, hasMessage: true }).score, 100);
  assert.equal(s("learner", { level: "never", attend: "no" }, {}).score, 10);
});

test("hostile words put the lead on hold and reach Stanley defanged", async () => {
  const before = await listIds("emails", 50);
  const r = await api.POST(req(form({ name: "Mallory", message: "See http://evil.test/x for free sats" })));
  assert.equal(r.status, 200);
  const m = await getJSON(`lead:${(await r.json()).id}`);
  assert.deepEqual(m.held.reasons, ["link"]);
  assert.equal(m.timeline.length, 2);
  const fresh = (await listIds("emails", 50)).filter((id) => !before.includes(id));
  const mail = await getJSON(`email:${fresh[0]}`);
  assert.match(mail.text, /SECURITY HOLD/);
  assert.doesNotMatch(mail.text, /http:\/\/evil\.test/);
  const { securityView } = await import(`${ROOT}/lib/attacks.js`);
  assert.ok(JSON.stringify(await securityView()).includes("lead "), "the hold is recorded in the Security watch");
});

test("admin: the pipeline view needs the token and lists leads with numbers", async () => {
  assert.equal((await admin.GET(new Request("https://altradits.test/api/admin?view=leads"))).status, 401);
  const v = await (await admin.GET(adminGet("leads"))).json();
  assert.ok(v.stages.length === 7 && v.leads.length >= 3);
  assert.ok(v.stats.bySegment.shop >= 1 && v.stats.bySource.li >= 1);
  assert.equal(typeof v.stats.wonThisWeek, "number");
});

test("admin: stages move with a timeline, Lost needs a reason, Won stamps the week", async () => {
  const { id } = await (await api.POST(req(form({ phone: "0711000001" })))).json();
  const bad = await admin.POST(adminPost({ action: "lead_stage", id, stage: "lost" }));
  assert.equal(bad.status, 400);
  const r = await admin.POST(adminPost({ action: "lead_stage", id, stage: "qualified", note: "Called, keen." }));
  assert.equal(r.status, 200);
  let m = await getJSON(`lead:${id}`);
  assert.equal(m.stage, "qualified");
  assert.equal(m.notes.length, 1);
  assert.ok(m.timeline.some((e) => e.text.startsWith("Stage: New to Qualified")));
  await admin.POST(adminPost({ action: "lead_stage", id, stage: "won" }));
  m = await getJSON(`lead:${id}`);
  assert.ok(m.wonAt);
  const v = await (await admin.GET(adminGet("leads"))).json();
  assert.ok(v.stats.wonThisWeek >= 1 && v.stats.byStage.won >= 1);
  await admin.POST(adminPost({ action: "lead_stage", id, stage: "lost", reason: "Shop closed." }));
  m = await getJSON(`lead:${id}`);
  assert.equal(m.stage, "lost");
  assert.equal(m.lostReason, "Shop closed.");
  assert.equal(m.wonAt, null);
});

test("admin: notes, next steps, amounts and archive round-trip", async () => {
  const { id } = await (await api.POST(req(form({ segment: "partner", name: "A Partner", answers: { org: "Org", support: "Seminars", timeline: "now" } })))).json();
  await admin.POST(adminPost({ action: "lead_note", id, text: "Met at BitDevs." }));
  await admin.POST(adminPost({ action: "lead_next", id, text: "Send the one-pager", due: "2026-11-20" }));
  await admin.POST(adminPost({ action: "lead_amount", id, amount: "KSh 50,000 for Q1 seminars" }));
  let m = await getJSON(`lead:${id}`);
  assert.equal(m.notes[0].text, "Met at BitDevs.");
  assert.deepEqual(m.next, { text: "Send the one-pager", due: "2026-11-20" });
  assert.equal(m.links.amount, "KSh 50,000 for Q1 seminars");
  const bad = await admin.POST(adminPost({ action: "lead_next", id, text: "X", due: "20 Nov" }));
  assert.equal(bad.status, 400);
  await admin.POST(adminPost({ action: "lead_archive", id, archived: true }));
  assert.equal((await getJSON(`lead:${id}`)).archived, true);
});

test("kTown registration keeps its source, and a matching shop lead offers it as a candidate", async () => {
  const post = (p, b) => ktApi.POST(new Request(`https://altradits.test/api/ktown/${p}`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(b) }));
  const reg = await post("register", { agree: true, phone: "0722333444", shop: "Candidate Shop", mpesaName: "CANDIDATE SHOP", pin: "715293", source: { ref: "x", utm_campaign: "journey-2" } });
  assert.equal(reg.status, 200, JSON.stringify(await reg.clone().json()));
  const merchant = (await reg.json()).merchant;
  assert.deepEqual((await getJSON(`kt:${merchant.id}`)).source, { ref: "x", utm_source: null, utm_medium: null, utm_campaign: "journey-2" });
  const { id } = await (await api.POST(req(form({ phone: "0722333444" })))).json();
  const v = await (await admin.GET(adminGet("leads"))).json();
  const row = v.leads.find((l) => l.id === id);
  assert.equal(row.candidates.ktown.id, merchant.id);
  const link = await admin.POST(adminPost({ action: "lead_link", id, kind: "ktown", target: merchant.id }));
  assert.equal(link.status, 200);
  const after = await (await admin.GET(adminGet("leads"))).json();
  const linked = after.leads.find((l) => l.id === id);
  assert.equal(linked.linked.ktown.shop, "Candidate Shop");
  assert.equal(linked.firstPayment, null, "no payment has landed yet");
  assert.equal((await admin.POST(adminPost({ action: "lead_link", id, kind: "ktown", target: "nope00" }))).status, 404);
});

test("a linked shop shows its first payment when one lands", async () => {
  const post = (p, b) => ktApi.POST(new Request(`https://altradits.test/api/ktown/${p}`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(b) }));
  const merchant = (await (await post("register", { agree: true, phone: "0733444555", shop: "Paid Shop", mpesaName: "PAID SHOP", pin: "715293" })).json()).merchant;
  const { id } = await (await api.POST(req(form({ phone: "0733444555" })))).json();
  await admin.POST(adminPost({ action: "lead_link", id, kind: "ktown", target: merchant.id }));
  await setJSON("kte:e1", { id: "e1", merchantId: merchant.id, status: "completed", kesExpected: 100, kesReceived: 100, sats: 999, at: "2026-11-05T10:00:00.000Z", confirmedAt: "2026-11-05T10:01:00.000Z" });
  await setJSON("kte:e2", { id: "e2", merchantId: merchant.id, status: "completed", kesExpected: 50, kesReceived: 50, sats: 400, at: "2026-11-04T10:00:00.000Z", confirmedAt: "2026-11-04T10:01:00.000Z" });
  const { pushId } = await import(`${ROOT}/lib/store.js`);
  await pushId(`kt:tx:${merchant.id}`, "e1");
  await pushId(`kt:tx:${merchant.id}`, "e2");
  const v = await (await admin.GET(adminGet("leads"))).json();
  const row = v.leads.find((l) => l.id === id);
  assert.deepEqual(row.firstPayment, { kes: 50, sats: 400, at: "2026-11-04T10:01:00.000Z" });
});

test("a developer lead links to its API account and shows its keys", async () => {
  const { default: crypto } = await import("node:crypto");
  const email = "devlead@example.com";
  await setJSON("dev:acct:dev1", { id: "dev1", email, createdAt: "2026-11-01T00:00:00.000Z" });
  await setJSON(`dev:email:${crypto.createHash("sha256").update(email).digest("hex")}`, "dev1");
  await setJSON("dev:keyid:kid1", "hash1");
  await setJSON("dev:key:hash1", { id: "kid1", prefix: "ak_live_abc", name: "Till app", scopes: ["invoices"], sandbox: false, createdAt: "2026-11-02T00:00:00.000Z" });
  const { pushId } = await import(`${ROOT}/lib/store.js`);
  await pushId("dev:keys:dev1", "kid1");
  const { id } = await (await api.POST(req(form({ segment: "developer", name: "Dev Lead", email, answers: { building: "App", volume: "high", timeline: "now" } })))).json();
  let v = await (await admin.GET(adminGet("leads"))).json();
  assert.equal(v.leads.find((l) => l.id === id).candidates.dev.accountId, "dev1");
  await admin.POST(adminPost({ action: "lead_link", id, kind: "dev", target: "dev1" }));
  v = await (await admin.GET(adminGet("leads"))).json();
  const row = v.leads.find((l) => l.id === id);
  assert.equal(row.linked.dev.keys[0].prefix, "ak_live_abc");
  await admin.POST(adminPost({ action: "lead_unlink", id, kind: "dev" }));
  assert.equal((await getJSON(`lead:${id}`)).links.dev, null);
});

test("erasure anonymises the lead but keeps an audit line", async () => {
  const { id } = await (await api.POST(req(form({ phone: "0744555666", email: "gone@example.com" })))).json();
  await admin.POST(adminPost({ action: "lead_note", id, text: "Call at 9." }));
  await admin.POST(adminPost({ action: "lead_stage", id, stage: "contacted" }));
  const no = await admin.POST(adminPost({ action: "lead_delete", id, confirm: "please" }));
  assert.equal(no.status, 400);
  await admin.POST(adminPost({ action: "lead_delete", id, confirm: "DELETE" }));
  const m = await getJSON(`lead:${id}`);
  assert.equal(m.name, "[erased]");
  assert.equal(m.phone, "");
  assert.equal(m.email, "");
  assert.deepEqual(m.answers, {});
  assert.deepEqual(m.notes, []);
  assert.ok(m.erased && m.timeline.at(-1).text.includes("Erased on a deletion request"));
  assert.ok(m.timeline.some((e) => e.text.startsWith("Stage:")), "stage history stays");
  assert.ok(!m.timeline.some((e) => e.text.includes("Call at 9.")), "free-text notes go");
  assert.equal((await admin.POST(adminPost({ action: "lead_stage", id, stage: "won" }))).status, 400);
});

test("CSV export downloads every lead as plain rows", async () => {
  await api.POST(req(form({ name: 'Comma, "Quoted" Shop', phone: "0755666777" })));
  const r = await admin.GET(adminGet("leads_csv"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /text\/csv/);
  assert.match(r.headers.get("Content-Disposition"), /altradits-leads-\d{4}-\d{2}-\d{2}\.csv/);
  const csv = await r.text();
  assert.ok(csv.startsWith("id,submitted,segment,stage,name,phone,email,score,"));
  assert.ok(csv.includes('"Comma, ""Quoted"" Shop"'), "quotes and commas are escaped");
});

test("the daily digest emails only when a next step is due", async () => {
  const before = await listIds("emails", 100);
  const quiet = await leads.leadsDigest("2026-01-01");
  assert.deepEqual(quiet, { sent: false, due: 0 });
  assert.deepEqual(await listIds("emails", 100), before);
  const { id } = await (await api.POST(req(form({ phone: "0766777888" })))).json();
  await admin.POST(adminPost({ action: "lead_next", id, text: "Visit the shop", due: "2026-11-06" }));
  const loud = await leads.leadsDigest("2026-11-07");
  assert.deepEqual(loud, { sent: true, due: 1 });
  const fresh = (await listIds("emails", 100)).filter((x) => !before.includes(x));
  const mail = await getJSON(`email:${fresh[0]}`); // newest first: the digest is the latest
  assert.match(mail.subject, /Leads due/);
  assert.ok(mail.text.includes("Visit the shop"));
  await admin.POST(adminPost({ action: "lead_archive", id, archived: true }));
  assert.deepEqual(await leads.leadsDigest("2026-11-07"), { sent: false, due: 0 }, "archived leads stay out of the digest");
});
