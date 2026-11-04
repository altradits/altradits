import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// CodeQL js/polynomial-redos and js/incomplete-sanitization: hostile input
// and strange configuration must stay cheap and literal. No network: the
// wallet's fetcher throws if these paths ever reach for it.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-regex-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "LND_INVOICE_MACAROON"]) delete process.env[k];
process.env.SITE_URL = "https://my+site.com";
const { etagMatches, escapeRegExp } = await import("../lib/http.js");
const yw = await import("../lib/ywallet.js");
yw.setLnurlFetcher(() => { throw new Error("must not fetch"); });

test("etagMatches: our copy among the visitor's, however spaced", () => {
  assert.equal(etagMatches('W/"a-b"', 'W/"a-b"'), true);
  assert.equal(etagMatches('W/"x", W/"a-b",W/"y"', 'W/"a-b"'), true);
  assert.equal(etagMatches('W/"x", W/"y"', 'W/"a-b"'), false);
  assert.equal(etagMatches("", 'W/"a-b"'), false);
  assert.equal(etagMatches(null, 'W/"a-b"'), false);
});

test("etagMatches: a hostile header costs a linear scan, not an explosion", () => {
  const evil = " \t,".repeat(20000) + "x".repeat(20000);
  const t0 = Date.now();
  assert.equal(etagMatches(evil, 'W/"a-b"'), false);
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
});

test("escapeRegExp: every expression character is quoted", () => {
  assert.equal(escapeRegExp("my+site.com"), "my\\+site\\.com");
  assert.equal(new RegExp(`^${escapeRegExp("my+site.com")}$`).test("my+site.com"), true);
  assert.equal(new RegExp(`^${escapeRegExp("my+site.com")}$`).test("myysite.com"), false);
});

test("own handle: a + in the configured domain is literal", async () => {
  assert.deepEqual(await yw.resolveDestination("jomo@my+site.com"), { kind: "handle", handle: "jomo" });
});

test("own lnurlp code: matches itself, never a lookalike", async () => {
  assert.deepEqual(await yw.resolveDestination("lnurlp://my+site.com/.well-known/lnurlp/jomo"), { kind: "handle", handle: "jomo" });
  await assert.rejects(yw.resolveDestination("lnurlp://myysite.com/.well-known/lnurlp/jomo"));
});

test("normal domain: dots stay literal too", async () => {
  process.env.SITE_URL = "https://altradits.com";
  try {
    assert.deepEqual(await yw.resolveDestination("jomo@altradits.com"), { kind: "handle", handle: "jomo" });
    await assert.rejects(yw.resolveDestination("jomo@altraditsxcom"));
  } finally {
    process.env.SITE_URL = "https://my+site.com";
  }
});
