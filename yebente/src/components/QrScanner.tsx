import React, { useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { readQr } from '../services/paymentQr';

interface QrScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

// The back camera, full screen, until a QR code is read. A photo or screenshot
// of a QR code works too (for phones that block the camera).
export const QrScanner: React.FC<QrScannerProps> = ({ onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const tick = async () => {
      const v = videoRef.current;
      if (done || !v) return;
      if (v.readyState >= 2) {
        const text = await readQr(v).catch(() => null);
        if (text && !done) {
          done = true;
          onResult(text);
          return;
        }
      }
      timer = setTimeout(tick, 250);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (done) return;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        tick();
      } catch {
        setMessage('The camera is not available. Allow camera access, or choose a photo of the QR code.');
      } finally {
        setStarting(false);
      }
    })();

    return () => {
      done = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readQr(await createImageBitmap(file));
      if (text) onResult(text);
      else setMessage('No QR code found in that photo. Try a sharper one.');
    } catch {
      setMessage('That photo could not be read.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <h2 className="text-base font-bold">Scan QR Code</h2>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="relative w-64 h-64 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" aria-hidden="true" />
        {starting && <Loader2 className="absolute w-8 h-8 animate-spin text-white" />}
      </div>

      <div className="px-5 py-5 space-y-3">
        {message && <p className="text-xs text-amber-300 text-center">{message}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <ImageIcon className="w-4 h-4" />
          <span>Choose a Photo</span>
        </button>
      </div>
    </div>
  );
};
