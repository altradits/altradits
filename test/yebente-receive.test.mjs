// Ye₿ente Receive: full screen, the address QR big with the address under it,
// one-tap copy of the address and LNURL, share, an invoice that fills the screen
// until paid; no explaining labels; History starts collapsed.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", "yebente", "src", "components", f), "utf8");

test("Receive: full screen, big address QR, address under it, copy and share, invoice until paid", () => {
  const r = src("ReceiveBtcModal.tsx");
  assert.match(r, /fixed inset-0 z-50 bg-\[var\(--yb-surface-container-low\)\]/, "the whole window");
  for (const gone of ["Current Balance", "Static Lightning Address", "LNURL-pay", ">Lightning Address<", "placeholder="]) assert.ok(!r.includes(gone), `no "${gone}"`);
  assert.match(r, /\{currentSats\.toLocaleString\(\)\}/, "the balance in digits");
  const qr = r.indexOf("bigQr(addressQrUrl"), addr = r.indexOf("copy('address', ownAddress)");
  assert.ok(qr > 0 && addr > qr, "the address right under the QR, one tap copies it");
  assert.match(r, /copy\('lnurl', lnurl\)/, "one tap copies the LNURL");
  assert.match(r, /navigator\.share/, "share");
  assert.match(r, /Create invoice/);
  assert.match(r, /step === 'invoice' &&[\s\S]{0,500}bigQr\(qrCodeUrl/, "the invoice fills the screen");
  assert.match(r, /copy\('invoice', invoice\)/);
  assert.match(r, /SatsMotion mode="received"/, "paid: the received animation");
});

test("History starts collapsed", () => {
  assert.match(src("TransactionHistory.tsx"), /useState\(true\)/);
});
