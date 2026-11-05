// Custom calendar posts: validation, merge order, and dashboard wiring.
// Run: node --test test/mkt-custom.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const { validateCustomPost, mergeCustomPosts, validDay, MAX_IMAGE_CHARS } = await import(path.join(ROOT, "lib/marketing.js"));
const MONTHS = ["2026-11", "2026-12"];
const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).toString("base64");
const good = { month: "2026-12", date: "2026-12-25", caption: "Merry Bitcoinmas. Open yours: altradits.com #Altradits", imageData: jpeg };

test("a good custom post is accepted and cleaned", () => {
  const p = validateCustomPost({ ...good, caption: "  Hello.  ", alt: "" }, MONTHS);
  assert.equal(p.date, "2026-12-25");
  assert.equal(p.caption, "Hello.");
  assert.ok(p.alt.length > 0, "alt falls back to something");
  assert.equal(p.imageData, jpeg);
});

test("bad months and days are refused with plain words", () => {
  for (const bad of ["12", "2026-13", "2026-1", "../x"]) {
    assert.throws(() => validateCustomPost({ ...good, month: bad }, MONTHS), /month/i, bad);
  }
  assert.throws(() => validateCustomPost({ ...good, month: "2026-10" }, MONTHS), /month/i, "off-schedule month");
  for (const bad of ["2026-12-32", "2026-12-00", "not-a-day", "2026-11-25"]) {
    assert.throws(() => validateCustomPost({ ...good, date: bad }, MONTHS), /day/i, bad);
  }
  assert.equal(validDay("2026-02-30"), false, "Feb 30 is not a day");
  assert.equal(validDay("2026-12-25"), true);
});

test("bad captions and pictures are refused with plain words", () => {
  assert.throws(() => validateCustomPost({ ...good, caption: "   " }, MONTHS), /caption/i, "blank");
  assert.throws(() => validateCustomPost({ ...good, caption: "x".repeat(281) }, MONTHS), /280/i, "long");
  assert.throws(() => validateCustomPost({ ...good, imageData: "data:image/gif;base64,R0lGODw==" }, MONTHS), /picture/i, "gif");
  assert.throws(() => validateCustomPost({ ...good, imageData: "data:image/jpeg;base64," + "A".repeat(20) }, MONTHS), /picture/i, "bad magic");
  assert.throws(() => validateCustomPost({ ...good, imageData: "data:image/jpeg;base64," + "A".repeat(MAX_IMAGE_CHARS) }, MONTHS), /picture/i, "huge");
  assert.throws(() => validateCustomPost({ ...good, imageData: undefined }, MONTHS), /picture/i, "missing");
});

test("custom posts win by date and everything stays in day order", () => {
  const posts = [{ date: "2026-12-01" }, { date: "2026-12-20" }];
  const out = mergeCustomPosts(posts, [{ date: "2026-12-20", caption: "mine" }, { date: "2026-12-05", caption: "new" }]);
  assert.deepEqual(out.map((p) => p.date), ["2026-12-01", "2026-12-05", "2026-12-20"]);
  assert.equal(out[2].caption, "mine", "custom wins the day");
  assert.equal(out[2].custom, true);
  assert.deepEqual(mergeCustomPosts(posts, null).map((p) => p.date), ["2026-12-01", "2026-12-20"]);
});

test("the dashboard is wired: editor, place, remove, overlay", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");
  for (const s of ["drawCustom", "mkt_place", "mkt_remove", "view=mktcustom", "data-mkt-edit", "toDataURL"]) {
    assert.ok(js.includes(s), `admin.js mentions ${s}`);
  }
  assert.match(js, /<figure data-mkt-edit/, "the whole card opens the editor, not just the button");
  assert.match(js, /closest\("a"\)\) return/, "download links are spared from the editor click");
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  for (const s of ['id="mktCanvas"', 'id="mktHead"', 'id="mktPlace"', 'id="mktUnplace"', 'id="mktICap"']) {
    assert.ok(html.includes(s), `admin.html has ${s}`);
  }
});

test("the editor moves parts, swaps the logo ink, and offers fonts", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");
  for (const s of ["pointerdown", "keydown", "dblclick", "MKT_FONTS", "mktHFont", "mktSFont", "mktLogoWhite", "mktReset", "logo-white.png", "drawCustom(false)", "toDataURL"]) {
    assert.ok(js.includes(s), `admin.js mentions ${s}`);
  }
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  for (const s of ['id="mktHFont"', 'id="mktSFont"', 'id="mktLogoWhite"', 'id="mktReset"', 'tabindex="0"']) {
    assert.ok(html.includes(s), `admin.html has ${s}`);
  }
});

test("every dashboard selector starts with # and its element exists", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");
  const bare = [...js.matchAll(/\$\(\s*["'`]([^"'`#}][^"'`]*?)["'`]/g)].map((m) => m[1]);
  assert.deepEqual(bare, [], `selectors missing #: ${bare.join(", ")}`);
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  const ids = new Set([...js.matchAll(/\$\(\s*["'`]#([A-Za-z][\w-]*)["'`]/g)].map((m) => m[1]));
  assert.ok(ids.size > 50, "plenty of selectors checked");
  for (const id of ids) {
    const made = html.includes(`id="${id}"`) || js.includes(`id="${id}"`);
    assert.ok(made, `#${id} exists in the page or in rendered markup`);
  }
});
