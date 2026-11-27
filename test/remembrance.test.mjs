// In Remembrance: every entry names a verified person with linked sources,
// and the tracker page renders the section.
// Run: node --test test/remembrance.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REMEMBERED } from "../data/remembrance.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("every remembered builder has years, a project, and linked sources", () => {
  assert.ok(REMEMBERED.length > 0);
  for (const m of REMEMBERED) {
    assert.ok(m.name.length > 0);
    assert.match(m.years, /^\d{4}-\d{4}$/);
    assert.ok(m.project.length > 0);
    assert.ok(m.contribution.length > 0 && m.contribution.length < 400);
    assert.ok(Array.isArray(m.sources) && m.sources.length > 0, "at least one source");
    for (const x of m.sources) {
      assert.ok(x.label.length > 0);
      assert.match(x.url, /^https:\/\//, "https source link");
    }
  }
});

test("the api serves it and the page renders it", () => {
  assert.match(read("api/tracker.js"), /remembrance: REMEMBERED/);
  assert.match(read("tracker.html"), /id="remembered"/);
  assert.match(read("tracker.html"), /T\.remembrance\.map/);
});
