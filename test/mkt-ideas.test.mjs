// Ideas board: validation, storage cap, and the admin API behind it.
// Run: node --test test/mkt-ideas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ideas-"));
process.chdir(tmp);
process.env.ADMIN_TOKEN = "secret-admin";
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const { validateIdea, validIdeaImage, MAX_IDEAS, MAX_IMAGE_CHARS, IDEAS_KEY } = await import(`${ROOT}/lib/marketing.js`);
const { getJSON, setJSON } = await import(`${ROOT}/lib/store.js`);
const admin = await import(`${ROOT}/api/admin.js`);

const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).toString("base64");
const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).toString("base64");
const good = { id: "idea1", column: "ideas", title: "Morning sats", caption: "Save a little daily.", imageData: jpeg };

test("a good idea is accepted and cleaned", () => {
  const idea = validateIdea({ ...good, title: "  Spaced  ", caption: "x".repeat(280), placedDate: null }, []);
  assert.equal(idea.title, "Spaced");
  assert.equal(idea.caption.length, 280);
  assert.equal(idea.placedDate, null);
  assert.ok(Date.parse(idea.updatedAt), "the server stamps the save time");
});

test("bad ids and columns are refused with plain words", () => {
  for (const bad of ["x", "has space", "../up", "a".repeat(41), ""]) {
    assert.throws(() => validateIdea({ ...good, id: bad }, []), /bad id/i, JSON.stringify(bad));
  }
  for (const bad of ["todo", "Ideas", ""]) {
    assert.throws(() => validateIdea({ ...good, column: bad }, []), /column/i, JSON.stringify(bad));
  }
  assert.throws(() => validateIdea({ ...good, placedDate: "2026-02-30" }, []), /day/i, "placed date must be real");
});

test("bad titles and captions are refused with plain words", () => {
  assert.throws(() => validateIdea({ ...good, title: "   " }, []), /title/i, "blank title");
  assert.throws(() => validateIdea({ ...good, title: "x".repeat(81) }, []), /80/i, "long title");
  assert.throws(() => validateIdea({ ...good, caption: "x".repeat(281) }, []), /280/i, "long caption");
  assert.equal(validateIdea({ ...good, caption: "" }, []).caption, "", "an empty draft is allowed");
});

test("only real JPEGs pass, and the board caps at 200", () => {
  assert.equal(validIdeaImage(png), false, "PNG is refused for ideas");
  assert.equal(validIdeaImage("data:image/gif;base64,R0lGODw=="), false, "GIF is refused");
  assert.equal(validIdeaImage("data:image/jpeg;base64," + "A".repeat(20)), false, "bad magic is refused");
  assert.equal(validIdeaImage("data:image/jpeg;base64," + "A".repeat(MAX_IMAGE_CHARS)), false, "oversize is refused");
  assert.equal(validateIdea({ ...good, imageData: null }, []).imageData, null, "no picture is allowed");
  const full = Array.from({ length: MAX_IDEAS }, (_, i) => ({ id: `full${i}` }));
  assert.throws(() => validateIdea({ ...good, id: "one-more" }, full), /full/i, "a full board refuses new cards");
  assert.equal(validateIdea({ ...good, id: "full7" }, full).id, "full7", "updating a card on a full board still works");
});

const get = (view, token = "secret-admin") => new Request(`https://altradits.test/api/admin?view=${view}`,
  { headers: { Authorization: `Bearer ${token}` } });
const post = (body, token = "secret-admin") => new Request("https://altradits.test/api/admin",
  { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("ideas need the admin token", async () => {
  assert.equal((await admin.GET(get("mktideas", "wrong"))).status, 401);
  assert.equal((await admin.POST(post({ action: "mkt_idea_save", ...good }, "wrong"))).status, 401);
  assert.equal((await admin.POST(post({ action: "mkt_idea_delete", id: "idea1" }, ""))).status, 401);
});

test("save, list and delete round-trip through the API", async () => {
  const saved = await admin.POST(post({ action: "mkt_idea_save", ...good }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).idea.title, "Morning sats");
  const listed = await (await admin.GET(get("mktideas"))).json();
  assert.equal(listed.ideas.length, 1);
  assert.equal(listed.ideas[0].caption, "Save a little daily.");
  const moved = await admin.POST(post({ action: "mkt_idea_save", ...good, column: "approved" }));
  assert.equal(moved.status, 200);
  assert.equal((await getJSON(IDEAS_KEY))[0].column, "approved");
  const gone = await admin.POST(post({ action: "mkt_idea_delete", id: "idea1" }));
  assert.equal(gone.status, 200);
  assert.deepEqual(await getJSON(IDEAS_KEY), []);
});

test("the API refuses bad columns, long captions, non-JPEGs and a full board", async () => {
  assert.equal((await admin.POST(post({ action: "mkt_idea_save", ...good, column: "todo" }))).status, 400);
  const long = await (await admin.POST(post({ action: "mkt_idea_save", ...good, caption: "x".repeat(281) }))).json();
  assert.match(long.error, /280/);
  const gif = await (await admin.POST(post({ action: "mkt_idea_save", ...good, imageData: png }))).json();
  assert.match(gif.error, /JPEG/);
  await setJSON(IDEAS_KEY, Array.from({ length: MAX_IDEAS }, (_, i) => ({ id: `seed${i}`, column: "ideas", title: `Seed ${i}`, caption: "", imageData: null, placedDate: null })));
  const full = await (await admin.POST(post({ action: "mkt_idea_save", ...good, id: "overflow" }))).json();
  assert.match(full.error, /full/);
  await setJSON(IDEAS_KEY, []);
});

test("the dashboard is wired: board, form, editor and place paths", () => {
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  for (const s of ["view=mktideas", "mkt_idea_save", "mkt_idea_delete", "mktIdeas", "mktIdeaForm", "mktIdeaNew",
    "mktIdeaTitle", "mktIdeaCap", "data-mkt-ie", "data-mkt-col", "mktIdeaOpen", "mktIdeaPlace", "mktIdeaShot", "drafting", "approved"]) {
    assert.ok(js.includes(s), `admin.js mentions ${s}`);
  }
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  for (const s of ['id="mkt-ideas"', 'href="#mkt-ideas"', 'id="mktIdeas"', 'id="mktIdeaForm"', 'id="mktIdeaNew"',
    'id="mktIdeaTitle"', 'id="mktIdeaCap"', 'id="mktIdeaCol"', 'id="mktBoardBtn"', 'id="mktGalleryBtn"']) {
    assert.ok(html.includes(s), `admin.html has ${s}`);
  }
});
