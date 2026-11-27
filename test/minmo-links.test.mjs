// Minmo links under "Where I've already contributed": repo, open issues,
// issue 56, all repos, maintainer, website. Hrefs compared exact.
// Run: node --test test/minmo-links.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("minmo links row sits under past work with six exact targets", () => {
  const row = html.match(/<div class="links sm" id="minmoLinks">([\s\S]*?)<\/div>/);
  assert.ok(row, "minmoLinks row present");
  assert.ok(html.indexOf('id="done"') < html.indexOf('id="minmoLinks"') && html.indexOf('id="minmoLinks"') < html.indexOf("Review log"), "row sits between past work and the review log");
  const hrefs = [...row[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const want = [
    "https://github.com/minmoto/payment-channels",
    "https://github.com/minmoto/payment-channels/issues",
    "https://github.com/minmoto/payment-channels/issues/56",
    "https://github.com/minmoto",
    "https://github.com/okjodom",
    "https://minmo.to/",
  ].map((u) => new URL(u).href);
  assert.deepEqual(hrefs, want);
});
