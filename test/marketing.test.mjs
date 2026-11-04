import test from "node:test";
import assert from "node:assert/strict";
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
  assert.match(html, /id="mktPosts"/, "pane has the posts container");
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  assert.match(js, /loadMarketing/, "renderer loads the schedule");
});
