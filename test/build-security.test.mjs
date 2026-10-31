// Build-stage security guard: the rules learned in the October 2026 audit,
// checked on every test run (and in CI on every pull request), so a change
// can't quietly reopen a hole. A failure here names the rule and the fix.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const files = (dir, ext = /\.(m?js)$/) => fs.readdirSync(path.join(root, dir)).filter((f) => ext.test(f)).map((f) => `${dir}/${f}`);
const SERVER = [...files("lib"), ...files("api"), "server.mjs"];

test("every page carries its own up-to-date Content-Security-Policy (nginx sends pages without headers)", async () => {
  const { pages, withPolicy } = await import("../deploy/page-csp.mjs");
  for (const f of pages()) {
    const html = read(f);
    assert.equal(withPolicy(html), html, `${f}: policy missing or stale. Run: node deploy/page-csp.mjs`);
  }
  const yb = read("yebente/app/index.html");
  assert.match(yb, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/, "Ye₿ente's built page keeps its policy (rebuild: cd yebente && npm run build)");
  assert.match(read("yebente/src/main.tsx"), /window\.top !== window\.self/, "Ye₿ente refuses to load inside a frame");
});

test("every page refuses to load inside another site's frame (a meta policy can't forbid framing)", () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html"))) {
    const html = read(f), srcs = [...html.matchAll(/<script[^>]*\bsrc="\/(assets\/[\w.-]+\.js)"/g)].map((m) => read(m[1])).join("\n");
    assert.match(html + srcs, /window\.top !== window\.self/, `${f}: add the frame check at the top of its script`);
    assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, `${f}: the Security watch reporter is missing (run: node deploy/page-csp.mjs)`);
  }
});

test("pages have no inline event handlers or javascript: links (the policy would block them, and they invite injection)", () => {
  for (const f of [...fs.readdirSync(root).filter((x) => x.endsWith(".html")), "yebente/app/index.html"]) {
    const html = read(f);
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=\s*["']/i, `${f}: move the inline handler into the page script`);
    assert.doesNotMatch(html, /href\s*=\s*["']\s*javascript:/i, `${f}: no javascript: links`);
  }
});

// Direct fetch() calls in server code, each to a fixed, configured service. Anything a
// visitor or an outside reply can point somewhere goes through lib/netsafe.js publicFetch
// (public IPs only, checked at connect time). A new fetch() here fails until it is
// either moved to publicFetch or reviewed and added with its reason.
const FIXED_FETCH = {
  "lib/notify.js": ["u"], // api.callmebot.com, built from a constant
  "lib/store.js": ["REST_URL"], // Upstash, from the environment
  "lib/social.js": ["url"], // social network APIs, constant bases
  "lib/lightning.js": ["url", '"https://open.er-api.com/v6/latest/USD"', "`${base}/fee-estimates`", "`${base}/v1/fees/recommended`", "`${base}/address/${address}`", "`${base}/address/${address}/txs`", "`${base}/blocks/tip/height`"], // price and mempool APIs (CHAIN_APIS)
  "lib/email.js": ['"https://api.resend.com/emails"'],
  "api/kits.js": ["this.action"], // browser code inside the unsubscribe page, posting to our own URL
  "api/yebente.js": ["`${DARAJA()}/oauth/v1/generate?grant_type=client_credentials`", "`${DARAJA()}${path}`"], // Safaricom
};
// The first argument of a call, brackets and template braces balanced.
function firstArg(src, i) {
  let depth = 0, out = "";
  for (; i < src.length; i++) {
    const c = src[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === "," && depth === 0) break;
    out += c;
  }
  return out.trim();
}
test("server code only fetches fixed services directly; everything else uses the public-address guard", () => {
  for (const f of SERVER) {
    if (f === "lib/netsafe.js") continue;
    const src = read(f).replace(/^\s*\/\/.*$/gm, "");
    const calls = [...src.matchAll(/(?<![\w.])fetch\(/g)].map((m) => firstArg(src, m.index + m[0].length));
    for (const arg of calls) assert.ok((FIXED_FETCH[f] || []).includes(arg), `${f}: fetch(${arg}) — use publicFetch from lib/netsafe.js for any address others can influence, or add it to FIXED_FETCH with its reason`);
  }
});

// Public endpoints are rate-limited. These are the reviewed exceptions.
const NO_LIMIT_OK = {
  "api/cron.js": "needs CRON_SECRET",
  "api/hunt.js": "limits live in lib/hunt.js",
  "api/kits.js": "limits live in lib/subscribers.js",
};
test("every public API file has rate limits (or a reviewed reason)", () => {
  for (const f of files("api")) {
    if (NO_LIMIT_OK[f]) continue;
    assert.match(read(f), /\b(hit|peek)\(/, `${f}: add per-visitor and site-wide limits with hit() from lib/store.js`);
  }
  assert.match(read("lib/hunt.js"), /\bhit\(/);
  assert.match(read("lib/subscribers.js"), /\bhit\(/);
});

test("secrets are never logged, compared with ===, or made with Math.random", () => {
  const SECRET = /process\.env\.[A-Z_]*(TOKEN|SECRET|KEY|MACAROON|PASS|PASSWORD)\b/;
  for (const f of SERVER) {
    const lines = read(f).split("\n");
    lines.forEach((l, i) => {
      const logged = l.match(/console\.(?:log|error|warn|info)\((.*)$/)?.[1];
      if (logged) assert.doesNotMatch(logged, SECRET, `${f}:${i + 1} logs a secret`);
      assert.doesNotMatch(l, /(===|!==)\s*process\.env\.[A-Z_]*(TOKEN|SECRET)\b|process\.env\.[A-Z_]*(TOKEN|SECRET)\s*(===|!==)/, `${f}:${i + 1}: compare secrets with safeEqual (constant time)`);
      assert.doesNotMatch(l, /Math\.random\(/, `${f}:${i + 1}: use node:crypto for anything random on the server`);
    });
  }
});

test("money: a Lightning payment is refunded only on the node's own final answer", () => {
  const ln = read("lib/lightning.js");
  const pay = ln.slice(ln.indexOf("export async function payInvoice"), ln.indexOf("// What the node can send right now"));
  const failed = [...pay.matchAll(/status: "failed"/g)].length;
  assert.equal(failed, 2, "payInvoice: \"failed\" only when sending is off or the node says FAILED; every other answer is \"unknown\"");
  assert.match(pay, /p\.status === "FAILED"\) return \{ status: "failed"/);
  const yw = read("lib/ywallet.js");
  assert.match(yw, /if \(Date\.now\(\) - Date\.parse\(p\.at\) < SETTLE_AFTER\) continue;/, "reconcilePayments leaves payments that may still be on their way alone");
});

test("Bitcoin-history guards stay in place (confirmations by amount, 21M cap, description hash, solvency)", () => {
  const ln = read("lib/lightning.js"), pay = read("api/pay.js"), yw = read("lib/ywallet.js"), srv = read("server.mjs");
  assert.match(ln, /export const confirmationsFor = \(sats\) => \(sats >= 10_000_000 \? 6 : sats >= 1_000_000 \? 3 : 1\)/, "confirmation tiers (whitepaper section 11)");
  assert.match(ln, /num_confirmations\) >= depth/, "the node's own record must be as deep as the amount requires");
  assert.match(pay, /addressReceived\(p\.onchain\.address, confirmationsFor\(/, "checkout waits for the right depth");
  assert.match(yw, /sats > MAX_MONEY\) throw err\("That amount isn't possible\."\)/, "credits capped at 21 million BTC");
  assert.match(yw, /bolt11DescriptionHash\(pr\)/, "LNURL invoices must match the description hash");
  assert.match(srv, /checkSolvency\(\)/, "the hourly solvency check runs");
});

test("access: no code joins records or hands over a portal on an unconfirmed email", () => {
  for (const f of SERVER) {
    const src = read(f);
    assert.doesNotMatch(src, /portalToken\s*=\s*(prior|other|existing|match)\w*\.portalToken/, `${f}: a portal link goes only to its owner`);
    assert.doesNotMatch(src, /\.leadId\s*=\s*lead\.id;[\s\S]{0,80}mergedInto/, `${f}: records are merged by Stanley in the admin, not on a typed email`);
  }
});

test("tests never load project modules before moving into their temporary folder", () => {
  // Static imports run before any statement, so they would open the repository's own .data store.
  for (const f of fs.readdirSync(path.join(root, "test")).filter((x) => x.endsWith(".test.mjs"))) {
    const src = read(`test/${f}`);
    if (!/process\.chdir\(/.test(src)) continue;
    assert.doesNotMatch(src, /^import\s[^;]*from\s+["']\.\.\/(lib|api|data)\//m, `test/${f}: import project modules with await import() after process.chdir()`);
  }
});

test("every Markdown file at the top level is denied to the web server", () => {
  const deny = read(".htaccess").match(/<FilesMatch "\^\(([^"]+)\)\$">/)[1];
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".md")))
    assert.ok(new RegExp(`^(${deny})$`).test(f), `${f}: add it to the FilesMatch deny list in .htaccess`);
});

test("signing stays available: the trusted-keys file, the verify script and the server option stay in place", () => {
  assert.match(read(".github/allowed_signers"), /^altradits@gmail\.com namespaces="git" ssh-ed25519 /m, "a trusted signing key");
  assert.match(read("deploy/verify-commits.sh"), /TRUST_ROOT=3c9ca96542d750fc51b62df42cb93be251920c09/, "the trust root never moves");
  assert.match(read("deploy/cron.sh"), /verify-commits\.sh origin\/main "\$SIGNERS"/, "the server refuses unsigned code");
  assert.match(read(".githooks/pre-push"), /force-push/, "the local gate refuses force-pushes to main");
});

test("no AI co-authors: the check runs in CI, before every push and on every commit message", () => {
  assert.match(read(".github/workflows/test.yml"), /sh deploy\/no-ai-coauthor\.sh HEAD/, "CI checks every commit");
  assert.match(read(".github/workflows/test.yml"), /fetch-depth: 0/, "CI sees the whole history");
  assert.match(read(".githooks/pre-push"), /no-ai-coauthor\.sh/, "the local gate checks pushed commits");
  assert.match(read(".githooks/commit-msg"), /no-ai-coauthor\.sh --message/, "the commit-msg hook checks each message");
});

test("every top-level folder is either public on purpose or denied to the web server", () => {
  const PUBLIC = new Set(["assets"]); // pages' own scripts, styles and images
  const DOT = /^\./; // nginx refuses dot-folders (.git, .github, .claude); .htaccess adds 404s
  for (const d of fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name)) {
    if (PUBLIC.has(d) || DOT.test(d) || d === "node_modules" || d === "tmp") continue; // node_modules gets deploy/deny.htaccess on the server
    const ht = path.join(root, d, ".htaccess");
    assert.ok(fs.existsSync(ht) && /Require all denied/.test(fs.readFileSync(ht, "utf8")), `${d}/: add an .htaccess that denies the web server (copy deploy/deny.htaccess), or list it as public here`);
  }
  assert.match(read("deploy/cron.sh"), /deny\.htaccess node_modules\/\.htaccess/, "dependencies stay unservable");
});

test("no secrets committed: keys, tokens, macaroons or private keys in any tracked file", async () => {
  const { execFileSync } = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|zip)$/i.test(f) && !f.startsWith("yebente/app/assets/"));
  const PATTERNS = [
    ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
    ["Resend key", /\bre_[A-Za-z0-9]{20,}/],
    ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
    ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["LND macaroon", /\b0201036c6e64[0-9a-f]{40,}/i],
    ["Upstash token", /\bA[A-Za-z0-9]{40,}=*\b(?=.*upstash)/i],
  ];
  for (const f of tracked) {
    let text;
    try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    for (const [what, re] of PATTERNS) assert.doesNotMatch(text, re, `${f}: looks like a committed ${what}. Remove it, rotate it, and keep it in the host's settings`);
  }
  assert.ok(!tracked.some((f) => /(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith(".example")), "no .env file is tracked");
});
