// Every button that leans on a hover tooltip also carries a spoken name:
// screen readers skip title text. Run: node --test test/labeled-controls.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("no button leans on title text alone", () => {
  const dir = path.join(ROOT, "yebente/src/components");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
    const src = read(`yebente/src/components/${f}`);
    for (const m of src.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
      if (m[0].includes("title=")) assert.ok(m[0].includes("aria-label"), `${f}: a title-only button has no spoken name`);
    }
  }
  assert.match(read("yebente/src/components/PhoneInput.tsx"), /aria-label="Clear phone number"/, "the clear button is named");
  assert.match(read("yebente/src/components/SendMpesaModal.tsx"), /aria-label="Copy code"/, "the copy button is named");
  assert.match(read("yebente/src/components/TransactionDetailModal.tsx"), /aria-label="Copy reference"/, "the reference button is named");
});
