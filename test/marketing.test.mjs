// The in-house marketing team: daily plan, Brand Guardian checks, scheduled
// publishing, and the "ready to post" email, with a fake Claude client and a
// fake social network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-mkt-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LINKEDIN_TOKEN", "LINKEDIN_ORG_ID", "FB_PAGE_TOKEN"]) delete process.env[k];
process.env.SITE_URL = "https://altradits.test";
Object.assign(process.env, { X_API_KEY: "ck", X_API_SECRET: "cs", X_ACCESS_TOKEN: "at", X_ACCESS_SECRET: "as" });

const { CHANNELS } = await import("../data/marketing.js");
const { setSocialFetch, oauthHeader, connected } = await import("../lib/social.js");
const mk = await import("../lib/marketing.js");
const { getJSON, listIds, getMany } = await import("../lib/store.js");

const ch = (id) => CHANNELS.find((c) => c.id === id);
const TEXT = {
  x: "Most founders lose an hour a day to inbox triage. We clear it the same day, fixed price, paid in Bitcoin. #founders",
  li_stan: "I stopped answering email at 7am.\n\nHere's what changed when I handed it to my team.",
  li_co: "Busy week? Pick a fixed-price job and it's done the same day.",
  fb_page: "Test us with one 15-minute task for $5.",
  fb_stan: "Building Altradits with freelancers from Addis and Kisumu.",
  tiktok: "HOOK: Your inbox at 7am vs. at 7:05.\nCAPTION: Same-day help #smallbusiness",
};

// Plans every slot; the review passes everything except a post we break on purpose.
const calls = [];
let planOverride = null;
mk.setMarketingClient({ beta: { messages: { stream: (params) => ({ finalMessage: async () => {
  calls.push(params);
  if (params.tools[0].name === "submit_plan") {
    const posts = CHANNELS.flatMap((c) => c.slots.map((slot) => ({ channel: c.id, slot, text: TEXT[c.id] })));
    return { stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_plan", input: planOverride?.(posts, params) || { theme: "Inbox", growth_note: "First day.", posts } }] };
  }
  const n = params.messages[0].content.split(/\n\n#/).length;
  return { stop_reason: "tool_use", content: [{ type: "tool_use", name: "review_posts", input: { verdicts: Array.from({ length: n }, (_, index) => ({ index, pass: true, issues: [] })) } }] };
} }) } } });

const sent = [];
setSocialFetch(async (url, init) => {
  sent.push({ url, init });
  return new Response(JSON.stringify({ data: { id: String(1000 + sent.length) } }), { status: 201, headers: { "Content-Type": "application/json" } });
});

test("hard checks block invented prices, URLs, phone numbers and testimonials", () => {
  assert.deepEqual(mk.checkPost(ch("x"), "Inbox zero by tonight. $5 to test us."), []);
  assert.match(mk.checkPost(ch("x"), "Only $7 today!").join(), /not a catalog price/);
  assert.match(mk.checkPost(ch("fb_page"), "See https://altradits.com").join(), /No URLs/);
  assert.match(mk.checkPost(ch("x"), "Visit altradits.com").join(), /No domain names/);
  assert.match(mk.checkPost(ch("li_co"), "Call +254 707 172 370").join(), /phone/);
  assert.match(mk.checkPost(ch("li_co"), "Our clients say we're the best").join(), /testimonials/);
  assert.match(mk.checkPost(ch("x"), "x".repeat(300)).join(), /Too long/);
  assert.match(mk.checkPost(ch("x"), "#a #b").join(), /1 hashtag/);
});

test("X requests are signed with OAuth 1.0a HMAC-SHA1", () => {
  const h = oauthHeader("POST", "https://api.x.com/2/tweets", { nonce: "n1", timestamp: 1700000000 });
  const base = "POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&" + encodeURIComponent("oauth_consumer_key=ck&oauth_nonce=n1&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1700000000&oauth_token=at&oauth_version=1.0");
  const sig = crypto.createHmac("sha1", "cs&as").update(base).digest("base64");
  assert.ok(h.startsWith("OAuth "));
  assert.ok(h.includes(`oauth_signature="${encodeURIComponent(sig)}"`));
});

test("only channels with keys post automatically; the rest go to Stanley's email", () => {
  assert.equal(connected(ch("x")), true);
  assert.equal(connected(ch("li_stan")), false);
  assert.equal(connected(ch("fb_stan")), false); // no API for personal profiles
  assert.equal(connected(ch("tiktok")), false);
});

test("the team plans the day at 05:00 UTC and posts each X slot once, on time", async () => {
  const early = new Date("2026-11-02T04:30:00Z");
  assert.equal((await mk.marketingTick({ at: early, force: true })).planned, false);

  const r = await mk.marketingTick({ at: new Date("2026-11-02T05:05:00Z"), force: true });
  assert.equal(r.planned, true);
  const day = await getJSON("mkt:day:2026-11-02");
  assert.equal(day.posts.length, CHANNELS.reduce((n, c) => n + c.slots.length, 0));
  assert.deepEqual(day.posts.filter((p) => p.channel === "x").map((p) => p.status), ["planned", "planned", "planned"]);
  assert.ok(day.posts.filter((p) => p.channel !== "x").every((p) => p.status === "manual"));
  // The team saw the live catalog and the guard rails.
  assert.match(calls[0].system, /Brand Guardian|never invent|Never invent/i);
  assert.match(calls[0].system, /Test us: one 15-minute task, \$5/);
  // Tracked links per channel; X never gets one.
  assert.equal(day.posts.find((p) => p.channel === "fb_page").link, "https://altradits.test/?ref=mkfbpage");
  assert.equal(day.posts.find((p) => p.channel === "x").link, null);

  // The daily email carries everything that can't auto-post.
  const emails = await getMany("email", await listIds("emails", 10));
  const digest = emails.find((e) => /Ready to post/.test(e.subject));
  assert.ok(digest);
  assert.match(digest.text, /Facebook · Stanley/);
  assert.match(digest.text, /TikTok/);
  assert.match(digest.text, /\?ref=mkfbstan/);

  await mk.marketingTick({ at: new Date("2026-11-02T07:01:00Z"), force: true });
  await mk.marketingTick({ at: new Date("2026-11-02T07:02:00Z"), force: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.x.com/2/tweets");
  assert.equal(JSON.parse(sent[0].init.body).text, TEXT.x);
  const after = await getJSON("mkt:day:2026-11-02");
  const first = after.posts.find((p) => p.channel === "x");
  assert.equal(first.status, "posted");
  assert.equal(first.url, "https://x.com/altradits/status/1001");
  assert.equal(calls.filter((c) => c.tools[0].name === "submit_plan").length, 1); // planned once
});

test("posts that fail review are rewritten once, then blocked if still wrong", async () => {
  planOverride = (posts) => ({ theme: "Prices", growth_note: "", posts: posts.map((p) => (p.channel === "fb_page" ? { ...p, text: "Everything 50% off, $3 only!" } : p)) });
  const rec = await mk.planDay(new Date("2026-11-03T05:10:00Z"));
  planOverride = null;
  const fb = rec.posts.find((p) => p.channel === "fb_page");
  assert.equal(fb.status, "rejected");
  assert.match(fb.issues.join(), /catalog price|discount/);
  const rewrite = calls.filter((c) => c.tools[0].name === "submit_plan").at(-1);
  assert.match(rewrite.messages[0].content, /REWRITE ONLY THESE POSTS/);
});

test("pausing stops all posting; cancelling a scheduled post skips it", async () => {
  await mk.saveSettings({ paused: true });
  assert.equal((await mk.marketingTick({ at: new Date("2026-11-02T12:40:00Z"), force: true })).skipped, "paused");
  await mk.saveSettings({ paused: false });
  const day = await getJSON("mkt:day:2026-11-02");
  const noon = day.posts.find((p) => p.channel === "x" && p.status === "planned");
  await mk.cancelPost(noon.id);
  const before = sent.length;
  await mk.marketingTick({ at: new Date("2026-11-02T12:40:00Z"), force: true });
  assert.equal(sent.length, before);
});

test("LinkedIn posts with the link as first comment; the Facebook Page gets the link attached", async () => {
  const { publish } = await import("../lib/social.js");
  Object.assign(process.env, { LINKEDIN_TOKEN: "li", LINKEDIN_PERSON_URN: "urn:li:person:abc", FB_PAGE_TOKEN: "fb" });
  const reqs = [];
  setSocialFetch(async (url, init) => {
    reqs.push({ url, init });
    if (url.endsWith("/rest/posts")) return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
    return new Response(JSON.stringify({ id: "123_456" }), { status: 200 });
  });
  const li = await publish(ch("li_stan"), { text: "Hook line", link: "https://altradits.test/?ref=mklistan" });
  assert.equal(li.url, "https://www.linkedin.com/feed/update/urn:li:share:9/");
  const body = JSON.parse(reqs[0].init.body);
  assert.equal(body.author, "urn:li:person:abc");
  assert.equal(body.commentary, "Hook line");
  assert.ok(reqs[0].init.headers["LinkedIn-Version"]);
  assert.match(reqs[1].url, /socialActions\/urn%3Ali%3Ashare%3A9\/comments$/);
  assert.equal(JSON.parse(reqs[1].init.body).message.text, "https://altradits.test/?ref=mklistan");

  const fb = await publish(ch("fb_page"), { text: "Test us for $5", link: "https://altradits.test/?ref=mkfbpage" });
  assert.match(reqs[2].url, /graph\.facebook\.com\/v[\d.]+\/61579168157529\/feed$/);
  assert.equal(reqs[2].init.body.get("link"), "https://altradits.test/?ref=mkfbpage");
  assert.equal(fb.url, "https://www.facebook.com/123_456");
  for (const k of ["LINKEDIN_TOKEN", "LINKEDIN_PERSON_URN", "FB_PAGE_TOKEN"]) delete process.env[k];
});
