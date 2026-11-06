// Security watch UI: severity badges, grouping by technique, filters, the
// resolved state after a Deadman's Switch lift, the on-chain callout, and
// peer flap recency (recent drops warn; an old cumulative total does not).
// Runs the dashboard's own renderers plus the lib/lightning.js peer helpers.
// Run: node --test test/security-watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-secw-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
const src = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");

const { summarizePeer, peerFlapRecency, annotatePeerFlaps } = await import(path.join(ROOT, "lib/lightning.js"));

// The dashboard's own helpers, sliced out exactly (same idea as attack-history.test.mjs).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = () => "some time ago";
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const satsF = (n) => (n === null || n === undefined ? "–" : `${num(n)} sats`);
function block(startMark, endMark, names, helpers) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark);
  assert.ok(start > 0 && end > start, `${startMark} is shipped in assets/admin.js`);
  const keys = Object.keys(helpers);
  return new Function(...keys, `${src.slice(start, end)}\nreturn { ${names.join(", ")} };`)(...keys.map((k) => helpers[k]));
}
const sec = block("// ==== Security watch rendering", "// end security-watch-rendering",
  ["secLifts", "secResolved", "secIssueText", "secFiltersHtml", "secGroupsHtml", "secFilterList", "secEventsHtml"], { esc, ago });
const flap = block("// ==== Peer flap recency", "// end peer-flap-recency", ["peerDropping", "peerFlapText"], { esc, ago, num });
const chainLowHtml = (() => {
  const start = src.indexOf("function chainLowHtml(");
  const end = src.indexOf("// end chainLowHtml");
  assert.ok(start > 0 && end > start, "chainLowHtml is shipped in assets/admin.js");
  return new Function("confirmed", "satsF", `${src.slice(start, end)}\nreturn chainLowHtml(confirmed);`);
})();

const T = {
  file_tampering: { name: "Server file or .htaccess tampering", ref: "Deadman's Switch Trigger", severity: "high", what: "A tracked file changed.", improve: "Keep the lockdown on; inspect the diff." },
  admin_token_guess: { name: "Admin token guessing", ref: "MITRE T1110", severity: "high", what: "Wrong admin tokens.", improve: "Rotate ADMIN_TOKEN." },
  csp_violation: { name: "Blocked script (possible XSS)", ref: "OWASP A03", severity: "medium", what: "A script lock blocked code.", improve: "Check the page." },
  ktown_number: { name: "kTown number event", ref: "kTown pilot", severity: "low", what: "A number churned.", improve: "Block it if it churns." },
};
const ev = (kind, at, extra = {}) => ({ id: `e${kind}${at}`, at, kind, where: "Server files", ip: "local", detail: "", ...extra });
const LIFT = { incidentId: "inc_1", liftedAt: "2026-11-06T06:00:00.000Z", liftedBy: "stanley", forced: false, missingChecklist: [], note: "False alarm: DirectAdmin rewrote only the Passenger block.", checklist: {} };

test("lifts collect every all-clear, oldest first, without doubling the legacy one", () => {
  assert.deepEqual(sec.secLifts(null), []);
  assert.deepEqual(sec.secLifts({ liftHistory: [LIFT], liftedAt: LIFT.liftedAt, liftNote: LIFT.note }),
    [{ at: LIFT.liftedAt, note: LIFT.note, forced: false }]);
  const two = sec.secLifts({ liftHistory: [{ ...LIFT, liftedAt: "2026-11-06T08:00:00.000Z", note: "Second look." }, LIFT] });
  assert.deepEqual(two.map((l) => l.at), ["2026-11-06T06:00:00.000Z", "2026-11-06T08:00:00.000Z"]);
});

test("resolved: a watched kind before a lift is covered; guesses and later events stay open", () => {
  const lifts = sec.secLifts({ liftHistory: [LIFT] });
  assert.equal(sec.secResolved(ev("file_tampering", "2026-11-06T05:00:00.000Z"), lifts).note, LIFT.note);
  assert.equal(sec.secResolved(ev("file_tampering", "2026-11-06T07:00:00.000Z"), lifts), null);
  assert.equal(sec.secResolved(ev("admin_token_guess", "2026-11-06T05:00:00.000Z"), lifts), null, "guesses never resolve");
  assert.equal(sec.secResolved(ev("ktown_number", "2026-11-06T05:00:00.000Z"), lifts), null, "low events never resolve");
  assert.equal(sec.secResolved(ev("file_tampering", "2026-11-06T05:00:00.000Z"), []), null, "no lift, no resolve");
});

test("the high-severity item names each technique with its count, most first", () => {
  const open = [ev("admin_token_guess", "2026-11-06T05:01:00Z"), ev("admin_token_guess", "2026-11-06T05:02:00Z"), ev("file_tampering", "2026-11-06T05:03:00Z")];
  const text = sec.secIssueText(open, [], T);
  assert.match(text, /^3 high-severity attempts turned away today: Admin token guessing ×2, Server file or \.htaccess tampering ×1\./);
  assert.match(text, /listed in Security watch/);
  assert.equal(sec.secIssueText([open[0]], [], T).split(" ")[0], "1");
  assert.match(sec.secIssueText([open[0]], [], T), /^1 high-severity attempt turned/);
  assert.match(sec.secIssueText(open, [ev("file_tampering", "2026-11-06T04:00:00Z")], T), /\(1 more already resolved by your all-clear\.\)/);
});

test("severity chips carry today's counts and mark the active one", () => {
  const counts = { file_tampering: { today: 2, week: 2 }, admin_token_guess: { today: 4, week: 9 }, csp_violation: { today: 1, week: 1 }, ktown_number: { today: 3, week: 5 } };
  const html = sec.secFiltersHtml(counts, T, "high");
  for (const [v, n] of [["all", 10], ["high", 6], ["medium", 1], ["low", 3]]) assert.match(html, new RegExp(`data-secsev="${v}"[^>]*>\\w+ \\(${n}\\)`));
  assert.match(html, /data-secsev="high" aria-pressed="true"/);
  assert.match(html, /data-secsev="low" aria-pressed="false"/);
});

test("today by technique: only kinds seen today, most first, with what to do", () => {
  const counts = { file_tampering: { today: 2, week: 2 }, admin_token_guess: { today: 4, week: 9 }, csp_violation: { today: 0, week: 1 }, ktown_number: { today: 0, week: 0 } };
  const html = sec.secGroupsHtml(counts, T, "all");
  assert.ok(html.indexOf("Admin token guessing") < html.indexOf("Server file or .htaccess tampering"), "most first");
  assert.doesNotMatch(html, /Blocked script/, "zero today stays out");
  assert.match(html, /<span class="sev high">High<\/span>/);
  assert.match(html, /×4 today · 9 this week/);
  assert.match(html, /What it means and what to do/);
  assert.match(html, /Rotate ADMIN_TOKEN\./);
  assert.match(html, /data-seckind="admin_token_guess"/);
  assert.equal(sec.secGroupsHtml({ file_tampering: { today: 0, week: 3 } }, T, "all"), "");
});

test("events render newest first with a severity badge, and escape everything", () => {
  const lifts = [];
  const events = [
    ev("ktown_number", "2026-11-06T05:01:00Z", { detail: "old" }),
    ev("admin_token_guess", "2026-11-06T05:03:00Z", { where: "POST <b>/api/admin</b>", detail: "<script>no</script>" }),
    ev("csp_violation", "2026-11-06T05:02:00Z"),
  ];
  const html = sec.secEventsHtml(events, T, lifts, {});
  assert.ok(html.indexOf("Admin token guessing") < html.indexOf("Blocked script") && html.indexOf("Blocked script") < html.indexOf("kTown number"), "newest first");
  assert.match(html, /<span class="sev high">High<\/span>/);
  assert.match(html, /<span class="sev medium">Medium<\/span>/);
  assert.match(html, /<span class="sev low">Low<\/span>/);
  assert.doesNotMatch(html, /<script>no<\/script>/);
  assert.match(html, /&lt;script&gt;no&lt;\/script&gt;/);
  assert.match(html, /POST &lt;b&gt;\/api\/admin&lt;\/b&gt;/);
});

test("filters narrow the list; long details fold; resolved shows the note", () => {
  const lifts = sec.secLifts({ liftHistory: [LIFT] });
  const long = `x=<${"y".repeat(200)}>`;
  const events = [ev("file_tampering", "2026-11-06T05:00:00Z", { detail: "diff shows only the block" }),
    ev("admin_token_guess", "2026-11-06T05:01:00Z"), ev("ktown_number", "2026-11-06T05:02:00Z", { detail: long })];
  const high = sec.secEventsHtml(events, T, lifts, { sev: "high" });
  assert.match(high, /Admin token guessing/);
  assert.match(high, /Server file or .htaccess tampering/);
  assert.doesNotMatch(high, /kTown number/);
  assert.match(high, /Resolved: False alarm: DirectAdmin rewrote only the Passenger block\./);
  const tokenRow = high.split('<div class="sm ev">').find((row) => row.includes("Admin token guessing"));
  assert.doesNotMatch(tokenRow, /Resolved/, "the token guess stays open");
  const low = sec.secEventsHtml(events, T, lifts, { sev: "high", kind: "ktown_number" });
  assert.match(low, /No High events for kTown number event in this list\. <button[^>]*>Show everything<\/button>/);
  const folded = sec.secEventsHtml(events, T, lifts, {});
  assert.match(folded, /<details class="secmore"><summary>.*Show all<\/summary>/);
  assert.doesNotMatch(folded, new RegExp(`<${"y".repeat(200)}>`), "the long detail is escaped even when folded");
});

test("empty states: nothing yet, and a filter with no match", () => {
  assert.match(sec.secEventsHtml([], T, [], {}), /Nothing turned away yet/);
  assert.match(sec.secEventsHtml([ev("ktown_number", "2026-11-06T05:00:00Z")], T, [], { sev: "high" }), /No High events in this list/);
});

test("the list caps at 40 and says so", () => {
  const events = Array.from({ length: 45 }, (_, i) => ev("ktown_number", `2026-11-06T05:${String(i).padStart(2, "0")}:00Z`));
  const html = sec.secEventsHtml(events, T, [], {});
  assert.equal((html.match(/<div class="sm ev">/g) || []).length, 40);
  assert.match(html, /Showing 40 of 45/);
});

test("still dropping means a drop in the last day or 5+ a day, never the raw total", () => {
  const now = Date.parse("2026-11-06T08:30:00.000Z");
  assert.equal(flap.peerDropping(null, now), false);
  assert.equal(flap.peerDropping({ flaps: 115, lastFlapAt: null, flapsDay: null }, now), false, "an old total alone never warns");
  assert.equal(flap.peerDropping({ flaps: 115, lastFlapAt: "2026-11-06T08:05:00.000Z", flapsDay: null }, now), true);
  assert.equal(flap.peerDropping({ flaps: 200, lastFlapAt: "2026-11-01T08:05:00.000Z", flapsDay: 0 }, now), false);
  assert.equal(flap.peerDropping({ flaps: 200, lastFlapAt: "2026-11-01T08:05:00.000Z", flapsDay: 5 }, now), true);
  assert.equal(flap.peerDropping({ flaps: 3, lastFlapAt: null, flapsDay: 4 }, now), false);
});

test("the peer item names the peer and the fix in plain words", () => {
  const X = { channels: [{ pubkey: "03d6aaa", alias: "Satoshi 17" }] };
  const text = flap.peerFlapText([{ pubkey: "03d6aaa", flaps: 115, lastFlapAt: "2026-11-06T08:05:00.000Z", flapsDay: 12 }], X);
  assert.match(text, /Your peer connection keeps dropping: Satoshi 17 \(last drop some time ago, 115 in total\)\./);
  assert.match(text, /Payments can fail during a drop/);
  assert.match(text, /Check the Mac is awake with internet, LND is running, and the tunnel is up/);
  const anon = flap.peerFlapText([{ pubkey: "03d6bbbbcccc", flaps: 60, lastFlapAt: null, flapsDay: 6 }], { channels: [] });
  assert.match(anon, /peer 03d6bbbb \(6 drops a day, 60 in total\)/);
});

test("on-chain callout: exact amount, why, and the Fund it button; quiet otherwise", () => {
  const low = chainLowHtml(0, satsF);
  assert.match(low, /On-chain is low: 0 sats\./);
  assert.match(low, /Send about <b>10,000 sats<\/b>/);
  assert.match(low, /if a channel ever closes by force/);
  assert.match(low, /id="chainLowGo"/);
  assert.match(chainLowHtml(3500, satsF), /Send about <b>6,500 sats<\/b>/);
  assert.equal(chainLowHtml(10_000, satsF), "");
  assert.equal(chainLowHtml(25_000, satsF), "");
  assert.equal(chainLowHtml(null, satsF), "");
});

test("the low-balance callout renders and its button focuses the Fund it box", () => {
  const start = src.indexOf("function renderChainLow(D) {");
  const end = src.indexOf("// end chainLowRenderer");
  assert.ok(start > 0 && end > start, "renderChainLow is shipped in assets/admin.js");
  const render = new Function("D", "$", "chainLowHtml", `${src.slice(start, end)}\nreturn renderChainLow(D);`);
  const els = {};
  const stub$ = (sel) => (els[sel] ||= { innerHTML: "", listeners: {}, scrolled: false, focused: false,
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    scrollIntoView() { this.scrolled = true; }, focus() { this.focused = true; },
    classList: { add() {}, remove() {} } });
  let seen = "unset";
  render({ details: { onchain: { confirmed: 0 } } }, stub$, (c) => { seen = c; return `<p>low ${c}</p>`; });
  assert.equal(seen, 0);
  assert.equal(els["#chainLow"].innerHTML, "<p>low 0</p>");
  assert.equal(els["#chainLowGo"].listeners.click.length, 1);
  els["#chainLowGo"].listeners.click[0]();
  assert.equal(els["#chAddrPaste"].scrolled, true);
  assert.equal(els["#chAddrPaste"].focused, true);
});

test("summarizePeer maps the LND peer, with the last drop time", () => {
  assert.deepEqual(summarizePeer({ pub_key: "03d6", inbound: false, ping_time: "291459", flap_count: 115, last_flap_ns: "1793941531883329000", sync_type: "ACTIVE_SYNC", sat_sent: "17184", sat_recv: "115316" }),
    { pubkey: "03d6", inbound: false, pingMs: 291, flaps: 115, lastFlapAt: new Date(1793941531883).toISOString(), sync: "ACTIVE_SYNC", satSent: 17184, satRecv: 115316 });
  assert.equal(summarizePeer({ pub_key: "02aa", flap_count: 0, last_flap_ns: "0" }).lastFlapAt, null, "never dropped");
  assert.equal(summarizePeer({ pub_key: "02aa" }).lastFlapAt, null, "old LND without the field");
});

test("flap recency needs a fresh baseline and survives a counter reset", () => {
  const now = Date.parse("2026-11-06T08:30:00.000Z");
  assert.deepEqual(peerFlapRecency({ flaps: 115 }, null, now), { flapsDay: null }, "first sighting");
  assert.deepEqual(peerFlapRecency({ flaps: 115 }, { flaps: 103, at: "2026-11-05T08:30:00.000Z" }, now), { flapsDay: 12 });
  assert.deepEqual(peerFlapRecency({ flaps: 104 }, { flaps: 103, at: "2026-11-06T07:30:00.000Z" }, now), { flapsDay: 24 });
  assert.deepEqual(peerFlapRecency({ flaps: 3 }, { flaps: 115, at: "2026-11-06T07:30:00.000Z" }, now), { flapsDay: null }, "restart wiped the counter");
  assert.deepEqual(peerFlapRecency({ flaps: 115 }, { flaps: 103, at: "2026-10-20T08:30:00.000Z" }, now), { flapsDay: null }, "stale baseline");
  assert.deepEqual(peerFlapRecency({ flaps: 115 }, { flaps: 103, at: "2026-11-06T08:29:00.000Z" }, now), { flapsDay: null }, "too soon to project");
});

test("snapshots round-trip: first sighting sets the baseline, the next read projects", async () => {
  const t0 = Date.parse("2026-11-06T08:00:00.000Z");
  const first = await annotatePeerFlaps([{ pubkey: "03snap", flaps: 100 }], t0);
  assert.equal(first[0].flapsDay, null);
  const second = await annotatePeerFlaps([{ pubkey: "03snap", flaps: 112 }], t0 + 12 * 3600e3);
  assert.equal(second[0].flapsDay, 24);
  const missing = await annotatePeerFlaps([{}], t0);
  assert.equal(missing[0].flapsDay, null, "no pubkey still renders");
});

test("frequent page loads keep the day-old baseline, so the rate still shows", async () => {
  const t0 = Date.parse("2026-11-07T08:00:00.000Z");
  await annotatePeerFlaps([{ pubkey: "03keep", flaps: 50 }], t0);
  for (let h = 2; h <= 6; h++) await annotatePeerFlaps([{ pubkey: "03keep", flaps: 50 + h }], t0 + h * 3600e3);
  const later = await annotatePeerFlaps([{ pubkey: "03keep", flaps: 62 }], t0 + 12 * 3600e3);
  assert.equal(later[0].flapsDay, 24, "measured from the first baseline, not the last page load");
  const soon = await annotatePeerFlaps([{ pubkey: "03fresh", flaps: 10 }], t0);
  const blip = await annotatePeerFlaps([{ pubkey: "03fresh", flaps: 11 }], t0 + 10 * 60e3);
  assert.equal(blip[0].flapsDay, null, "one drop in ten minutes is not projected to a day");
  assert.equal(soon[0].flapsDay, null);
});

test("new UI hooks exist in page and script", () => {
  for (const id of ["secGroups", "secFilters", "secCount", "chainLow", "chAddrPaste"]) {
    assert.ok(page.includes(`id="${id}"`), `admin.html has #${id}`);
  }
  for (const fn of ["setSecFilter", "renderSecEvents", "secEventsHtml", "secGroupsHtml", "secFiltersHtml", "secIssueText", "secLifts", "secResolved", "peerDropping", "peerFlapText", "chainLowHtml", "renderChainLow"]) {
    assert.ok(src.includes(`function ${fn}(`), `admin.js defines ${fn}`);
  }
  assert.ok(src.includes('"security:hSec:sev=high"'), "the high-severity item links to the filtered list");
  assert.ok(src.includes('extra.startsWith("sev=")'), "go() applies the severity filter");
});
