// What code is live: the deployed commit, read once from git. Answers "unknown"
// when this isn't a checkout, so a missing .git never breaks the dashboard.
import { execFileSync } from "node:child_process";

let cache = null;
export function deployInfo() {
  if (cache) return cache;
  try {
    const root = new URL("..", import.meta.url).pathname;
    const [commit, subject, at] = execFileSync("git", ["log", "-1", "--format=%H%n%s%n%cI"], { cwd: root, encoding: "utf8", timeout: 5000 }).trim().split("\n");
    cache = /^[0-9a-f]{40}$/.test(commit || "")
      ? { commit: commit.slice(0, 12), subject: (subject || "").slice(0, 120), at: at || null }
      : { commit: "unknown", subject: "", at: null };
  } catch { cache = { commit: "unknown", subject: "", at: null }; }
  return cache;
}
