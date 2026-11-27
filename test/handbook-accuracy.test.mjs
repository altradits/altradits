// The security handbook must match the shipped site: only the admin page
// exists as a private noindex page, and request bodies cap at 100 kB,
// 1 MB on the admin endpoint with the admin token.
// Run: node --test test/handbook-accuracy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

test("only the admin page stands as a private noindex page", () => {
  for (const retired of ["portal.html", "team.html", "proposal.html", "collect.html"]) {
    assert.equal(exists(retired), false, `${retired} stays retired`);
  }
  assert.equal(exists("admin.html"), true, "admin.html exists");
  assert.match(read("admin.html"), /<meta name="robots" content="noindex">/, "admin.html carries noindex");
  const doc = read("docs/security-handbook.md");
  assert.doesNotMatch(doc, /portal|proposal|collect/, "handbook names no retired page");
  assert.doesNotMatch(doc, /\(admin, /, "handbook lists no page group");
  assert.match(doc, /private admin page is noindex/, "handbook names the admin page");
});

test("request body caps match the server gate", () => {
  const server = read("server.mjs");
  assert.match(server, /\? 1_000_000 : 100_000/, "server.mjs: 1 MB admin cap, 100 kB default");
  const doc = read("docs/security-handbook.md");
  assert.doesNotMatch(doc, /8 MB/, "handbook claims no 8 MB cap");
  assert.match(doc, /100 kB; 1 MB on the admin endpoint with the admin token/, "handbook states both caps");
});
