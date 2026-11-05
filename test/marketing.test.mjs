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

// JPEG dimensions without dependencies: walk the markers to the SOF frame.
function jpegDims(full) {
  const buf = fs.readFileSync(full);
  assert.equal(buf[0], 0xff, `${full}: starts with SOI`);
  assert.equal(buf[1], 0xd8, `${full}: starts with SOI`);
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error(`${full}: no SOF frame found`);
}

const tplNum = (t) => Number(t.bg.match(/bg-(\d+)\.jpg$/)[1]);

test("Minimal 2027 templates carry a family and motif, and fit the limits", () => {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, "templates.json"), "utf8"));
  const fams = new Set(["paper", "ink", "split", "frame"]);
  let count = 0;
  for (const t of list) {
    if (tplNum(t) < 72) continue; // the photo and from-posts sets predate families
    count += 1;
    assert.ok(fams.has(t.family), `${t.name}: family is paper, ink, split or frame`);
    assert.ok(Number.isInteger(t.motif) && t.motif >= 1 && t.motif <= 12, `${t.name}: motif is a month 1-12`);
    for (const key of ["file", "bg"]) {
      const full = path.join(ROOT, t[key]);
      assert.ok(fs.statSync(full).size <= 150 * 1024, `${t.name}: ${key} fits 150 KB`);
      assert.deepEqual(jpegDims(full), { w: 1920, h: 1280 }, `${t.name}: ${key} is 1920x1280`);
    }
  }
  assert.ok(count >= 36, `${count} Minimal 2027 templates, want at least 36`);
});

test("the Backgrounds panel groups Minimal 2027 by family, last", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  assert.ok(js.includes("Minimal 2027"), "panel names the Minimal 2027 group");
  assert.ok(js.includes("t.family"), "panel reads the family field");
  assert.ok(js.indexOf("From our posts") < js.indexOf("Minimal 2027"), "Minimal 2027 sits under the existing groups");
});

const months27 = () => months().filter((m) => m.startsWith("2027-"));

test("2027 months cover every day in order with the weekly rhythm", () => {
  const rhythm = { Mon: "Lesson", Tue: "Tip", Wed: "Ye₿ente", Thu: "Myth vs fact", Fri: "Story", Sat: "Question", Sun: "Ye₿ente" };
  for (const m of months27()) {
    const data = monthFile(m);
    const [y, mo] = m.split("-").map(Number);
    const ndays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const want = Array.from({ length: ndays }, (_, d) => `${m}-${String(d + 1).padStart(2, "0")}`);
    assert.deepEqual(data.posts.map((p) => p.date), want, `${m}: every day, in order`);
    for (const p of data.posts) {
      const wd = new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
      assert.equal(p.type, rhythm[wd], `${p.date}: ${wd} is a ${rhythm[wd]} day`);
    }
  }
});

test("2027 copy fits the card rules", () => {
  for (const m of months27()) {
    const data = monthFile(m);
    for (const p of data.posts) {
      const who = p.date;
      assert.ok(p.headline && p.headline.split(" ").length <= 8, `${who}: headline is 1-8 words`);
      assert.ok((p.subline || "").split(" ").filter(Boolean).length <= 14, `${who}: subline is at most 14 words`);
      assert.ok(p.caption.length < 240, `${who}: caption fits 240 characters`);
      assert.ok(p.alt && p.alt.length < 200, `${who}: alt text fits 200 characters`);
      for (const k of ["headline", "subline", "caption", "alt"]) {
        assert.doesNotMatch(p[k] || "", /\u2014/, `${who}: ${k} has no em-dash`);
      }
      assert.ok(p.caption.includes("#Altradits") && p.caption.includes(data.tag), `${who}: both tags present`);
    }
  }
});

test("honest custody: Ye₿ente posts never claim self-custody", () => {
  // Ye₿ente is custodial: no recovery words, with freeze and pause.
  const banned = [/freez/, /froze/, /own keys/, /own money/, /hold your own/,
    /holding your own/, /nobody can/, /self.custody/, /12.words?/, /twelve.words?/, /\bseed\b/,
    /ownership/, /owning/];
  for (const m of months27()) {
    for (const p of monthFile(m).posts) {
      if (p.type !== "Ye₿ente") continue;
      const text = [p.headline, p.subline, p.caption, p.alt].join(" ").toLowerCase();
      for (const re of banned) {
        assert.doesNotMatch(text, re, `${p.date}: Ye₿ente post claims ${re}`);
      }
    }
  }
});

test("no headline or caption repeats across 2026 and 2027", () => {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  // 2026 headlines live only inside alt text, always as the opening words.
  const words26 = [];
  for (const m of months()) {
    if (!m.startsWith("2026-")) continue;
    for (const p of monthFile(m).posts) {
      words26.push([norm(p.alt.split(":").slice(1).join(":")), p.date]);
    }
  }
  const heads = new Map(), caps = new Map();
  for (const m of months()) {
    const data = monthFile(m);
    for (const p of data.posts) {
      const head = p.headline ? norm(p.headline) : norm(p.alt.split(":").slice(1).join(":"));
      assert.ok(!heads.has(head), `${p.date}: headline repeats ${heads.get(head)}`);
      heads.set(head, p.date);
      if (p.headline) {
        const clash = words26.find(([w]) => w.startsWith(head));
        assert.ok(!clash, `${p.date}: headline opens the 2026 card of ${clash && clash[1]}`);
      }
      assert.ok(!caps.has(norm(p.caption)), `${p.date}: caption repeats ${caps.get(norm(p.caption))}`);
      caps.set(norm(p.caption), p.date);
    }
  }
});

test("2027 cards reuse backgrounds within the limits", () => {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, "templates.json"), "utf8"));
  const byBg = new Map(list.map((t) => [t.bg, t]));
  for (const m of months27()) {
    const data = monthFile(m);
    const mo = Number(m.slice(5));
    const use = new Map();
    let prev = null;
    for (const p of data.posts) {
      const t = byBg.get(p.bg);
      assert.ok(t, `${p.date}: background ${p.bg} is listed`);
      assert.equal(t.motif, mo, `${p.date}: background motif matches the month`);
      assert.notEqual(p.bg, prev, `${p.date}: background differs from yesterday`);
      prev = p.bg;
      use.set(p.bg, (use.get(p.bg) || 0) + 1);
    }
    for (const [bg, c] of use) {
      assert.ok(c <= 6, `${m}: ${bg} appears ${c}x, max 6`);
    }
  }
});

test("2027 card images are 1920x1280 and under 150 KB", () => {
  for (const m of months27()) {
    for (const p of monthFile(m).posts) {
      const full = path.join(ROOT, p.image);
      assert.ok(fs.statSync(full).size <= 150 * 1024, `${p.date}: fits 150 KB`);
      assert.deepEqual(jpegDims(full), { w: 1920, h: 1280 }, `${p.date}: 1920x1280`);
    }
  }
});
