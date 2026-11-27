// Players page: every card link names its player. Thirty bare "Visit" links
// sound identical to a screen reader; the friends page already says
// "Visit Btrust", so players matches it.
// Run: node --test test/players-links.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "players.html"), "utf8");
const cards = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);

test("no bare Visit link remains", () => {
  assert.doesNotMatch(html, />Visit<\/a>/, "players.html: every Visit names its player");
});

test("each card links out under its own name", () => {
  assert.equal(cards.length, 30, "players.html: 30 cards");
  let named = 0;
  for (const card of cards) {
    const name = card.match(/<h3>(.*?)<\/h3>/)[1];
    assert.ok(card.includes(`>Visit ${name}</a>`), `players.html: Visit ${name} present`);
    if (card.includes(`>Visit ${name}</a>`)) named++;
  }
  assert.equal(named, 30, "players.html: all 30 links named");
});

test("the Minmo card keeps its second link", () => {
  const minmo = cards.find((c) => c.includes("<h3>Minmo</h3>"));
  assert.ok(minmo.includes(">My merged work</a>"), "players.html: My merged work kept");
});
