// Free forever: the creed, the corrected quote, and the second voice.
// Run: node --test test/free-forever.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("the creed credits Brand with a source link", () => {
  assert.match(html, /Information wants to be free\./);
  assert.match(html, /Stewart Brand, Hackers Conference, 1984/);
  assert.match(html, /https:\/\/en\.wikipedia\.org\/wiki\/Information_wants_to_be_free/);
});

test("the proverb stands as a proverb, the second line as Stanley's", () => {
  assert.match(html, /Il sapere non occupa spazio\./);
  assert.match(html, /An Italian proverb/);
  assert.match(html, /no source ties this line to Leonardo da Vinci/);
  assert.match(html, /Ricorda: continua a esplorare e crescere\./);
  assert.match(html, /Stanley&#39;s line|Stanley's line/);
});

test("contact, donate, video link and the second voice button exist", () => {
  assert.match(html, /href="\/contact">Contact<\/a>/);
  assert.match(html, /href="\/donate">Donate<\/a>/);
  assert.match(html, /tiktok\.com\/@5tan_lee\/video\/7435272500571032888/);
  assert.match(html, /id="sayQuote"[^>]*data-say="[^"]+"/);
  assert.match(html, /new SpeechSynthesisUtterance\(say\.dataset\.say/);
});
