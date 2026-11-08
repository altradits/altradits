// The Bitcoin QR code template, the same look as altradits.com's server QRs:
// error correction level H, dark modules on white, an orange rounded frame,
// and the Altradits logo on a white rounded box in the centre (level H
// recovers the modules the logo covers). Drawn on a canvas at whole pixels
// per module and returned as a PNG data URL for an <img>.
import QRCode from 'qrcode';
import logoUrl from '../assets/qr-logo.png?inline';

const DARK = '#0F1B2D';
const ORANGE = '#F7931A';
const PX = 8; // canvas pixels per module: sharp when the browser scales it down

let logoImg: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  if (!logoImg) {
    logoImg = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { logoImg = null; reject(new Error('logo did not load')); };
      img.src = logoUrl;
    });
  }
  return logoImg;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function templateQrDataUrl(text: string): Promise<string> {
  const { size: n, data } = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules;
  const pad = 3, edge = 1.5, off = edge + pad, total = n + 2 * off;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(total * PX);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.scale(PX, PX);

  // White card with the orange rounded frame.
  roundRect(ctx, edge / 2, edge / 2, total - edge, total - edge, pad + edge);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = edge;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();

  ctx.fillStyle = DARK;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (data[y * n + x]) ctx.fillRect(x + off, y + off, 1, 1);
  }

  // Logo box: about 40% of the QR width and 16.5% of its height.
  const logo = await loadLogo();
  const c = total / 2, m = n * 0.0145;
  const lw = n * 0.4 - 2 * m, lh = lw * logo.naturalHeight / logo.naturalWidth;
  roundRect(ctx, c - lw / 2 - m, c - lh / 2 - m, lw + 2 * m, lh + 2 * m, m * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.drawImage(logo, c - lw / 2, c - lh / 2, lw, lh);

  return canvas.toDataURL('image/png');
}
