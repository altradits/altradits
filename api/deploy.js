// POST /api/deploy: called by the GitHub Action on every push to main, with the
// shared secret DEPLOY_SECRET in the X-Deploy-Secret header (a GitHub Actions
// secret, and the same value in DirectAdmin). Runs deploy/cron.sh in the
// background, which can only fetch and hard-reset to origin/main. Without the
// secret nothing runs; the DirectAdmin cron still deploys every 5 minutes.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { json, safeEqual } from "../lib/http.js";
import { hit } from "../lib/store.js";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let run = (out) => spawn("sh", ["deploy/cron.sh"], { cwd: ROOT, detached: true, stdio: ["ignore", out, out] });
export function setDeployRunner(f) { run = f; } // tests: never the real deploy script

export async function POST(request) {
  const secret = process.env.DEPLOY_SECRET;
  const given = request.headers.get("x-deploy-secret") || "";
  if (!secret || !safeEqual(secret, given)) {
    if (secret && given) {
      const { recordAttack } = await import("../lib/attacks.js");
      await recordAttack("secret_guess", { where: "/api/deploy", detail: "wrong X-Deploy-Secret" }).catch(() => {});
    }
    return json({ started: false, reason: secret ? "Wrong deploy secret." : "DEPLOY_SECRET isn't set on the server; the 5-minute cron deploys instead." }, 403);
  }
  if ((await hit("rl:deploy", 60)) > 1) {
    return json({ started: false, reason: "A deploy ran in the last minute; the cron will catch anything newer." }, 429);
  }
  const logFile = path.join(process.env.HOME || ROOT, "deploy.log");
  let out = "ignore";
  try { out = fs.openSync(logFile, "a"); } catch { /* log unavailable: run anyway */ }
  const child = run(out);
  child.on("error", (err) => console.error("deploy spawn", err));
  child.unref();
  if (typeof out === "number") fs.closeSync(out);
  return json({ started: true }, 202);
}
