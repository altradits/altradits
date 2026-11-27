// Footers: every standard site footer links all four verified socials.
// Run: node --test test/social.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOCIALS = [
  "https://github.com/altradits",
  "https://x.com/altradits",
  "https://www.tiktok.com/@5tan_lee",
  "https://www.linkedin.com/in/stanmobitech/",
];

function pages(dirent = root, out = []) {
  for (const e of fs.readdirSync(dirent, { withFileTypes: true })) {
    if (e.name === ".claude" || e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dirent, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name.endsWith(".html") && fs.readFileSync(p, "utf8").includes('class="sitefoot"')) out.push(p);
  }
  return out;
}

test("every site footer links GitHub, X, TikTok and LinkedIn", () => {
  const files = pages();
  assert.ok(files.length > 10, "footers found");
  for (const f of files) {
    const html = fs.readFileSync(f, "utf8");
    const foot = html.slice(html.indexOf('class="sitefoot"'));
    for (const u of SOCIALS) assert.ok(foot.includes(u), `${path.relative(root, f)} links ${u}`);
  }
});
