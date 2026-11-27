// Footers: every site footer links all four verified socials as labeled
// icons: GitHub, X, TikTok, LinkedIn.
// Run: node --test test/social.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOCIALS = [
  ["https://github.com/altradits", "GitHub profile"],
  ["https://x.com/altradits", "X profile"],
  ["https://www.tiktok.com/@5tan_lee", "TikTok profile"],
  ["https://www.linkedin.com/in/stanmobitech/", "LinkedIn profile"],
];

function pages(dirent = root, out = []) {
  for (const e of fs.readdirSync(dirent, { withFileTypes: true })) {
    if (e.name === ".claude" || e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dirent, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name.endsWith(".html")) {
      const m = fs.readFileSync(p, "utf8").match(/<footer class="sitefoot">[\s\S]*?<\/footer>/);
      if (m) out.push([p, m[0]]);
    }
  }
  return out;
}

test("every site footer links GitHub, X, TikTok and LinkedIn as labeled icons", () => {
  const files = pages();
  assert.ok(files.length > 10, "footers found");
  for (const [p, foot] of files) {
    const rel = path.relative(root, p);
    for (const [u, label] of SOCIALS) {
      assert.ok(foot.includes(`href="${u}"`), `${rel} links ${u}`);
      assert.ok(foot.includes(`aria-label="${label}"`), `${rel} names ${label}`);
    }
    assert.ok(foot.includes("<svg"), `${rel} uses icons, not text names`);
  }
});
