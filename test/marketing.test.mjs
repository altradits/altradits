import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The marketing schedule behind the dashboard's Marketing tab: one manifest
// listing the months, one data file per month, one image per post. The tab
// renders any listed month, so a new month reuses the tab unchanged.
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "assets", "marketing");

const months = () => JSON.parse(fs.readFileSync(path.join(DIR, "months.json"), "utf8"));
const monthFile = (m) => JSON.parse(fs.readFileSync(path.join(DIR, `${m}.json`), "utf8"));

test("manifest lists month files that exist and parse", () => {
  const list = months();
  assert.ok(Array.isArray(list) && list.length > 0, "months.json lists at least one month");
  for (const m of list) {
    assert.match(m, /^\d{4}-\d{2}$/, `${m}: month looks like YYYY-MM`);
    const data = monthFile(m);
    assert.equal(data.month, m, `${m}: file names its own month`);
    assert.match(data.tag, /^#[A-Za-z0-9]+$/, `${m}: month tag is one hashtag`);
    assert.ok(Array.isArray(data.posts) && data.posts.length > 0, `${m}: at least one post`);
  }
});

test("every post fits X and carries the tags", () => {
  for (const m of months()) {
    const data = monthFile(m);
    for (const [i, p] of data.posts.entries()) {
      const who = `${m} post ${i + 1}`;
      assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, `${who}: date looks like YYYY-MM-DD`);
      assert.ok(!Number.isNaN(new Date(`${p.date}T00:00:00Z`).getTime()), `${who}: date is real`);
      assert.ok(p.caption && p.caption.length <= 280, `${who}: caption fits an X post`);
      assert.doesNotMatch(p.caption, /\u2014/, `${who}: house style, no em-dashes`);
      assert.ok(p.caption.includes("#Altradits"), `${who}: standing tag present`);
      assert.ok(p.caption.includes(data.tag), `${who}: month tag present`);
      assert.ok(p.alt && p.alt.length > 0, `${who}: image alt text present`);
    }
  }
});

test("every post image exists, and every month image is used", () => {
  for (const m of months()) {
    const data = monthFile(m);
    const used = new Set();
    for (const [i, p] of data.posts.entries()) {
      const who = `${m} post ${i + 1}`;
      assert.match(p.image, /\.jpg$/, `${who}: image is a jpg`);
      const full = path.join(ROOT, p.image);
      assert.ok(fs.existsSync(full), `${who}: ${p.image} exists`);
      assert.ok(fs.statSync(full).size > 1024, `${who}: image is not empty`);
      used.add(path.basename(p.image));
    }
    const dir = path.join(DIR, m);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jpg"))) {
      assert.ok(used.has(f), `${m}: ${f} is referenced by a post`);
    }
  }
});

test("the Marketing tab, pane and renderer exist", () => {
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  assert.match(html, /data-tab="marketing"/, "nav has the Marketing tab");
  assert.match(html, /data-pane="marketing"/, "page has the marketing pane");
  assert.match(html, /id="mktMonth"/, "pane has the month picker");
  assert.match(html, /id="mktPrev"/, "pane has the previous-month button");
  assert.match(html, /id="mktNext"/, "pane has the next-month button");
  assert.match(html, /id="mktCal"/, "pane has the calendar grid");
  assert.match(html, /id="mktPosts"/, "pane has the posts container");
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  assert.match(js, /loadMarketing/, "renderer loads the schedule");
  assert.match(js, /renderCalendar/, "renderer builds the calendar grid");
  assert.match(js, /mktSel/, "renderer marks the selected day");
  assert.match(js, /xpost/, "renderer shows posts as X cards");
  assert.match(js, /p\.video/, "renderer branches on the video key");
  assert.match(js, /<video/, "video posts render a player, not a bare image");
  assert.match(js, /months\.json", \{ cache: "no-store" \}/, "month list is always fetched fresh, never cached");
  assert.match(js, /encodeURIComponent\(month\)\}\.json`, \{ cache: "no-store" \}/, "month data is always fetched fresh, never cached");
});

test("every post video exists, and every month video is used", () => {
  for (const m of months()) {
    const data = monthFile(m);
    const used = new Set();
    for (const [i, p] of data.posts.entries()) {
      if (!p.video) continue;
      const who = `${m} post ${i + 1}`;
      assert.match(p.video, /\.mp4$/, `${who}: video is an mp4`);
      const full = path.join(ROOT, p.video);
      assert.ok(fs.existsSync(full), `${who}: ${p.video} exists`);
      assert.ok(fs.statSync(full).size > 10 * 1024, `${who}: video is not empty`);
      used.add(path.basename(p.video));
    }
    const dir = path.join(DIR, m);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mp4"))) {
        assert.ok(used.has(f), `${m}: ${f} is referenced by a post`);
      }
    }
  }
});

test("every post template is unique", () => {
  for (const m of months()) {
    const data = monthFile(m);
    const hashes = new Set();
    for (const [i, p] of data.posts.entries()) {
      const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, p.image))).digest("hex");
      assert.ok(!hashes.has(h), `${m} post ${i + 1}: its template image differs from the rest`);
      hashes.add(h);
    }
  }
});

test("the blank template gallery lists unique branded files", () => {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, "templates.json"), "utf8"));
  assert.ok(list.length >= 10, "at least ten reusable templates");
  const hashes = new Set(), names = new Set(), bgs = new Set();
  for (const t of list) {
    assert.match(t.file, /\.jpg$/, `${t.name}: template is a jpg`);
    const full = path.join(ROOT, t.file);
    assert.ok(fs.existsSync(full), `${t.name}: ${t.file} exists`);
    assert.ok(fs.statSync(full).size > 10 * 1024, `${t.name}: template is not empty`);
    const h = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    assert.ok(!hashes.has(h), `${t.name}: differs from every other template`);
    hashes.add(h);
    assert.ok(!names.has(t.name), `${t.name}: name is used once`);
    names.add(t.name);
    assert.ok(!bgs.has(t.bg), `${t.name}: background file is used once`);
    bgs.add(t.bg);
  }
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  assert.match(html, /id="mktTpl"/, "pane has the templates gallery");
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  assert.match(js, /templates\.json", \{ cache: "no-store" \}/, "gallery loads fresh, never cached");
});

test("post types come from the fixed list of six", () => {
  const fixed = new Set(["Lesson", "Ye₿ente", "Myth vs fact", "Story", "Tip", "Question"]);
  for (const m of months()) {
    const data = monthFile(m);
    for (const [i, p] of data.posts.entries()) {
      const who = `${m} post ${i + 1}`;
      if (p.type === undefined) continue; // untyped posts get the neutral tile
      assert.ok(fixed.has(p.type), `${who}: type is one of the six, got ${JSON.stringify(p.type)}`);
      assert.ok(p.type.split(" ").length <= 3, `${who}: label fits a tile`);
    }
  }
});

test("the studio header, sub-nav and sections exist", () => {
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  assert.match(html, /id="hMktStudio"/, "studio header names the tab");
  assert.match(html, /Plan, design and place X posts\. Nothing here posts anything by itself\./, "header says what it is");
  assert.match(html, /href="#mkt-cal"/, "sub-nav jumps to the calendar");
  assert.match(html, /href="#mkt-edit"/, "sub-nav jumps to the editor");
  assert.match(html, /id="mkt-cal"/, "calendar section is an anchor target");
  assert.match(html, /id="mkt-edit"/, "editor section is an anchor target");
  assert.match(html, /<details class="mktRules">/, "the house rules fold into a details element");
  const cal = html.indexOf('data-pane="marketing"');
  assert.ok(html.indexOf('id="mkt-cal"', cal) < html.indexOf('id="mkt-edit"', cal), "calendar comes before the editor");
  assert.ok(html.indexOf('id="mkt-edit"', cal) < html.indexOf('<details class="mktRules">', cal), "the rules sit last");
});

test("the calendar renders tiles, a legend, counts and keyboard days", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  for (const s of ["MKT_TYPES", "mktTile", "mkt-t-none", "mktLegend", "mktMonthName", "data-mkt-new", "aria-label", "scope=\"col\"", "ArrowDown", "mkt-edit", "tabFromHash"]) {
    assert.ok(js.includes(s), `admin.js mentions ${s}`);
  }
  assert.match(js, /Myth vs fact/, "the six fixed types are listed");
  assert.match(js, /custom} custom/, "the header counts custom posts");
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  for (const s of [".mktTile", ".mktEmptyDay", ".mktLegend", ".mktMonthName", ".mktWrap", "mkt-t-lesson", "mkt-t-yebente", "mkt-t-myth", "mkt-t-story", "mkt-t-tip", "mkt-t-question"]) {
    assert.ok(html.includes(s), `admin.html styles ${s}`);
  }
});

test("templates carry clean backgrounds and light-or-dark defaults", () => {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, "templates.json"), "utf8"));
  for (const t of list) {
    assert.match(t.bg, /\.jpg$/, `${t.name}: editor background is a jpg`);
    const full = path.join(ROOT, t.bg);
    assert.ok(fs.existsSync(full), `${t.name}: ${t.bg} exists`);
    assert.ok(fs.statSync(full).size > 10 * 1024, `${t.name}: background is not empty`);
    assert.ok(t.ink === "white" || t.ink === "navy", `${t.name}: logo ink is white or navy`);
    assert.equal(typeof t.light, "boolean", `${t.name}: light-words default is a yes/no`);
  }
});
