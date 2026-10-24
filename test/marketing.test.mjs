// The in-house marketing team: master content, repurposing into native posts,
// the 7-day scheduler (posts wait for accounts to be connected), the treasure
// hunt and its one-time coupons. Fake Claude client, fake social network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-mkt-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LINKEDIN_TOKEN", "LINKEDIN_ORG_ID", "FB_PAGE_TOKEN", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) delete process.env[k];
process.env.SITE_URL = "https://altradits.test";
const X_KEYS = { X_API_KEY: "ck", X_API_SECRET: "cs", X_ACCESS_TOKEN: "at", X_ACCESS_SECRET: "as" };

const { CHANNELS, HUNT } = await import("../data/marketing.js");
const { setSocialFetch, oauthHeader, connected, publish } = await import("../lib/social.js");
const mk = await import("../lib/marketing.js");
const hunt = await import("../lib/hunt.js");
const { getJSON, listIds, getMany } = await import("../lib/store.js");
const order = await import("../api/order.js");
const huntApi = await import("../api/hunt.js");
const { getProposal, getLead, confirmPayment } = await import("../lib/crm.js");

const ch = (id) => CHANNELS.find((c) => c.id === id);
const req = (url, body, ip = "1.1.1.1") => new Request(`https://altradits.test${url}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: body && JSON.stringify(body) });

// --- fake Claude: a master, then one post per requested slot ------------------
const calls = [];
let breakSlot = null; // a slot id whose first draft quotes a fake price
mk.setMarketingClient({ beta: { messages: { stream: (params) => ({ finalMessage: async () => {
  calls.push(params);
  const tool = params.tools[0].name;
  const out = (input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: tool, input }] });
  if (tool === "submit_master") return out({ title: "Inbox in an hour", theme: "Offer spotlight", audience: "Agency owners", message: "Hand us your inbox; it's sorted the same day.", points: ["Fixed price", "Same day"], hooks: ["What if 7am was quiet?", "Inbox zero is a service", "I stopped answering email"], cta: "Order the $5 test task", growth_note: "First week." });
  if (tool === "submit_posts") {
    const content = params.messages[0].content;
    const ids = [...content.matchAll(/^- (\d{4}-\d\d-\d\d\/\w+\/\d\d:\d\d) \|/gm)].map((m) => m[1]);
    const fixing = /FIX THESE/.test(content);
    return out({ posts: ids.map((slot) => ({ slot, format: `format for ${slot}`, text: slot === breakSlot && !fixing ? "Everything for $3 only!" : `Your inbox, handled the same day. (${slot.split("/")[1]})` })) });
  }
  if (tool === "respond") {
    const ids = [...params.messages[0].content.matchAll(/^\[(\S+)\]/gm)].map((m) => m[1]);
    return out({ decisions: ids.map((id) => id === "c1" ? { id, action: "reply", reply: "Yes! Same-day delivery on all quick jobs. Have a look at altradits.com.", reason: "Question" }
      : id === "c2" ? { id, action: "escalate", reason: "Order complaint" }
      : { id, action: "reply", reply: `The word is ${hunt.huntFor(new Date("2026-11-05T09:00:00Z")).word}`, reason: "Hunt question" }) });
  }
  const n = params.messages[0].content.split(/\n\n#/).length;
  return out({ verdicts: Array.from({ length: n }, (_, index) => ({ index, pass: true, issues: [] })) });
} }) } } });

const sent = [];
let fbComments = [];
const tweets = () => sent.filter((r) => r.url === "https://api.x.com/2/tweets" && r.init?.method === "POST");
setSocialFetch(async (url, init = {}) => {
  sent.push({ url, init });
  if (url === "https://api.x.com/2/users/me") return new Response(JSON.stringify({ data: { id: "42", username: "altradits" } }));
  if (url.includes("/mentions")) return new Response(JSON.stringify({ meta: {} }));
  if (url.includes("/comments?fields=")) return new Response(JSON.stringify({ data: fbComments }));
  if (url.endsWith("/rest/posts")) return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
  if (url.includes("graph.facebook.com")) return new Response(JSON.stringify({ id: "123_456" }), { status: 200 });
  return new Response(JSON.stringify({ data: { id: String(1000 + sent.length) } }), { status: 201 });
});

// ------------------------------------------------------------------ checks
test("hard checks block invented prices, URLs, phones, testimonials, coupons and hand-written hunt lines", () => {
  assert.deepEqual(mk.checkPost(ch("x"), "Inbox zero by tonight. $5 to test us."), []);
  assert.match(mk.checkPost(ch("x"), "Only $7 today!").join(), /not a catalog price/);
  assert.match(mk.checkPost(ch("fb_page"), "See https://altradits.com").join(), /No URLs/);
  assert.match(mk.checkPost(ch("x"), "Visit altradits.com").join(), /No domain names/);
  assert.match(mk.checkPost(ch("li_co"), "Call +254 707 172 370").join(), /phone/);
  assert.match(mk.checkPost(ch("li_co"), "Our clients say we're the best").join(), /testimonials/);
  assert.match(mk.checkPost(ch("li_co"), "Grab a coupon today").join(), /coupons/);
  assert.match(mk.checkPost(ch("li_co"), "🔎 letter 2 of 8 is A").join(), /hunt or winners line/);
  assert.match(mk.checkPost(ch("x"), "Join the #AltraditsHunt").join(), /hunt or winners line/);
  assert.match(mk.checkPost(ch("x"), "x".repeat(250), 220).join(), /Too long/);
});

test("X requests are signed with OAuth 1.0a HMAC-SHA1", () => {
  Object.assign(process.env, X_KEYS);
  const h = oauthHeader("POST", "https://api.x.com/2/tweets", { nonce: "n1", timestamp: 1700000000 });
  const base = "POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&" + encodeURIComponent("oauth_consumer_key=ck&oauth_nonce=n1&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1700000000&oauth_token=at&oauth_version=1.0");
  assert.ok(h.includes(`oauth_signature="${encodeURIComponent(crypto.createHmac("sha1", "cs&as").update(base).digest("base64"))}"`));
  for (const k of Object.keys(X_KEYS)) delete process.env[k];
});

// ------------------------------------------------------------------ the scheduler
const AT = new Date("2026-11-02T04:00:00Z"); // a Monday, before the first slot

test("the team keeps the next 7 days scheduled: one master per day, repurposed for every slot", async () => {
  for (let i = 0; i < 8; i++) await mk.marketingTick({ at: AT, force: true });
  const masters = await listIds("mkt:masters", 50);
  assert.equal(masters.length, 7);
  for (let i = 0; i < 7; i++) {
    const day = new Date(AT.getTime() + i * 864e5).toISOString().slice(0, 10);
    const rec = await getJSON(`mkt:day:${day}`);
    assert.equal(rec.posts.length, CHANNELS.reduce((n, c) => n + c.slots.length, 0), day);
    assert.ok(rec.posts.every((p) => p.status === "scheduled" && p.masterId && p.format && p.trace));
  }
  const day1 = await getJSON("mkt:day:2026-11-02");
  // Every post carries a hunt letter; one day's posts cover the whole word.
  const h = hunt.huntFor(AT);
  const letters = new Set(day1.posts.map((p) => p.trace.match(/: ([A-Z])\b/)[1]));
  assert.equal(letters.size, new Set(h.word).size);
  // One fixed branded hashtag carries the clue, week after week.
  assert.ok(day1.posts.every((p) => p.trace.startsWith("#AltraditsHunt letter ")));
  assert.match(day1.posts.find((p) => p.channel === "x").trace, new RegExp(`^#AltraditsHunt letter \\d/${h.word.length}: [A-Z]$`));
  assert.match(day1.posts.find((p) => p.channel === "li_co").trace, /altradits\.com\/hunt/);
  // The writers were told how much room the hunt line leaves.
  const rep = calls.find((c) => c.tools[0].name === "submit_posts");
  assert.match(rep.messages[0].content, /2026-11-02\/x\/07:00 \| X · @altradits .* \| max 2\d\d characters/);
});

test("posts wait for their account: emailed when not connected, posted by themselves once it is", async () => {
  // 05:00: the morning email lists today's posts for unconnected accounts.
  await mk.marketingTick({ at: new Date("2026-11-02T05:10:00Z"), force: true });
  const emails = await getMany("email", await listIds("emails", 20));
  const digest = emails.find((e) => /Ready to post/.test(e.subject));
  assert.ok(digest);
  assert.match(digest.text, /TikTok/);
  assert.match(digest.text, /#AltraditsHunt letter/);

  // 07:00 X slot, not connected: it becomes "manual" (no API call).
  await mk.marketingTick({ at: new Date("2026-11-02T07:01:00Z"), force: true });
  let rec = await getJSON("mkt:day:2026-11-02");
  assert.equal(rec.posts.find((p) => p.channel === "x" && p.slot === "07:00").status, "manual");
  assert.equal(tweets().length, 0);

  // Stanley connects X: the 12:30 post goes out by itself, with its hunt line.
  Object.assign(process.env, X_KEYS);
  await mk.marketingTick({ at: new Date("2026-11-02T12:31:00Z"), force: true });
  await mk.marketingTick({ at: new Date("2026-11-02T12:32:00Z"), force: true });
  assert.equal(tweets().length, 1);
  const text = JSON.parse(tweets()[0].init.body).text;
  assert.match(text, /Your inbox, handled the same day\. \(x\)\n\n#AltraditsHunt letter \d\/\d: [A-Z]$/);
  assert.ok(text.length <= 280);
  rec = await getJSON("mkt:day:2026-11-02");
  assert.equal(rec.posts.find((p) => p.channel === "x" && p.slot === "12:30").status, "posted");
});

test("Stanley can edit or cancel scheduled posts; edits are checked", async () => {
  const rec = await getJSON("mkt:day:2026-11-03");
  const p = rec.posts.find((x) => x.channel === "li_stan");
  await assert.rejects(mk.editPost(p.id, "Only $3!"), /not a catalog price/);
  const edited = await mk.editPost(p.id, "I stopped answering email at 7am. Here's why.");
  assert.equal(edited.text, "I stopped answering email at 7am. Here's why.");
  assert.equal((await mk.cancelPost(p.id)).status, "cancelled");
  assert.equal((await getJSON("mkt:day:2026-11-03")).locked, true);
});

test("repurpose: a master becomes new variants for a chosen day; bad drafts are rewritten once", async () => {
  const master = await mk.createMaster({ brief: "Push the $5 test task", at: AT });
  assert.equal(master.by, "stanley");
  breakSlot = "2026-11-05/fb_page/15:00";
  const r = await mk.repurpose(master.id, { start: "2026-11-05", days: 1, at: AT });
  breakSlot = null;
  assert.equal(r.rejected, 0);
  const rec = await getJSON("mkt:day:2026-11-05");
  assert.ok(rec.posts.filter((p) => p.status === "scheduled").every((p) => p.masterId === master.id));
  assert.ok(calls.some((c) => /FIX THESE/.test(c.messages?.[0]?.content || "") && /\$3 is not a catalog price/.test(c.messages[0].content)));
  assert.deepEqual((await getJSON(`mkt:master:${master.id}`)).scheduled, ["2026-11-05"]);
});

test("pausing stops everything", async () => {
  await mk.saveSettings({ paused: true });
  assert.equal((await mk.marketingTick({ at: new Date("2026-11-02T18:01:00Z"), force: true })).skipped, "paused");
  await mk.saveSettings({ paused: false });
});

test("LinkedIn posts with the link as first comment; the Facebook Page gets the link attached", async () => {
  Object.assign(process.env, { LINKEDIN_TOKEN: "li", LINKEDIN_PERSON_URN: "urn:li:person:abc", FB_PAGE_TOKEN: "fb" });
  sent.length = 0;
  const li = await publish(ch("li_stan"), { text: "Hook line", link: "https://altradits.test/?ref=mklistan" });
  assert.equal(JSON.parse(sent[1].init.body).actor, "urn:li:person:abc");
  assert.equal(li.url, "https://www.linkedin.com/feed/update/urn:li:share:9/");
  assert.equal(JSON.parse(sent[0].init.body).author, "urn:li:person:abc");
  assert.match(sent[1].url, /socialActions\/urn%3Ali%3Ashare%3A9\/comments$/);
  await publish(ch("fb_page"), { text: "Test us for $5", link: "https://altradits.test/?ref=mkfbpage" });
  assert.match(sent[2].url, /graph\.facebook\.com\/v[\d.]+\/61579168157529\/feed$/);
  assert.equal(sent[2].init.body.get("link"), "https://altradits.test/?ref=mkfbpage");
  assert.equal(connected(ch("fb_stan")), false); // no API for personal profiles
  for (const k of ["LINKEDIN_TOKEN", "LINKEDIN_PERSON_URN", "FB_PAGE_TOKEN"]) delete process.env[k];
});

// ------------------------------------------------------------------ treasure hunt
test("hunt: solve, share, a visit from someone else unlocks a one-time coupon", async () => {
  const h = hunt.huntFor();
  assert.equal((await huntApi.POST(req("/api/hunt", { action: "solve", answer: "WRONG" }))).status, 400);
  const solved = await (await huntApi.POST(req("/api/hunt", { action: "solve", answer: h.word.toLowerCase() }, "2.2.2.2"))).json();
  const claim = solved.claim;
  assert.match(claim.share, /^https:\/\/altradits\.com\/\?h=[a-z2-9]{8}$/);
  const code = claim.share.split("=")[1];

  // The player opening their own link doesn't count.
  await huntApi.POST(req("/api/hunt", { action: "visit", code }, "2.2.2.2"));
  let status = await (await huntApi.GET(req(`/api/hunt?claim=${claim.id}&t=${claim.t}`))).json();
  assert.equal(status.claim.coupon, null);
  // Someone else opens it: the coupon unlocks.
  await huntApi.POST(req("/api/hunt", { action: "visit", code }, "3.3.3.3"));
  status = await (await huntApi.GET(req(`/api/hunt?claim=${claim.id}&t=${claim.t}`))).json();
  const coupon = status.claim.coupon;
  assert.match(coupon.code, /^HUNT-[A-Z2-9]{6}$/);
  assert.equal(coupon.pct, HUNT.couponPct);
  // Wrong token: nothing.
  assert.equal((await huntApi.GET(req(`/api/hunt?claim=${claim.id}&t=nope`))).status, 404);
  // Same player solving again gets the same claim, not a second coupon.
  const again = await (await huntApi.POST(req("/api/hunt", { action: "solve", answer: h.word }, "2.2.2.2"))).json();
  assert.equal(again.claim.id, claim.id);

  // Checkout: the code takes 10% off, and works for one paid order only.
  const o1 = await (await order.POST(req("/api/order", { item: "q-try" }))).json();
  const applied = await (await order.POST(req("/api/order", { id: o1.id, t: o1.t, coupon: coupon.code.toLowerCase() }))).json();
  assert.equal(applied.usd, 4.5);
  const p1 = await getProposal(o1.id);
  assert.equal(p1.totals.dueNow, 4.5);

  // While reserved, another order can't take it.
  const o2 = await (await order.POST(req("/api/order", { item: "q-try" }))).json();
  const blocked = await order.POST(req("/api/order", { id: o2.id, t: o2.t, coupon: coupon.code }));
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).error, /another order/);

  await confirmPayment(await getLead(p1.leadId), p1);
  assert.equal((await getJSON(`coupon:${coupon.code}`)).status, "used");
  const reuse = await order.POST(req("/api/order", { id: o2.id, t: o2.t, coupon: coupon.code }));
  assert.match((await reuse.json()).error, /already been used/);
  assert.deepEqual(await hunt.huntStats(h.n), { solved: 1, earned: 1, used: 1 });
});

test("hunt guesses are rate limited", async () => {
  let last;
  for (let i = 0; i < 14; i++) last = await huntApi.POST(req("/api/hunt", { action: "solve", answer: "NOPE" }, "9.9.9.9"));
  assert.equal(last.status, 429);
});

test("winners who opt in get a shoutout in the next post out: tagged on X, by name elsewhere", async () => {
  const h = hunt.huntFor();
  const { claim } = await (await huntApi.POST(req("/api/hunt", { action: "solve", answer: h.word }, "4.4.4.4"))).json();
  // Strict formats only: this text is published.
  assert.equal((await huntApi.POST(req("/api/hunt", { action: "shoutout", id: claim.id, t: claim.t, handle: "@bad handle!" }))).status, 400);
  assert.equal((await huntApi.POST(req("/api/hunt", { action: "shoutout", id: claim.id, t: "wrong", handle: "amina_k" }))).status, 404);
  assert.equal((await huntApi.POST(req("/api/hunt", { action: "shoutout", id: claim.id, t: claim.t, handle: "@amina_k", name: "Amina" }))).status, 200);
  assert.equal((await hunt.pendingShoutouts()).length, 0); // not a winner until the coupon unlocks
  await huntApi.POST(req("/api/hunt", { action: "visit", code: claim.share.split("=")[1] }, "5.5.5.5"));
  assert.equal((await hunt.pendingShoutouts()).length, 1);

  // The next X post that goes out carries the tag, between the post and the clue.
  Object.assign(process.env, X_KEYS);
  sent.length = 0;
  await mk.marketingTick({ at: new Date("2026-11-03T07:01:00Z"), force: true });
  const text = JSON.parse(tweets()[0].init.body).text;
  assert.match(text, /\n\n🏆 Congrats to our latest #AltraditsHunt winners: @amina_k!\n\n#AltraditsHunt letter/);
  assert.ok(text.length <= 280);
  assert.equal((await hunt.pendingShoutouts()).length, 0); // once only
  await mk.marketingTick({ at: new Date("2026-11-03T12:31:00Z"), force: true });
  assert.doesNotMatch(JSON.parse(tweets()[1].init.body).text, /🏆/);
  const status = await (await huntApi.GET(req(`/api/hunt?claim=${claim.id}&t=${claim.t}`))).json();
  assert.equal(status.claim.shoutDone, true);
  for (const k of Object.keys(X_KEYS)) delete process.env[k];
});

test("the company page's link comment comes from Stanley's personal account, not the brand", async () => {
  Object.assign(process.env, { LINKEDIN_TOKEN: "li", LINKEDIN_ORG_TOKEN: "org", LINKEDIN_ORG_ID: "777", LINKEDIN_PERSON_URN: "urn:li:person:abc" });
  sent.length = 0;
  await publish(ch("li_co"), { text: "Company post", link: "https://altradits.test/?ref=mklico" });
  assert.equal(JSON.parse(sent[0].init.body).author, "urn:li:organization:777");
  assert.equal(sent[0].init.headers.Authorization, "Bearer org");
  const comment = JSON.parse(sent[1].init.body);
  assert.equal(comment.actor, "urn:li:person:abc");
  assert.equal(sent[1].init.headers.Authorization, "Bearer li");
  for (const k of ["LINKEDIN_TOKEN", "LINKEDIN_ORG_TOKEN", "LINKEDIN_ORG_ID", "LINKEDIN_PERSON_URN"]) delete process.env[k];
});

test("X GET requests sign their query parameters", () => {
  Object.assign(process.env, X_KEYS);
  const url = "https://api.x.com/2/users/42/mentions?max_results=50&since_id=9";
  const h = oauthHeader("GET", url, { nonce: "n1", timestamp: 1700000000 });
  const params = "max_results=50&oauth_consumer_key=ck&oauth_nonce=n1&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1700000000&oauth_token=at&oauth_version=1.0&since_id=9";
  const base = `GET&${encodeURIComponent("https://api.x.com/2/users/42/mentions")}&${encodeURIComponent(params)}`;
  assert.ok(h.includes(`oauth_signature="${encodeURIComponent(crypto.createHmac("sha1", "cs&as").update(base).digest("base64"))}"`));
  for (const k of Object.keys(X_KEYS)) delete process.env[k];
});

test("Altradits only answers comments on its own posts: replies, escalates the sensitive, never leaks the hunt word", async () => {
  const { checkReply } = await import("../lib/responder.js");
  assert.deepEqual(checkReply("fb_page", "Thanks! Same day, fixed price."), []);
  assert.match(checkReply("fb_page", "We'll refund you").join(), /refunds/);
  assert.match(checkReply("fb_page", "Get 50% off").join(), /discounts/);
  assert.deepEqual(checkReply("fb_page", `Solve it for ${HUNT.couponPct}% off one order.`), []);
  assert.match(checkReply("x", "Hi @someone").join(), /mention/);

  Object.assign(process.env, { FB_PAGE_TOKEN: "fb" });
  // A posted Page post with comments: a question, a complaint, the Page itself, a hunt-word fisher.
  const rec = await getJSON("mkt:day:2026-11-04");
  const post = rec.posts.find((p) => p.channel === "fb_page");
  Object.assign(post, { status: "posted", platformId: "61579168157529_1", url: "https://www.facebook.com/61579168157529_1" });
  await (await import("../lib/store.js")).setJSON("mkt:day:2026-11-04", rec);
  fbComments = [
    { id: "c1", message: "Do you deliver the same day?", from: { id: "u1", name: "Jo" } },
    { id: "c2", message: "My order hasn't arrived and I paid yesterday", from: { id: "u2", name: "Sam" } },
    { id: "c3", message: "What's this week's word?", from: { id: "u3", name: "Lee" } },
    { id: "c4", message: "Thanks everyone", from: { id: "61579168157529", name: "Altradits" } },
  ];
  sent.length = 0;
  const r = await mk.marketingTick({ at: new Date("2026-11-05T09:00:00Z"), force: true });
  assert.deepEqual({ ...r.responses }, { handled: 3, replied: 1, escalated: 2 });
  const replies = sent.filter((x) => /\/c\d\/comments$/.test(x.url));
  assert.equal(replies.length, 1);
  assert.match(replies[0].url, /\/c1\/comments$/);
  assert.match(replies[0].init.body.get("message"), /Same-day delivery/);
  // The complaint and the blocked hunt-word reply went to Stanley.
  const emails = await getMany("email", await listIds("emails", 50));
  const esc = emails.find((e) => /comments need you/.test(e.subject));
  assert.match(esc.text, /My order hasn't arrived/);
  assert.match(esc.text, /Never reveal the hunt word/);
  // Each comment is handled once.
  sent.length = 0;
  const again = await mk.marketingTick({ at: new Date("2026-11-05T10:00:00Z"), force: true });
  assert.equal(again.responses.handled, 0);
  // Switched off: no reading, no replying.
  await mk.saveSettings({ autoReply: false });
  fbComments = [{ id: "c9", message: "Hello?", from: { id: "u9", name: "Ann" } }];
  assert.equal((await mk.marketingTick({ at: new Date("2026-11-05T11:00:00Z"), force: true })).responses, null);
  await mk.saveSettings({ autoReply: true });
  delete process.env.FB_PAGE_TOKEN;
});
