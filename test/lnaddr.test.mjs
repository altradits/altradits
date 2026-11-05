// Ye₿ente's Lightning-address proxy (lib/lnaddr.js): the lookups the app used
// to do itself now go through the server, so the wallet page calls no outside
// host. A mock LNURL server (HTTPS, test CA) and stubbed DNS prove each
// protection: strict addresses, blocked networks, rebinding, redirects,
// size, content type, callback host and exact amounts.
// Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-lnaddr-"));
process.chdir(tmp);
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "TRUSTED_PROXIES", "ADMIN_TOKEN", "IP_SALT"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", EMAIL_APPROVAL: "off" });

const netsafe = await import("../lib/netsafe.js");
const lnaddr = await import("../lib/lnaddr.js");
const api = await import("../api/yebente.js");
const { encodeLnurl } = await import("../lib/lnurl.js");

// --- mock LNURL server (HTTPS, test CA) ------------------------------------
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=lnurl.test",
  "-addext", "subjectAltName=DNS:lnurl.test,DNS:other.test,DNS:wos.test,DNS:livingroom.test,DNS:blink.test,DNS:lnurl.blink.test",
  "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const PORT = { n: 0 };
const seen = [];  // every request's cookie/authorization headers (must stay empty)
const cbGot = {}; // callback query per user
const meta = (user, domain = "lnurl.test") => JSON.stringify([["text/plain", `Pay ${user}@${domain}`], ["text/identifier", `${user}@${domain}`]]);
const payRequest = (user, extra = {}) => ({ tag: "payRequest", callback: `https://lnurl.test/cb/${user}`,
  minSendable: 1000, maxSendable: 11000000, metadata: meta(user), commentAllowed: 140, ...extra });
// A BOLT11-shaped invoice (amount and tagged fields read; signature unchecked).
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const invoice = (sats, descHash = null) => {
  const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5("ab".repeat(32)), ...(descHash ? [23, 1, 20, ...w5(descHash)] : []), ...Array(104).fill(0)];
  return `lnbc${sats * 10}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq";
};
const lnurlHandler = (req, res) => {
  seen.push({ url: req.url, host: req.headers.host, cookie: req.headers.cookie, auth: req.headers.authorization });
  const u = new URL(req.url, "https://lnurl.test");
  const json = (code, obj, type = "application/json; charset=utf-8") => { res.writeHead(code, { "Content-Type": type }); res.end(JSON.stringify(obj)); };
  const m = u.pathname.match(/^\/\.well-known\/lnurlp\/([\w.-]+)$/);
  if (m) {
    const user = m[1];
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    // WoS- and Blink-shaped: the callback lives on another host, like the real wallets.
    if (host === "wos.test") return json(200, { tag: "payRequest", callback: "https://livingroom.test/cb/wos",
      minSendable: 1000, maxSendable: 11000000, metadata: meta(user, "wos.test"), commentAllowed: 140 });
    if (host === "blink.test") return json(200, { tag: "payRequest", callback: "https://lnurl.blink.test/cb/blink",
      minSendable: 1000, maxSendable: 11000000, metadata: meta(user, "blink.test"), commentAllowed: 140 });
    if (user === "moved") { res.writeHead(302, { Location: "/cb/alice" }); res.end(); return; }
    if (user === "big") return json(200, { ...payRequest(user), pad: "x".repeat(100 * 1024) });
    if (user === "html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<h1>not json</h1>"); return; }
    if (user === "evil") return json(200, payRequest(user, { callback: "https://other.test/cb/evil" }));
    if (user === "trap") return json(200, payRequest(user, { callback: "https://evil.test/cb/evil" }));
    if (user === "literal") return json(200, payRequest(user, { callback: "https://93.184.216.34/cb/alice" }));
    if (user === "literal6") return json(200, payRequest(user, { callback: "https://[2001:db8::1]/cb/alice" }));
    if (user === "plain") return json(200, payRequest(user, { callback: "http://lnurl.test/cb/alice" }));
    if (user === "creds") return json(200, payRequest(user, { callback: "https://user:pass@lnurl.test/cb/alice" }));
    if (user === "down") return json(200, { status: "ERROR", reason: "No wallet here." });
    if (user === "odd") return json(200, { tag: "withdrawRequest", callback: "https://lnurl.test/cb/alice" });
    if (user === "quiet") return json(200, payRequest(user, { commentAllowed: 0 }));
    if (user === "rich") return json(200, payRequest(user, { minSendable: 100000 }));
    if (user === "alias") return json(200, payRequest(user, { metadata: meta("someone", "else.test") }));
    if (user === "badmeta") return json(200, payRequest(user, { metadata: "not json" }));
    if (user === "arrmeta") return json(200, payRequest(user, { metadata: [["text/plain", "Pay arr"], ["text/identifier", "arr@lnurl.test"]] }));
    if (user === "slow") { setTimeout(() => { try { json(200, payRequest(user)); } catch {} }, 9500); return; }
    if (["alice", "bob", "sealed", "tampered"].includes(user)) return json(200, payRequest(user));
    return json(404, { status: "ERROR", reason: "Unknown." });
  }
  const c = u.pathname.match(/^\/cb\/([\w.-]+)$/);
  if (c) {
    cbGot[c[1]] = { amount: u.searchParams.get("amount"), comment: u.searchParams.get("comment") };
    if (c[1] === "sealed" || c[1] === "tampered") {
      const md = meta(c[1]);
      const dh = crypto.createHash("sha256").update(c[1] === "sealed" ? md : "something else").digest("hex");
      return json(200, { pr: invoice(Number(u.searchParams.get("amount")) / 1000, dh) });
    }
    const msats = c[1] === "bob" ? 1000 : Number(u.searchParams.get("amount"));
    return json(200, { pr: `lnbc${msats / 100}n1testinvoice` });
  }
  return json(404, { status: "ERROR", reason: "Unknown." });
};
let lnurlSrv;
const plainSrv = http.createServer((req, res) => res.end("pinned"));
let plainPort = 0;

// --- stubbed DNS -------------------------------------------------------------
let dnsMap = {}, dnsCalls = 0;
const useDns = (map) => {
  dnsMap = map; dnsCalls = 0;
  netsafe.setDnsLookup((host, opts, cb) => {
    dnsCalls++;
    const a = dnsMap[host];
    if (!a) { const e = new Error(`getaddrinfo ENOTFOUND ${host}`); e.code = "ENOTFOUND"; return cb(e); }
    cb(null, a);
  });
};
const MOCK_HOSTS = ["lnurl.test", "other.test", "wos.test", "livingroom.test", "blink.test", "lnurl.blink.test"];
const localDns = () => useDns(Object.fromEntries([...MOCK_HOSTS, "pin.test"].map((h) => [h, [{ address: "127.0.0.1", family: 4 }]])));

let agent;
// The proxy builds default-port URLs from addresses, but the mock listens on
// a random port: map the host to it here, after every production check has
// run on the real URL. DNS, TLS, size and content checks all stay live.
const testFetcher = (u, o) => {
  let mapped = String(u);
  for (const h of MOCK_HOSTS) {
    const prefix = `https://${h}/`;
    if (mapped.startsWith(prefix)) { mapped = `https://${h}:${PORT.n}/` + mapped.slice(prefix.length); break; }
  }
  return netsafe.publicFetch(mapped, { ...o, agent });
};
before(async () => {
  lnurlSrv = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, lnurlHandler);
  await new Promise((r) => lnurlSrv.listen(0, "127.0.0.1", r));
  PORT.n = lnurlSrv.address().port;
  await new Promise((r) => plainSrv.listen(0, "127.0.0.1", r));
  plainPort = plainSrv.address().port;
  agent = new https.Agent({ ca: fs.readFileSync("cert.pem"), keepAlive: false });
  process.env.JOBS_ALLOW_LOCAL = "1";
  assert.equal(netsafe.localAllowed(), true);
  localDns();
  lnaddr.setLnaddrFetcher(testFetcher);
});
after(() => {
  lnurlSrv.close(); plainSrv.close(); agent.destroy();
  netsafe.setDnsLookup(null); lnaddr.setLnaddrFetcher(null);
  delete process.env.JOBS_ALLOW_LOCAL;
});

const call = (method, p, body, { ip = "7.7.7.7", token = null } = {}) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}));
const post = async (p, body, opts) => { const r = await call("POST", p, body, opts); return { status: r.status, body: await r.json() }; };
const UNREACHABLE = "That Lightning address isn't reachable.";

test("valid lookup and invoice through the mock server; only the wallet's fields come back", async () => {
  const r = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.1.0.1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ["address", "commentAllowed", "domain", "maxSendableSats", "minSendableSats", "success", "username"]);
  assert.deepEqual(r.body, { success: true, address: "alice@lnurl.test", username: "alice", domain: "lnurl.test",
    minSendableSats: 1, maxSendableSats: 11000, commentAllowed: 140 });
  const inv = await post("address/invoice", { to: "alice@lnurl.test", sats: 50, comment: "hi" }, { ip: "10.1.0.1" });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.deepEqual(Object.keys(inv.body).sort(), ["invoice", "success"]);
  assert.equal(inv.body.invoice, "lnbc500n1testinvoice");
  assert.deepEqual(cbGot.alice, { amount: "50000", comment: "hi" });
  // The lookup went through stubbed DNS and the test CA: the guarded path is live.
  assert.ok(dnsCalls > 0);
  // Nothing identifying the visitor went out: no cookies, no credentials.
  assert.ok(seen.length > 0);
  for (const s of seen) assert.equal(s.cookie ?? s.auth, undefined, s.url);
  assert.equal((await call("GET", "address/resolve")).status, 404, "POST only");
});

test("strict address format: one @, plain user, sound dotted domain", async () => {
  const bad = ["", "a", "@x.com", "a@", "a@@x.com", "a b@x.com", ".a@x.com", "a.@x.com", "a..b@x.com",
    "a@b", "a@b.", "a@.b.com", "a@b..com", "a@-b.com", "a@b-.com", "a@b.c", "a@b.1c",
    "a@127.0.0.1", "a@[::1]", "a@x.com.", `${"u".repeat(65)}@x.com`, `a@${"l".repeat(64)}.com`, `a@${"d".repeat(250)}.com`];
  let n = 0;
  for (const to of bad) {
    const r = await post("address/resolve", { to }, { ip: `10.1.1.${++n}` });
    assert.equal(r.status, 400, to);
    assert.match(r.body.error, /Lightning address/, to);
  }
  assert.deepEqual(lnaddr.parseLnAddress("First.Last+x@y-wallet.com"), { user: "first.last+x", domain: "y-wallet.com" });
  assert.deepEqual(lnaddr.parseLnAddress("lightning:Alice@Wallet.COM"), { user: "alice", domain: "wallet.com" });
  const prefixed = await post("address/resolve", { to: "lightning:alice@lnurl.test" }, { ip: "10.1.1.99" });
  assert.equal(prefixed.status, 200, JSON.stringify(prefixed.body));
});

test("every blocked address class is refused with the same sentence (no oracle)", async () => {
  delete process.env.JOBS_ALLOW_LOCAL;
  try {
    const classes = ["127.0.0.2", "10.9.9.9", "172.20.9.9", "192.168.9.9", "169.254.9.9", "169.254.169.254",
      "100.64.9.9", "224.0.0.9", "0.0.0.0", "192.0.2.9", "198.18.9.9", "::1", "::ffff:10.9.9.9",
      "::ffff:7f00:1", "fc00::9", "fe80::9", "ff02::9", "64:ff9b::a9fe:9", "2002:7f00:1::"];
    let n = 0;
    for (const ip of classes) {
      assert.equal(netsafe.privateIp(ip), true, ip);
      useDns({ "blocked.test": [{ address: ip, family: ip.includes(":") ? 6 : 4 }] });
      const r = await post("address/resolve", { to: "nobody@blocked.test" }, { ip: `10.1.2.${++n}` });
      assert.equal(r.status, 502, ip);
      assert.equal(r.body.error, UNREACHABLE, ip);
    }
  } finally {
    process.env.JOBS_ALLOW_LOCAL = "1";
    localDns();
  }
});

test("a rebinding attempt finds nothing: one resolution, pinned to the connection", async () => {
  localDns();
  const before = dnsCalls;
  assert.equal(await (await netsafe.publicFetch(`http://pin.test:${plainPort}/`)).text(), "pinned");
  assert.equal(dnsCalls - before, 1, "a single lookup serves both the check and the connection");
  delete process.env.JOBS_ALLOW_LOCAL;
  try {
    useDns({ "twoface.test": [{ address: "93.184.216.34", family: 4 }, { address: "10.9.9.9", family: 4 }] });
    await assert.rejects(netsafe.publicFetch("http://twoface.test/", { timeout: 1500 }), /isn't a public website/);
    assert.equal(dnsCalls, 1, "refused on the one resolution, before connecting");
    useDns({ "evil.test": [{ address: "10.9.9.9", family: 4 }] });
    await assert.rejects(netsafe.publicFetch("http://evil.test/"), /isn't a public website/);
  } finally {
    process.env.JOBS_ALLOW_LOCAL = "1";
    localDns();
  }
});

test("redirects are refused, not followed", async () => {
  const r = await post("address/resolve", { to: "moved@lnurl.test" }, { ip: "10.1.3.1" });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, UNREACHABLE);
});

test("oversize bodies are refused", async () => {
  const r = await post("address/resolve", { to: "big@lnurl.test" }, { ip: "10.1.3.2" });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, UNREACHABLE);
});

test("a wrong content type is refused", async () => {
  const r = await post("address/resolve", { to: "html@lnurl.test" }, { ip: "10.1.3.3" });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, UNREACHABLE);
});

test("a cross-host callback on a public host succeeds, WoS- and Blink-shaped included", async () => {
  const cross = await post("address/invoice", { to: "evil@lnurl.test", sats: 50 }, { ip: "10.1.3.4" });
  assert.equal(cross.status, 200, JSON.stringify(cross.body));
  assert.equal(cross.body.invoice, "lnbc500n1testinvoice");
  assert.deepEqual(cbGot.evil, { amount: "50000", comment: null });
  const wos = await post("address/resolve", { to: "someone@wos.test" }, { ip: "10.1.3.4" });
  assert.equal(wos.status, 200, JSON.stringify(wos.body));
  assert.equal(wos.body.address, "someone@wos.test");
  const wosInv = await post("address/invoice", { to: "someone@wos.test", sats: 50 }, { ip: "10.1.3.4" });
  assert.equal(wosInv.status, 200, JSON.stringify(wosInv.body));
  const blink = await post("address/invoice", { to: "someone@blink.test", sats: 50 }, { ip: "10.1.3.4" });
  assert.equal(blink.status, 200, JSON.stringify(blink.body));
});

test("the callback must be plain https: no userinfo, no IP literal", async () => {
  for (const [to, why] of [["plain@lnurl.test", "plain http"], ["creds@lnurl.test", "userinfo"],
    ["literal@lnurl.test", "IPv4 literal"], ["literal6@lnurl.test", "IPv6 literal"]]) {
    const r = await post("address/invoice", { to, sats: 50 }, { ip: "10.1.3.7" });
    assert.equal(r.status, 502, why);
    assert.equal(r.body.error, UNREACHABLE, why);
  }
});

test("a cross-host callback to a private or loopback IP is refused before connecting", async () => {
  // The callback hop runs under production rules (no local bypass), so a
  // private answer is refused by the guard instead of connected to.
  lnaddr.setLnaddrFetcher(async (u, o) => {
    if (!String(u).includes("/cb/")) return testFetcher(u, o);
    delete process.env.JOBS_ALLOW_LOCAL;
    try { return await testFetcher(u, o); } finally { process.env.JOBS_ALLOW_LOCAL = "1"; }
  });
  try {
    for (const [ip, why] of [["10.9.9.9", "private"], ["127.0.0.2", "loopback"]]) {
      useDns({ ...Object.fromEntries(MOCK_HOSTS.map((h) => [h, [{ address: "127.0.0.1", family: 4 }]])),
        "evil.test": [{ address: ip, family: 4 }] });
      const r = await post("address/invoice", { to: "trap@lnurl.test", sats: 50 }, { ip: "10.1.3.8" });
      assert.equal(r.status, 502, why);
      assert.equal(r.body.error, UNREACHABLE, why);
    }
    assert.ok(seen.every((s) => String(s.host).split(":")[0] !== "evil.test"), "nothing was sent to the refused host");
  } finally {
    lnaddr.setLnaddrFetcher(testFetcher);
    localDns();
  }
});

test("an invoice for a different amount is refused", async () => {
  const r = await post("address/invoice", { to: "bob@lnurl.test", sats: 50 }, { ip: "10.1.3.5" });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /different amount/);
});

test("a description commitment must match the address's metadata", async () => {
  const ok = await post("address/invoice", { to: "sealed@lnurl.test", sats: 50 }, { ip: "10.1.3.6" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const bad = await post("address/invoice", { to: "tampered@lnurl.test", sats: 50 }, { ip: "10.1.3.6" });
  assert.equal(bad.status, 502);
  assert.match(bad.body.error, /for something else/);
});

test("the provider's own refusals surface briefly; amounts stay within its bounds", async () => {
  const down = await post("address/resolve", { to: "down@lnurl.test" }, { ip: "10.1.4.1" });
  assert.equal(down.status, 502);
  assert.equal(down.body.error, "No wallet here.");
  const odd = await post("address/resolve", { to: "odd@lnurl.test" }, { ip: "10.1.4.1" });
  assert.equal(odd.status, 502, "not a payRequest");
  const missing = await post("address/resolve", { to: "nobody@lnurl.test" }, { ip: "10.1.4.1" });
  assert.equal(missing.status, 502);
  assert.equal(missing.body.error, "Unknown.");
  const high = await post("address/invoice", { to: "alice@lnurl.test", sats: 20000 }, { ip: "10.1.4.1" });
  assert.equal(high.status, 400);
  assert.match(high.body.error, /1 to 11,000 sats/);
  const low = await post("address/invoice", { to: "rich@lnurl.test", sats: 50 }, { ip: "10.1.4.1" });
  assert.equal(low.status, 400);
  assert.match(low.body.error, /100 to 11,000 sats/);
  for (const sats of [0, -5, 1.5, "abc", null]) {
    const r = await post("address/invoice", { to: "alice@lnurl.test", sats }, { ip: "10.1.4.1" });
    assert.equal(r.status, 400, String(sats));
  }
});

test("lnurl1 and lnurlp:// inputs work; broken ones don't", async () => {
  const payUrl = "https://lnurl.test/.well-known/lnurlp/alice";
  const enc = encodeLnurl(payUrl);
  const r = await post("address/resolve", { to: enc }, { ip: "10.1.5.1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.domain, "lnurl.test");
  assert.equal(r.body.username, "alice");
  assert.equal(r.body.address, "alice@lnurl.test");
  const upper = await post("address/resolve", { to: enc.toUpperCase() }, { ip: "10.1.5.1" });
  assert.equal(upper.status, 200, "QR codes print uppercase");
  const inv = await post("address/invoice", { to: enc, sats: 50 }, { ip: "10.1.5.1" });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const plain17 = await post("address/resolve", { to: "lnurlp://lnurl.test/.well-known/lnurlp/alice" }, { ip: "10.1.5.1" });
  assert.equal(plain17.status, 200, JSON.stringify(plain17.body));
  for (const to of [enc.slice(0, -1) + "q", encodeLnurl("http://lnurl.test/x"), "lnurl1xyz", "lnurlp://u:p@lnurl.test/x", "lnurlp:///x"]) {
    const bad = await post("address/resolve", { to }, { ip: "10.1.5.1" });
    assert.equal(bad.status, 400, to.slice(0, 40));
  }
});

test("metadata names the display address when it is one, else the input stands", async () => {
  const alias = await post("address/resolve", { to: "alias@lnurl.test" }, { ip: "10.1.6.1" });
  assert.equal(alias.body.address, "someone@else.test");
  const arr = await post("address/resolve", { to: "arrmeta@lnurl.test" }, { ip: "10.1.6.1" });
  assert.equal(arr.body.address, "arr@lnurl.test");
  const bad = await post("address/resolve", { to: "badmeta@lnurl.test" }, { ip: "10.1.6.1" });
  assert.equal(bad.body.address, "badmeta@lnurl.test");
});

test("a switched-off partner is never asked", async () => {
  process.env.YEBENTE_TELEBIRR_HOST = "lnurl.test";
  let asked = 0;
  lnaddr.setLnaddrFetcher(async () => { asked++; return new Response("{}"); });
  try {
    const r = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.1.7.1" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error, /aren't switched on/);
    assert.equal(asked, 0);
  } finally {
    delete process.env.YEBENTE_TELEBIRR_HOST;
    lnaddr.setLnaddrFetcher(testFetcher);
  }
});

test("comments go only where allowed, and short", async () => {
  const quiet = await post("address/invoice", { to: "quiet@lnurl.test", sats: 50, comment: "hello" }, { ip: "10.1.8.1" });
  assert.equal(quiet.status, 200, JSON.stringify(quiet.body));
  assert.equal(cbGot.quiet.comment, null);
  const long = await post("address/invoice", { to: "alice@lnurl.test", sats: 50, comment: "c".repeat(600) }, { ip: "10.1.8.1" });
  assert.equal(long.status, 200);
  assert.equal(cbGot.alice.comment?.length, 140);
});

test("a slow server does not hold the proxy past its timeout", async () => {
  const t = Date.now();
  const r = await post("address/resolve", { to: "slow@lnurl.test" }, { ip: "10.1.9.1" });
  const ms = Date.now() - t;
  assert.equal(r.status, 502);
  assert.ok(ms > 7000 && ms < 9500, `${ms} ms`);
});

test("rate limits: per network and per wallet", async () => {
  // Per network: the 61st lookup and the 31st invoice from one network wait.
  for (let i = 0; i < 60; i++) {
    const r = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.2.0.1" });
    assert.equal(r.status, 200, `lookup ${i}`);
  }
  const capped = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.2.0.1" });
  assert.equal(capped.status, 429);
  assert.match(capped.body.error, /network/);
  for (let i = 0; i < 30; i++) {
    const r = await post("address/invoice", { to: "alice@lnurl.test", sats: 50 }, { ip: "10.2.0.2" });
    assert.equal(r.status, 200, `invoice ${i}`);
  }
  const cappedInv = await post("address/invoice", { to: "alice@lnurl.test", sats: 50 }, { ip: "10.2.0.2" });
  assert.equal(cappedInv.status, 429);
  // Per wallet: a signed-in wallet keeps its own quota wherever it asks from.
  const device = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const w = (await post("wallet/create", { pin: "482916", handle: "lnaddr-prober", device }, { ip: "10.2.0.9" })).body;
  assert.ok(w.session, JSON.stringify(w));
  for (let i = 0; i < 120; i++) {
    const r = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: `10.3.0.${i}`, token: w.session });
    assert.equal(r.status, 200, `wallet lookup ${i}`);
  }
  const cappedW = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.4.0.1", token: w.session });
  assert.equal(cappedW.status, 429);
  assert.equal(cappedW.body.error, "Too many lookups. Try again later.");
  for (let i = 0; i < 60; i++) {
    const r = await post("address/invoice", { to: "alice@lnurl.test", sats: 50 }, { ip: `10.5.0.${i}`, token: w.session });
    assert.equal(r.status, 200, `wallet invoice ${i}`);
  }
  const cappedWI = await post("address/invoice", { to: "alice@lnurl.test", sats: 50 }, { ip: "10.4.0.2", token: w.session });
  assert.equal(cappedWI.status, 429);
  // A bad token is just anonymous: no 401, the network quota applies.
  const anon = await post("address/resolve", { to: "alice@lnurl.test" }, { ip: "10.2.0.3", token: "bogus-token-value-here" });
  assert.equal(anon.status, 200, JSON.stringify(anon.body));
});
