// Njia (lib/njia.js, njiaRead in lib/lightning.js, admin Earn tab backend):
// read-only sweep allowlist, checklist stages, the public view builder, the
// append-only lease ledger, settings confirmations and the listing allowlist.
// The node is faked here, never called: every helper takes an injected `get`.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-njia-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "NJIA", "NJIA_LND_REST_URL", "NJIA_LND_READONLY_MACAROON", "NJIA_LND_TLS_CERT", "LND_REST_URL", "LND_READONLY_MACAROON", "LND_INVOICE_MACAROON", "LND_TLS_CERT", "ADMIN_TOKEN"]) delete process.env[k];
Object.assign(process.env, { SITE_URL: "https://altradits.test", ADMIN_TOKEN: "njia-test-admin-token" });

const nj = await import("../lib/njia.js");
const ln = await import("../lib/lightning.js");
const adminApi = await import("../api/admin.js");
const { deadmanActive } = await import("../lib/deadman.js");
const TOKEN = process.env.ADMIN_TOKEN;
const AUTH_HDR = `Bearer ${TOKEN}`;
const WRONG_HDR = `Bearer ${"wrong-token"}`;

// --- fixtures ---------------------------------------------------------------
const PUBKEY = "03" + "ab".repeat(32);
const PEER = "02" + "cd".repeat(32);
const POINT = `${"ef".repeat(32)}:0`;
const rest = {
  "/v1/getinfo": { identity_pubkey: PUBKEY, alias: "Altradits", version: "0.21.3-beta x", block_height: 900000, synced_to_chain: true, synced_to_graph: true, num_active_channels: 1, num_pending_channels: 0, num_peers: 4, uris: [`${PUBKEY}@xyz123.onion:9735`] },
  "/v1/channels": { channels: [{ channel_point: POINT, remote_pubkey: PEER, active: true, private: true, capacity: "2943434", local_balance: "98131", remote_balance: "2844338", local_chan_reserve_sat: "29434", remote_chan_reserve_sat: "29434", uptime: "78257", lifetime: "78314", commit_fee: "305" }] },
  "/v1/channels/pending": { pending_open_channels: [] },
  "/v1/channels/closed": { channels: [] },
  "/v1/balance/blockchain": { confirmed_balance: "0", unconfirmed_balance: "0" },
  "/v1/balance/channels": { local_balance: { sat: "98131" }, remote_balance: { sat: "2844338" } },
  "/v1/fees": { channel_fees: [{ channel_point: POINT, base_fee_msat: "1000", fee_per_mil: "1" }], day_fee_sum: "0", week_fee_sum: "0", month_fee_sum: "0" },
  "/v1/switch": { forwarding_events: [], last_offset_index: 0 },
  "/v1/peers": { peers: [{ pub_key: PEER, inbound: false, ping_time: "287000", flap_count: 115, last_flap_ns: "1000000000000", sync_type: "ACTIVE_SYNC", sat_sent: "17184", sat_recv: "115316" }] },
};
const recorder = () => {
  const calls = [];
  const get = async (method, path, body) => {
    calls.push(`${method} ${String(path).split("?")[0].replace(/^\/v1\/graph\/node\/.*/, "/v1/graph/node/")}`);
    if (String(path).startsWith("/v1/graph/node/")) return { num_channels: 0 };
    if (!(path in rest)) throw new Error(`unexpected call ${method} ${path}`);
    return structuredClone(rest[path]);
  };
  return { calls, get };
};
const ALLOW = new Set(["GET /v1/getinfo", "GET /v1/channels", "GET /v1/channels/pending", "GET /v1/channels/closed", "GET /v1/balance/blockchain", "GET /v1/balance/channels", "GET /v1/fees", "POST /v1/switch", "GET /v1/peers", "GET /v1/graph/node/"]);

test("njiaRead only ever makes read calls, and parses today's node shape", async () => {
  const r = recorder();
  const read = await ln.njiaRead({ get: r.get });
  assert.ok(r.calls.length >= 9, `expected the full sweep, got ${r.calls.length} calls`);
  for (const c of r.calls) assert.ok(ALLOW.has(c), `call outside the read allowlist: ${c}`);
  assert.equal(read.node, "site");
  assert.equal(read.info.alias, "Altradits");
  assert.equal(read.channels.length, 1);
  assert.equal(read.channels[0].private, true);
  assert.equal(read.chain.confirmed, 0);
  assert.equal(read.fees.month, 0);
  assert.deepEqual(read.fwd, []);
  assert.equal(read.peers.length, 1);
  assert.equal(read.graph.channels, 0);
});

test("njiaRead sets failed parts to null instead of throwing", async () => {
  const read = await ln.njiaRead({ get: async () => { throw new Error("LND 403: permission denied"); } });
  assert.equal(read.info, null);
  assert.equal(read.channels, null);
  assert.match(read.errors.info, /permission denied/);
});

// --- stages ------------------------------------------------------------------
const pubChan = (i, over = {}) => ({ point: `${"ab".repeat(32)}:${i}`, peer: `02${"cd".repeat(31)}${String(i).padStart(2, "0")}`,
  active: true, private: false, capacity: 1000000, local: 500000, remote: 500000, localReserve: 10000, remoteReserve: 10000,
  uptime: 98, lifetime: 100, commitFee: 300, ...over });
const readOf = (over = {}) => ({ info: { alias: "Altradits", pubkey: PUBKEY, uris: [] }, channels: [], pending: [], closed: [],
  chain: { confirmed: 0, unconfirmed: 0 }, chanbal: { local: 0, remote: 0 }, fees: { list: [], day: 0, week: 0, month: 0 },
  fwd: [], peers: [], graph: { channels: 0 }, ...over });

test("today's node: every stop not done, step 1 of 5", () => {
  const read = readOf({ channels: [{ point: POINT, peer: PEER, active: true, private: true, capacity: 2943434, local: 98131, remote: 2844338, localReserve: 29434, remoteReserve: 29434, uptime: 78257, lifetime: 78314, commitFee: 305 }],
    fees: { list: [{ point: POINT, baseMsat: 1000, ppm: 1 }], day: 0, week: 0, month: 0 } });
  const { stops, line } = nj.stages(read, { backup: null });
  assert.deepEqual(stops.map((s) => s.done), [false, false, false, false, false]);
  assert.equal(line, "Not earning yet. Step 1 of 5.");
});

test("stage edges: reserve floor, channel count, fees, reachability, leases", () => {
  const at = (read, ctx, key) => nj.stages(read, ctx).steps.find((s) => s.key === key);
  assert.equal(at(readOf({ chain: { confirmed: 9999, unconfirmed: 0 } }), {}, "reserve").status, "blocked");
  assert.equal(at(readOf({ chain: { confirmed: 10000, unconfirmed: 0 } }), {}, "reserve").status, "done");
  assert.equal(at(readOf({ chain: { confirmed: 0, unconfirmed: 5000 } }), {}, "reserve").status, "progress");
  const onePub = readOf({ channels: [pubChan(0)], graph: { channels: 1 } });
  const twoPub = readOf({ channels: [pubChan(0), pubChan(1)], graph: { channels: 2 } });
  assert.equal(at(onePub, {}, "channels").status, "blocked");
  assert.equal(at(twoPub, {}, "channels").status, "done");
  assert.equal(at(readOf({ channels: [], pending: [{ point: "x:0", status: "opening" }] }), {}, "channels").status, "progress");
  const def = readOf({ channels: [pubChan(0)], fees: { list: [{ point: pubChan(0).point, baseMsat: 1000, ppm: 1 }], day: 0, week: 0, month: 0 } });
  const fair = readOf({ channels: [pubChan(0)], fees: { list: [{ point: pubChan(0).point, baseMsat: 1000, ppm: 100 }], day: 0, week: 0, month: 0 } });
  assert.equal(at(def, {}, "fees").status, "blocked");
  const fairStep = at(fair, {}, "fees");
  assert.equal(fairStep.status, "done");
  assert.equal(fairStep.numbers.rows[0].earn100k, 11);
  const up = (pct) => readOf({ channels: [pubChan(0)], peers: [{ pubkey: pubChan(0).peer, flapsDay: 0 }] });
  assert.equal(at(up(), { reach: { samples: 12, pct: 97.9 } }, "uptime").status, "blocked");
  assert.equal(at(up(), { reach: { samples: 12, pct: 98 } }, "uptime").status, "done");
  assert.equal(at(up(), { reach: { samples: 11, pct: 100 } }, "uptime").status, "unknown");
  const lease = { kind: "lease", id: "l1", date: "2026-11-01", sizeSats: 1000000, feeSats: 10000, termDays: 90 };
  assert.equal(at(readOf(), { leases: [lease] }, "lease").status, "done");
  assert.equal(at(readOf(), { leases: [lease, { kind: "void", voids: "l1" }] }, "lease").status, "blocked");
  assert.equal(at(readOf(), { leases: [], settings: { listingUrl: "https://magma.amboss.space/x" } }, "lease").status, "progress");
});

// --- public view leak tests ----------------------------------------------------
const leakySnap = () => ({ stops: [{ key: "reserve", done: false }, { key: "channels", done: false }, { key: "fees", done: false }, { key: "uptime", done: false }, { key: "lease", done: false }],
  line: "Not earning yet. Step 1 of 5.", bands: { routing: "0", leases: "none", channels: "none" },
  read: { info: { alias: "Altradits", pubkey: PUBKEY, uris: [`${PUBKEY}@xyz123.onion:9735`] },
    channels: [{ point: POINT, peer: PEER, capacity: 2943434, local: 98131, remote: 2844338 }],
    chain: { confirmed: 98131, unconfirmed: 0 } } });
const IDENTIFIERS = [PUBKEY, "Altradits", "xyz123.onion", POINT, PEER, "https://magma.amboss.space/listing-1", "buyer-alfred"];

test("public view (hidden): no identifier, pattern or figure leaks", () => {
  const out = nj.publicView(leakySnap(), { identity: false, numbers: false, listingUrl: "https://magma.amboss.space/listing-1" }, false);
  const text = JSON.stringify(out);
  for (const id of IDENTIFIERS) assert.ok(!text.includes(id), `leaked ${id.slice(0, 20)}`);
  assert.doesNotMatch(text, /[0-9a-f]{66}/i, "no pubkey-shaped hex");
  assert.doesNotMatch(text, /\.onion/, "no onion address");
  assert.doesNotMatch(text, /\d+x\d+x\d+/, "no short channel id");
  assert.doesNotMatch(text, /[0-9a-f]{64}:\d+/i, "no channel point");
});

test("public view (numbers on): bands only, still no identifiers or exact figures", () => {
  const out = nj.publicView(leakySnap(), { identity: false, numbers: true, listingUrl: "https://magma.amboss.space/listing-1" }, false);
  const text = JSON.stringify(out);
  assert.ok(out.numbers, "bands are present");
  for (const id of IDENTIFIERS) assert.ok(!text.includes(id), `leaked ${id.slice(0, 20)}`);
  for (const exact of ["98131", "2844338", "2943434", "17184", "115316"]) assert.ok(!text.includes(exact), `exact figure ${exact} leaked`);
});

test("public view (identity on): alias, pubkey, onion and listing appear, nothing else", () => {
  const out = nj.publicView(leakySnap(), { identity: true, numbers: false, listingUrl: "https://magma.amboss.space/listing-1" }, false);
  const text = JSON.stringify(out);
  assert.equal(out.identity.alias, "Altradits");
  assert.equal(out.identity.pubkey, PUBKEY);
  assert.match(out.identity.onion, /\.onion/);
  assert.equal(out.identity.listingUrl, "https://magma.amboss.space/listing-1");
  for (const id of [POINT, PEER, "98131", "buyer-alfred"]) assert.ok(!text.includes(id), `leaked ${id.slice(0, 20)}`);
});

test("public view (lockdown): hidden view and the paused line whatever the settings", () => {
  const out = nj.publicView(leakySnap(), { identity: true, numbers: true, listingUrl: "https://magma.amboss.space/listing-1" }, true);
  assert.equal(out.line, "Paused for a security check.");
  assert.equal(out.numbers, undefined);
  assert.equal(out.identity, undefined);
});

// --- ledger --------------------------------------------------------------------
const LEASE = { date: "2026-11-05", sizeSats: 1000000, feeSats: 10000, termDays: 90, market: "Magma" };

test("the ledger never loses records: add, void, add", async () => {
  const a = await nj.addLease(LEASE);
  const v = await nj.voidLease({ id: a.id, reason: "wrong size typed" });
  const b = await nj.addLease({ ...LEASE, feeSats: 12000 });
  assert.equal(v.voids, a.id);
  const all = await nj.listLeases();
  assert.ok(all.some((l) => l.id === a.id) && all.some((l) => l.id === v.id) && all.some((l) => l.id === b.id), "all three entries are kept");
  const totals = nj.leaseTotals(all);
  assert.equal(totals.all, 12000, "totals skip the voided lease");
  const csv = nj.ledgerCsv(all);
  assert.match(csv, /^id,kind,date,size_sats,fee_sats/m);
  assert.match(csv, new RegExp(`void[^\\n]*voids ${a.id}`));
  assert.equal(nj.leaseYearlyPct(b), 4.9);
  await assert.rejects(nj.addLease({ ...LEASE, sizeSats: -5 }), /20,000/);
  await assert.rejects(nj.addLease({ ...LEASE, feeSats: 2000000 }), /up to the size/);
  await assert.rejects(nj.addLease({ ...LEASE, date: "2999-01-01" }), /future/);
  await assert.rejects(nj.addLease({ ...LEASE, point: "nope" }), /txid:index/);
  await assert.rejects(nj.voidLease({ id: a.id, reason: "again" }), /already voided/);
  await assert.rejects(nj.voidLease({ id: b.id, reason: "" }), /why it is void/);
});

// --- settings --------------------------------------------------------------------
test("revealing settings need the typed word, and every change is logged", async () => {
  await assert.rejects(nj.setSetting({ field: "identity", value: true, confirm: "" }), /Type LINK/);
  await assert.rejects(nj.setSetting({ field: "identity", value: true, confirm: "link" }), /Type LINK/);
  await assert.rejects(nj.setSetting({ field: "numbers", value: true, confirm: "LINK" }), /Type SHOW/);
  await nj.setSetting({ field: "identity", value: true, confirm: "LINK", ip: "iphash1" });
  assert.equal((await nj.getSettings()).identity, true);
  await nj.setSetting({ field: "identity", value: false });
  assert.equal((await nj.getSettings()).identity, false);
  const log = await nj.settingLog(10);
  assert.ok(log.some((e) => e.field === "identity" && e.from === false && e.to === true && e.by === "stanley"), "the switch-on is logged");
  assert.ok(log.some((e) => e.field === "identity" && e.to === false), "the switch-off is logged");
});

test("lockdown refuses revealing settings, switching off still works", async () => {
  const f = path.join(process.cwd(), ".data", "deadman-state.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ active: true }));
  assert.equal(deadmanActive(), true);
  try {
    await assert.rejects(nj.setSetting({ field: "numbers", value: true, confirm: "SHOW" }), /Deadman's Switch is active/);
    await nj.setSetting({ field: "numbers", value: false });
    assert.equal((await nj.getSettings()).numbers, false);
  } finally {
    fs.writeFileSync(f, JSON.stringify({ active: false }));
  }
  assert.equal(deadmanActive(), false);
});

test("listing links: trusted https hosts only", async () => {
  for (const bad of ["http://magma.amboss.space/x", "https://evil.test/x", "javascript:alert(1)", "https://user:pass@magma.amboss.space/x", "not a url"]) {
    await assert.rejects(nj.setListing({ url: bad }), /trusted marketplace/, `${bad} refused`);
    assert.equal(nj.validListingUrl(bad), null);
  }
  const good = "https://magma.amboss.space/listing-1";
  await nj.setListing({ url: good });
  assert.equal((await nj.getSettings()).listingUrl, good);
});

// --- jobs ----------------------------------------------------------------------
test("hourly and sample do nothing while NJIA is off, and make no node call", async () => {
  const r = recorder();
  assert.deepEqual(await nj.hourly({ get: r.get }), { skipped: "off" });
  assert.deepEqual(await nj.sample({ get: r.get }), { skipped: "off" });
  assert.equal(r.calls.length, 0);
  process.env.NJIA = "on";
  try {
    assert.deepEqual(await nj.hourly({ get: r.get }), { skipped: "no-node" });
    assert.deepEqual(await nj.sample({ get: r.get }), { skipped: "no-node" });
    assert.equal(r.calls.length, 0);
  } finally { delete process.env.NJIA; }
});

// --- admin wiring ------------------------------------------------------------------
const adminGet = async (qs) => {
  const r = await adminApi.GET(new Request(`https://altradits.test/api/admin${qs}`, { headers: { Authorization: AUTH_HDR } }));
  return { status: r.status, body: await r.json().catch(() => null) };
};

test("admin Earn view answers behind the gate, with no node it says how to fix it", async () => {
  const denied = await adminApi.GET(new Request("https://altradits.test/api/admin?view=njia", { headers: { Authorization: WRONG_HDR } }));
  assert.equal(denied.status, 401);
  const { status, body } = await adminGet("?view=njia");
  assert.equal(status, 200);
  assert.equal(body.on, false);
  assert.ok(Array.isArray(body.steps) && body.steps.length === 8, "all eight checklist steps");
  assert.ok(body.readHint, "names the missing read-only key or the unreachable node");
});

test("admin Njia records round-trip through the gate", async () => {
  const post = async (actionBody) => {
    const r = await adminApi.POST(new Request("https://altradits.test/api/admin", { method: "POST",
      headers: { Authorization: AUTH_HDR, "Content-Type": "application/json" }, body: JSON.stringify(actionBody) }));
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const added = await post({ action: "njia_lease", lease: { ...LEASE, date: "2026-11-06", feeSats: 5000 } });
  assert.equal(added.status, 200);
  assert.equal(added.body.lease.feeSats, 5000);
  const bad = await post({ action: "njia_lease", lease: { ...LEASE, feeSats: -1 } });
  assert.equal(bad.status, 400);
  const price = await post({ action: "njia_price", price: { date: "2026-11-06", market: "Magma", sizeSats: 1000000, ratePct: 1, termDays: 90 } });
  assert.equal(price.status, 200);
  const csv = await adminApi.GET(new Request("https://altradits.test/api/admin?view=njia_csv", { headers: { Authorization: AUTH_HDR } }));
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /^id,kind,date,size_sats,fee_sats/m);
});

// --- static: no outside calls ------------------------------------------------------
test("Njia makes no third-party calls: no fetch in its new code", () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
  const src = fs.readFileSync(path.join(root, "lib/njia.js"), "utf8");
  assert.doesNotMatch(src, /(?<![\w.])fetch\(/, "lib/njia.js: no direct fetch()");
  assert.doesNotMatch(src, /publicFetch\(/, "lib/njia.js: no guarded fetch either (prices are typed in)");
});
