// Demo: the agency thinking with Meta Muse, end to end in one command.
// Run: AI_PROVIDER=meta META_MODEL_API_KEY=<key> node demo/meta.mjs
// Everything runs in a throwaway folder: the live books are never touched.
// Beats (for the video): 1) status names Meta, 2) a department switches on,
// 3) one instruction becomes queued drafts, 4) the spend is tracked.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-meta-demo-"));
if (process.env.AI_PROVIDER !== "meta" || !process.env.META_MODEL_API_KEY) {
  console.error("Need AI_PROVIDER=meta and META_MODEL_API_KEY in the environment.");
  console.error("Example: AI_PROVIDER=meta META_MODEL_API_KEY=<key> node demo/meta.mjs");
  process.exit(1);
}

const ai = await import("../lib/ai.js");
const stan = await import("../lib/stan.js");

const say = (s) => console.log(`\n### ${s}`);
say("Beat 1: who is thinking?");
const before = ai.aiStatus();
console.log(`provider=${before.provider} model=${before.model} paused=${before.paused}`);
if (before.paused) {
  console.error(`AI is paused (${before.kind}): ${before.reason}`);
  process.exit(1);
}

say("Beat 2: the founder department switches on (Stanley only).");
ai.setDeptPower("founder", true, { by: "stanley" });
console.log("founder: on");

say("Beat 3: one instruction becomes queued drafts.");
const rec = await stan.instruct({
  text: "Thank Bright Kiptoo for trying the Ye₿ente wallet and invite one reply with any question.",
  dept: "founder",
  to: "5tan@altradits.com",
});
console.log(`status=${rec.status} plan=${rec.plan || "(none)"}`);
const drafts = await stan.pendingDrafts();
for (const id of rec.drafts || []) {
  const d = drafts.find((x) => x && x.id === id);
  console.log(d ? `queued: [${d.dept}] to ${d.to}: ${d.subject}` : `queued: ${id} (missing)`);
}
for (const q of rec.questions || []) console.log(`question: ${q}`);
if (rec.status === "error") {
  console.error(`instruction failed: ${rec.error}`);
  process.exit(1);
}

say("Beat 4: the spend is tracked.");
const after = ai.aiStatus();
console.log(`calls today=${after.todayCalls} spend today=$${after.todayUsd} calls this month=${after.monthCalls}`);
console.log("\nDone. State stayed in a throwaway folder; nothing here touched the live site.");
