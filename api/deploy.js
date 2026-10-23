// POST /api/deploy: called by the GitHub Action on every push to main.
// Runs deploy/cron.sh in the background, which can only fetch and hard-reset to
// origin/main of this repo, so no secret is needed: the worst a stranger can do
// is trigger a deploy of the code that is already on GitHub. Limited to one
// run per minute.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { json } from "../lib/http.js";
import { hit } from "../lib/store.js";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

export async function POST() {
  if ((await hit("rl:deploy", 60)) > 1) {
    return json({ started: false, reason: "A deploy ran in the last minute; the cron will catch anything newer." }, 429);
  }
  const cmd = (process.env.DEPLOY_CMD || "sh deploy/cron.sh").split(" ");
  const logFile = path.join(process.env.HOME || ROOT, "deploy.log");
  let out = "ignore";
  try { out = fs.openSync(logFile, "a"); } catch { /* log unavailable: run anyway */ }
  const child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, detached: true, stdio: ["ignore", out, out] });
  child.on("error", (err) => console.error("deploy spawn", err));
  child.unref();
  if (typeof out === "number") fs.closeSync(out);
  return json({ started: true }, 202);
}
