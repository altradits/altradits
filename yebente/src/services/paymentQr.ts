// Reading payment QR codes (invoice, Lightning address, LNURL, bitcoin: links)
// and drawing this wallet's own address as one.

export interface ScannedPayment {
  to: string;
  sats?: number; // set when the invoice carries its amount
  amountless?: boolean; // an invoice without an amount (can't be paid from Ye₿ente)
}

// The amount written into a BOLT-11 invoice, in sats (lnbc2500u1... = 250,000 sats).
export function bolt11Sats(pr: string): number | null {
  const m = pr.toLowerCase().match(/^ln(?:bc|tb|bcrt)(\d+)?([munp])?1[02-9ac-hj-np-z]+$/);
  if (!m || !m[1]) return null;
  const msatsPer = { m: 1e8, u: 1e5, n: 1e2, p: 0.1 } as const;
  const msats = Number(m[1]) * (m[2] ? msatsPer[m[2] as keyof typeof msatsPer] : 1e11);
  return Number.isInteger(msats / 1000) ? msats / 1000 : null;
}

export function parsePaymentText(text: string): ScannedPayment | null {
  let s = text.trim();
  if (!s) return null;
  // bitcoin:<address>?lightning=<invoice> (BIP-21): pay the Lightning part.
  if (/^bitcoin:/i.test(s)) {
    const [addr, query = ''] = s.slice(8).split('?');
    s = new URLSearchParams(query).get('lightning') || addr;
  }
  // A web link that carries the payment, e.g. https://site/?lightning=LNURL1...
  if (/^https:\/\//i.test(s)) {
    try { s = new URL(s).searchParams.get('lightning') || s; } catch { /* not a link */ }
  }
  s = s.replace(/^lightning:/i, '').replace(/^\/\//, '');
  const lower = s.toLowerCase();
  if (/^ln(bc|tb|bcrt)/.test(lower)) {
    const sats = bolt11Sats(lower);
    return sats ? { to: lower, sats } : { to: lower, amountless: true };
  }
  if (/^lnurlp:\/\//i.test(s)) return { to: s };
  if (lower.startsWith('lnurl1') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return { to: lower };
  return { to: s };
}

// LNURL (LUD-01): the address's pay link in bech32, which every Lightning wallet scans.
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values: number[]) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
export function lnurlEncode(url: string): string {
  const words: number[] = [];
  let acc = 0, bits = 0;
  for (const b of new TextEncoder().encode(url)) {
    acc = ((acc << 8) | b) & 0xfff; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); }
  }
  if (bits) words.push((acc << (5 - bits)) & 31);
  const hrp = [...'lnurl'].map((c) => c.charCodeAt(0));
  const p = polymod([...hrp.map((c) => c >> 5), 0, ...hrp.map((c) => c & 31), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = Array.from({ length: 6 }, (_, i) => (p >>> (5 * (5 - i))) & 31);
  return 'lnurl1' + [...words, ...chk].map((v) => BECH32[v]).join('');
}

// What a QR code for a Lightning address holds: LIGHTNING:LNURL1... (upper case keeps the code small).
export function addressQrText(address: string): string | null {
  const m = address.trim().toLowerCase().match(/^([a-z0-9._+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  return `LIGHTNING:${lnurlEncode(`https://${m[2]}/.well-known/lnurlp/${m[1]}`).toUpperCase()}`;
}

// ---- reading a QR code from a camera frame or a photo

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
let detector: Detector | null | undefined;

async function nativeDetector(): Promise<Detector | null> {
  if (detector !== undefined) return detector;
  const BD = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  try {
    detector = BD && (await BD.getSupportedFormats?.())?.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null;
  } catch {
    detector = null;
  }
  return detector;
}

const canvas = () => document.createElement('canvas');
let scratch: HTMLCanvasElement | null = null;

// The text of a QR code in the image, or null. Uses the phone's own reader when it
// has one (Android Chrome), otherwise jsQR (iPhone), loaded only when first needed.
export async function readQr(src: HTMLVideoElement | ImageBitmap): Promise<string | null> {
  const native = await nativeDetector();
  if (native) {
    try {
      const found = await native.detect(src);
      if (found[0]?.rawValue) return found[0].rawValue;
      return null;
    } catch { /* fall back to jsQR */ }
  }
  const w0 = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
  const h0 = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
  if (!w0 || !h0) return null;
  const scale = Math.min(1, 800 / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  scratch ||= canvas();
  scratch.width = w; scratch.height = h;
  const g = scratch.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(src, 0, 0, w, h);
  const { default: jsQR } = await import('jsqr');
  return jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' })?.data || null;
}
