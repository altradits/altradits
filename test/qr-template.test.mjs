// Server QR pictures follow the Bitcoin QR code template: level H, an orange
// rounded frame, and the Altradits logo inline in the centre.
// Run: node --test test/qr-template.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import QRCode from "qrcode";
import { qrSvg } from "../lib/lightning.js";

const BOLT = "LIGHTNING:LNBC25U1P" + "QD685PWMG4Z0UFKRSA2HY37TC9JLVEXN".repeat(9).slice(0, 281);

test("qrSvg: one self-contained SVG in the template", async () => {
  const svg = await qrSvg(BOLT);
  assert.equal(BOLT.length, 300);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+">/);
  assert.match(svg, /<rect [^>]*rx="[\d.]+" fill="#FFFFFF" stroke="#F7931A"/, "orange rounded frame");
  assert.match(svg, /<path d="[^"]+" fill="#0F1B2D"/, "dark modules");
  assert.equal((svg.match(/href=/g) || []).length, 1, "one link only: the logo");
  const logo = fs.readFileSync(new URL("../assets/logo.png", import.meta.url)).toString("base64");
  assert.ok(svg.includes(`<image href="data:image/png;base64,${logo}"`), "the logo is inline from assets/logo.png");
  assert.doesNotMatch(svg, /<script|<style|<foreignObject|javascript:|url\(|https?:\/\/(?!www\.w3\.org\/2000\/svg")/i);
  assert.doesNotMatch(svg.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/, ""), /on\w+\s*=/i, "no event handlers");
});

test("qrSvg: error correction level H, every module drawn", async () => {
  const svg = await qrSvg(BOLT);
  const { size } = QRCode.create(BOLT, { errorCorrectionLevel: "H" }).modules;
  const view = Number(svg.match(/viewBox="0 0 ([\d.]+)/)[1]);
  assert.equal(view, size + 9, "QR size at level H, plus margin and frame");
  const d = svg.match(/<path d="([^"]+)"/)[1];
  const drawn = [...d.matchAll(/h(\d+)v1/g)].reduce((a, m) => a + Number(m[1]), 0);
  const { data } = QRCode.create(BOLT, { errorCorrectionLevel: "H" }).modules;
  assert.equal(drawn, data.reduce((a, b) => a + (b ? 1 : 0), 0));
});

test("qrSvg: logo box is about 40% wide and 16-17% tall", async () => {
  const svg = await qrSvg("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  const { size } = QRCode.create("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", { errorCorrectionLevel: "H" }).modules;
  const box = svg.match(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" fill="#FFFFFF"\/>/);
  assert.ok(box, "white rounded box behind the logo");
  assert.ok(Math.abs(Number(box[1]) / size - 0.4) < 0.01);
  const h = Number(box[2]) / size;
  assert.ok(h > 0.16 && h < 0.175, `logo box height ${h}`);
});
