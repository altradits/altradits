// Ye₿ente screens audit (27 Nov 2026, #620): sync and copy failures say so
// plainly, and BalanceCard carries no dead settings prop. The copy tick shows
// only after the clipboard accepts the text.
// Run: node --test test/wallet-audit-honesty.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const hook = read("yebente/src/hooks/useClipboardCopy.ts");
const balance = read("yebente/src/components/BalanceCard.tsx");
const app = read("yebente/src/App.tsx");
const modals = {
  "BuyBtcModal": read("yebente/src/components/BuyBtcModal.tsx"),
  "SendMpesaModal": read("yebente/src/components/SendMpesaModal.tsx"),
  "TransactionDetailModal": read("yebente/src/components/TransactionDetailModal.tsx"),
  "WalletSettingsModal": read("yebente/src/components/WalletSettingsModal.tsx"),
};

test("the shared copy hook awaits the clipboard and reports denial", () => {
  assert.match(hook, /await navigator\.clipboard\.writeText/, "the write is awaited");
  assert.match(hook, /catch \{[\s\S]*?setFailed\(true\)/, "a denial raises failed");
  assert.match(hook, /setCopied\(true\)/, "a success raises copied");
  assert.match(hook, /return \{ copied, failed, copy, reset \}/, "callers get copied, failed, copy, reset");
});

test("every audited copy button uses the hook, never a bare write", () => {
  for (const [name, src] of Object.entries(modals)) {
    assert.match(src, /useClipboardCopy\(\)/, `${name} uses the shared hook`);
    assert.doesNotMatch(src, /navigator\.clipboard\.writeText/, `${name} has no bare clipboard write`);
    assert.match(src, /void copy\w*\(/, `${name} fires the hook copy`);
  }
});

test("every audited copy button says plainly when copying fails", () => {
  for (const [name, src] of Object.entries(modals)) {
    assert.match(src, /Copy failed/, `${name} names the failure`);
  }
  assert.match(modals.BuyBtcModal, /aria-live="polite"/, "the invoice button announces its label change");
  for (const name of ["SendMpesaModal", "TransactionDetailModal", "WalletSettingsModal"]) {
    assert.match(modals[name], /role="status"[^]*?Copy failed/, `${name} announces the failure note`);
  }
  assert.equal(
    (modals.WalletSettingsModal.match(/Copy failed/g) || []).length >= 2,
    true,
    "both settings address copies name the failure",
  );
});

test("a failed balance sync speaks instead of stopping silently", () => {
  assert.match(balance, /setSyncFailed\(false\)/, "each sync starts hopeful");
  assert.match(balance, /catch \{[\s\S]*?setSyncFailed\(true\)/, "a failed sync raises the flag");
  assert.match(balance, /role="status"[^]*?Sync failed/, "the failure is announced");
  assert.match(balance, /Check your connection and try again/, "the note says what to do");
});

test("BalanceCard carries no dead settings prop", () => {
  assert.doesNotMatch(balance, /onOpenWalletSettings/, "BalanceCard neither takes nor uses it");
  const uses = app.match(/onOpenWalletSettings/g) || [];
  assert.equal(uses.length, 2, "only the top bar and the receive modal still open settings");
  const open = app.indexOf("<BalanceCard");
  const close = app.indexOf("/>", open);
  assert.doesNotMatch(app.slice(open, close), /onOpenWalletSettings/, "the BalanceCard call site passes no settings callback");
});
