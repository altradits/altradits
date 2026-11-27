// Every wallet view announces itself: modal sheets as named dialogs, the
// payment notice as a live region. Run: node --test test/dialog-roles.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("every modal sheet carries its dialog name", () => {
  for (const [f, label] of [
    ["BuyBtcModal.tsx", "Buy Sats"],
    ["CardTopupModal.tsx", "Top up with card"],
    ["ReceiveBtcModal.tsx", "Receive"],
    ["SendBtcModal.tsx", "Send"],
    ["SendMpesaModal.tsx", "M-Pesa"],
    ["TransactionDetailModal.tsx", "Details"],
    ["WalletSettingsModal.tsx", "Settings"],
    ["QrScanner.tsx", "Scan QR code"],
  ]) {
    const src = read(`yebente/src/components/${f}`);
    assert.ok(src.includes('role="dialog"'), `${f}: announces as a dialog`);
    assert.ok(src.includes('aria-modal="true"'), `${f}: marked modal`);
    assert.ok(src.includes(`aria-label="${label}"`), `${f}: named ${label}`);
  }
  assert.match(read("yebente/src/components/PaymentNotice.tsx"), /role=\{(notice\.ok \? 'status' : 'alert')\}/, "the notice stays a live region, not a dialog");
});
