// LNURL (LUD-01) encoding: a URL as an uppercase-safe bech32 string with the
// "lnurl" prefix, so any Lightning wallet can open it from a QR or paste.
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

const hrpExpand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

function toWords(bytes) {
  let acc = 0, bits = 0;
  const out = [];
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >>> bits) & 31); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

export function encodeLnurl(url) {
  const hrp = "lnurl";
  const data = toWords(Buffer.from(url, "utf8"));
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31);
  return (hrp + "1" + [...data, ...checksum].map((d) => CHARSET[d]).join("")).toUpperCase();
}

// An LNURL from a QR code: bech32 "lnurl1..." (LUD-01) or "lnurlp://host/path"
// (LUD-17). The URL inside, or null when the checksum fails or it isn't https.
export function lnurlToUrl(s) {
  s = String(s || "").trim();
  if (/^lnurlp:\/\//i.test(s)) return `https://${s.slice(9)}`;
  s = s.toLowerCase();
  if (!/^lnurl1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,}$/.test(s)) return null;
  const data = [...s.slice(6)].map((c) => CHARSET.indexOf(c));
  if (polymod([...hrpExpand("lnurl"), ...data]) !== 1) return null;
  let acc = 0, bits = 0;
  const bytes = [];
  for (const v of data.slice(0, -6)) {
    acc = ((acc << 5) | v) & 0xfff; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  const url = Buffer.from(bytes).toString("utf8");
  return /^https:\/\//i.test(url) ? url : null;
}
