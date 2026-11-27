// Ye₿ente Send: opens on the scanner; the clipboard offer takes only clear payment
// destinations; the Send form's boxes carry no visible labels or placeholders.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { looksLikePayment } = await import("../yebente/src/services/paymentQr.ts");
const src = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", "yebente", "src", "components", f), "utf8");

test("clipboard offer: invoices, LNURLs, Lightning addresses and links carrying them; never plain text", () => {
  const inv = "lnbc2500u1" + "p".repeat(60);
  assert.equal(looksLikePayment(inv), inv);
  assert.equal(looksLikePayment(`lightning:${inv.toUpperCase()}`), inv);
  assert.equal(looksLikePayment("Shop@WalletOfSatoshi.com"), "shop@walletofsatoshi.com");
  const lnurl = "LNURL1DP68GURN8GHJ7MRWW4EXCTNXD9SHG6NPVCHXXMMD9AKXUATJDSKHQCTE8AEK2UMND9HKU0";
  assert.equal(looksLikePayment(`https://altradits.com/k/abc?lightning=${lnurl}`), lnurl.toLowerCase(), "a kTown QR link");
  assert.equal(looksLikePayment(`bitcoin:bc1qxyz?lightning=${inv}`), inv);
  for (const no of ["", "hello", "hello world", "0707172370", "https://example.com/page", "lnbc1", "a".repeat(3000), "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"])
    assert.equal(looksLikePayment(no), null, JSON.stringify(no.slice(0, 30)));
});

test("Send opens on the scanner, and its boxes have no visible labels or placeholders", () => {
  const send = src("SendBtcModal.tsx");
  assert.match(send, /const \[scanning, setScanning\] = useState\(true\)/, "the scanner first");
  assert.match(send, /\{recipient\.trim\(\) && \(<>/, "the amount unfolds after a destination");
  assert.doesNotMatch(send, /placeholder=/);
  assert.doesNotMatch(send, /<label/);
  for (const name of ["Send to", "Amount in sats", "PIN"]) assert.match(send, new RegExp(`aria-label="${name}"`), `${name}: still named for screen readers`);
  const scan = src("QrScanner.tsx");
  assert.match(scan, /clipboard\.readText/);
  assert.match(scan, /aria-label="Paste"/);
  assert.match(scan, /aria-label="Type it in"/);
  assert.match(scan, /aria-label="Choose a photo"/);
});

test("the PIN comes last: only in the pop-up opened by Send, never on the amount screen", () => {
  const send = src("SendBtcModal.tsx");
  const popup = send.indexOf("{confirmOpen && (");
  assert.ok(popup > 0, "the final pop-up exists");
  assert.equal(send.split('aria-label="PIN"').length - 1, 1, "one PIN box in the whole Send screen");
  assert.ok(send.indexOf('aria-label="PIN"') > popup, "and it is inside the pop-up");
  assert.doesNotMatch(send.slice(send.indexOf("const isFormValid"), send.indexOf("const isFormValid") + 300), /pin/i, "Send is enabled without a PIN typed");
  assert.match(send, /biometricOn\(\) && !usePin[\s\S]{0,200}approveWithBiometric\(\)/, "fingerprint first where it's on");
  assert.match(send, /v\.length === 6\) dispatch\(/, "six digits send it");
});
