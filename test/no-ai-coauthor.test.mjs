// The AI co-author blocker refuses trailer commits and clean ranges pass, so a
// merge can never land a line that would list a bot as a contributor.
// Run: node --test test/no-ai-coauthor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "deploy/no-ai-coauthor.sh");
const run = (args, cwd = root) => {
  try { execFileSync("sh", [script, ...args], { cwd, encoding: "utf8" }); return 0; }
  catch (err) { return err.status ?? 1; }
};

test("a message carrying an AI trailer is refused, a plain one passes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-coauthor-"));
  const bad = path.join(dir, "bad.txt"), good = path.join(dir, "good.txt");
  fs.writeFileSync(bad, "Fix the leak\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n");
  fs.writeFileSync(good, "Fix the leak\n");
  assert.equal(run(["--message", bad]), 1);
  assert.equal(run(["--message", good]), 0);
});

test("the merge script scans the PR branch for AI trailers before merging", () => {
  const merge = fs.readFileSync(path.join(root, "deploy/merge-pr.sh"), "utf8");
  assert.match(merge, /no-ai-coauthor\.sh "main\.\.\$HEAD"/, "merge-pr.sh refuses a PR branch carrying an AI trailer");
});

test("a range whose branch holds a trailer commit is refused, a clean range passes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-coauthor-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main", ".");
  fs.writeFileSync(path.join(dir, "f.txt"), "1\n");
  git("add", "."); git("commit", "-qm", "Start");
  git("checkout", "-qb", "side");
  fs.writeFileSync(path.join(dir, "f.txt"), "2\n");
  git("add", "."); git("commit", "-qm", "Work\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  assert.equal(run(["main..side"], dir), 1, "the gate refuses a trailer branch");
  assert.equal(run(["side..main"], dir), 0, "the empty range passes");
});
