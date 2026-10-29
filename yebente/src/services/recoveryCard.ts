// A recovery card: the wallet's handle, address and 12 words as an image the
// owner can keep (download) or send to themselves (share sheet, e.g. WhatsApp).
// Drawn on this device: the phrase never leaves it except where the owner sends it.

const W = 1080, H = 1350;

export async function drawRecoveryCard(p: { address: string; phrase: string }): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#763698'); bg.addColorStop(1, '#2A1238');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath(); g.roundRect(60, 330, W - 120, 760, 40); g.fill();

  g.fillStyle = '#F7E8FF';
  g.font = "900 96px 'Banana Yeti', 'Arial Black', system-ui, sans-serif";
  g.fillText('Ye₿ente', 80, 170);
  g.font = '600 40px system-ui, sans-serif';
  g.fillStyle = '#EBD9F5';
  g.fillText(p.address, 80, 250);

  g.font = '700 36px system-ui, sans-serif';
  g.fillStyle = '#DDB8FF';
  g.fillText('Recovery phrase', 110, 410);

  const words = p.phrase.trim().split(/\s+/);
  g.font = '600 50px ui-monospace, Menlo, monospace';
  words.forEach((w, i) => {
    const col = i < 6 ? 0 : 1, row = i % 6;
    const x = 110 + col * 450, y = 510 + row * 95;
    g.fillStyle = 'rgba(247,232,255,0.55)';
    g.fillText(String(i + 1).padStart(2, ' '), x, y);
    g.fillStyle = '#FFFFFF';
    g.fillText(w, x + 90, y);
  });

  g.font = '500 32px system-ui, sans-serif';
  g.fillStyle = '#EBD9F5';
  g.fillText(new Date().toISOString().slice(0, 10), 80, 1180);
  g.fillText('Keep it private: anyone with these words can take your sats.', 80, 1240);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card.'))), 'image/jpeg', 0.92));
}

const fileName = (address: string) => `yebente-recovery-${address.split('@')[0]}.jpg`;

export async function downloadRecoveryCard(p: { address: string; phrase: string }) {
  const blob = await drawRecoveryCard(p);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName(p.address);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// The phone's share sheet (WhatsApp is one tap: choose your own chat). The image
// if the phone can share files, otherwise the words as text; never in a web link.
export async function shareRecoveryCard(p: { address: string; phrase: string }): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share) return false;
  try {
    const file = new File([await drawRecoveryCard(p)], fileName(p.address), { type: 'image/jpeg' });
    if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: 'Ye₿ente recovery card' });
    else await nav.share({ title: 'Ye₿ente recovery phrase', text: `Ye₿ente ${p.address}\n${p.phrase}` });
    return true;
  } catch {
    return false; // closed the share sheet
  }
}

export const canShareCard = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
