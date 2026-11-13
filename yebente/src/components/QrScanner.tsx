import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Loader2, ClipboardPaste, Keyboard, Flashlight, FlashlightOff } from 'lucide-react';
import { readQr, looksLikePayment } from '../services/paymentQr';

interface QrScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
  // Type the destination by hand instead.
  onType?: () => void;
}

// What some phone cameras can do beyond the standard (Chrome on Android): a torch,
// zoom, continuous focus and tap-to-focus. Each is used only when the camera says it has it.
type Caps = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step?: number }; focusMode?: string[] };
type Extra = MediaTrackConstraintSet & { torch?: boolean; zoom?: number; focusMode?: string; pointsOfInterest?: { x: number; y: number }[] };
const apply = (track: MediaStreamTrack | null, c: Extra) => track?.applyConstraints({ advanced: [c] } as MediaTrackConstraints).catch(() => {});

// The back camera, full screen, until a QR code is read: sharp video, continuous
// focus, tap to focus, torch and zoom where the phone has them, and every other
// frame a sharp close-up of the middle, so small, far and dense codes read too.
// Paste, type or a photo are the other ways in. While open, a payment destination
// copied to the clipboard is offered for pasting (read on this phone only, used
// only if the owner taps Paste).
export const QrScanner: React.FC<QrScannerProps> = ({ onResult, onClose, onType }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const doneRef = useRef(false);
  const dismissed = useRef(new Set<string>());
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(true);
  const [torch, setTorch] = useState<boolean | null>(null); // null: no torch on this camera
  const [zoom, setZoom] = useState<{ value: number; steps: number[] } | null>(null);
  const [offer, setOffer] = useState('');

  const finish = useCallback((text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { navigator.vibrate?.(40); } catch { /* no vibration */ }
    onResult(text);
  }, [onResult]);

  // The camera and the reading loop.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pass = 0;
    doneRef.current = false;

    const tick = async () => {
      const v = videoRef.current;
      if (doneRef.current || !v) return;
      if (v.readyState >= 2) {
        const text = await readQr(v, pass).catch(() => null);
        pass = pass ? 0 : 1;
        if (text) { finish(text); return; }
      }
      timer = setTimeout(tick, 120);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (doneRef.current) return;
        const track = stream.getVideoTracks()[0] || null;
        trackRef.current = track;
        const caps = (track?.getCapabilities?.() || {}) as Caps;
        if (caps.focusMode?.includes('continuous')) apply(track, { focusMode: 'continuous' });
        if (caps.torch) setTorch(false);
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const steps = [caps.zoom.min, Math.min(caps.zoom.max, 2), Math.min(caps.zoom.max, 3)].filter((z, i, a) => a.indexOf(z) === i);
          if (steps.length > 1) setZoom({ value: steps[0], steps });
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        tick();
      } catch {
        setMessage('The camera is not available. Allow camera access, or use paste, typing or a photo below.');
      } finally {
        setStarting(false);
      }
    })();

    return () => {
      doneRef.current = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [finish]);

  // The clipboard: checked when the scanner opens, when the app comes back to the
  // front, and every two seconds while it is open. Only a payment destination is
  // offered; one the owner dismissed isn't offered again.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || !document.hasFocus?.()) return;
      try {
        const st = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
        if (st?.state === 'denied') return;
      } catch { /* no permissions API: try anyway */ }
      try {
        const to = looksLikePayment(await navigator.clipboard.readText());
        if (!stopped && to && !dismissed.current.has(to)) setOffer(to);
      } catch { /* not allowed without a tap here: the paste icon still works */ }
    };
    check();
    const t = setInterval(check, 2000);
    const onFront = () => { check(); };
    window.addEventListener('focus', onFront);
    document.addEventListener('visibilitychange', onFront);
    return () => { stopped = true; clearInterval(t); window.removeEventListener('focus', onFront); document.removeEventListener('visibilitychange', onFront); };
  }, []);

  const pasteNow = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) finish(text);
      else setMessage('Nothing copied yet.');
    } catch {
      setMessage('Paste is blocked here. Tap the keyboard and paste into the box.');
    }
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const text = (await readQr(bmp, 0)) || (await readQr(bmp, 1));
      if (text) finish(text);
      else setMessage('No QR code found in that photo. Try a sharper one.');
    } catch {
      setMessage('That photo could not be read.');
    }
  };

  // Tap the picture to focus there (where the camera supports it).
  const focusAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const track = trackRef.current;
    const caps = (track?.getCapabilities?.() || {}) as Caps;
    if (!caps.focusMode?.includes('single-shot') && !caps.focusMode?.includes('manual')) return;
    apply(track, { pointsOfInterest: [{ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }], focusMode: 'single-shot' })
      ?.then(() => setTimeout(() => { if (caps.focusMode?.includes('continuous')) apply(trackRef.current, { focusMode: 'continuous' }); }, 1500));
  };

  const toggleTorch = () => {
    if (torch === null) return;
    apply(trackRef.current, { torch: !torch });
    setTorch(!torch);
  };
  const nextZoom = () => {
    if (!zoom) return;
    const i = zoom.steps.indexOf(zoom.value);
    const value = zoom.steps[(i + 1) % zoom.steps.length];
    apply(trackRef.current, { zoom: value });
    setZoom({ ...zoom, value });
  };

  const iconBtn = 'w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center';

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden" onPointerUp={focusAt}>
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="relative w-[70vmin] h-[70vmin] max-w-80 max-h-80 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" aria-hidden="true" />
        {starting && <Loader2 className="absolute w-8 h-8 animate-spin text-white" />}

        <button type="button" onClick={onClose} className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
          {zoom && (
            <button type="button" onClick={nextZoom} className="h-11 min-w-11 px-3 rounded-full bg-black/40 text-white text-sm font-bold" aria-label="Zoom">
              {`${Math.round(zoom.value * 10) / 10}×`}
            </button>
          )}
          {torch !== null && (
            <button type="button" onClick={toggleTorch} className="w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center" aria-label={torch ? 'Torch off' : 'Torch on'} aria-pressed={torch}>
              {torch ? <FlashlightOff className="w-5 h-5" /> : <Flashlight className="w-5 h-5" />}
            </button>
          )}
        </div>

        {offer && (
          <div role="dialog" aria-label="Paste the copied address?" className="absolute left-4 right-4 bottom-4 mx-auto max-w-md rounded-2xl bg-[var(--yb-surface-container-high)] border border-[var(--yb-outline-variant)] p-3 flex items-center gap-3">
            <ClipboardPaste className="w-5 h-5 shrink-0 text-[var(--yb-primary)]" aria-hidden="true" />
            <span className="flex-1 min-w-0 font-mono text-xs text-[var(--yb-on-surface)] truncate">{offer}</span>
            <button type="button" onClick={() => finish(offer)} className="h-9 px-4 rounded-full bg-[var(--yb-primary-container)] text-[var(--yb-on-surface)] text-xs font-bold">Paste</button>
            <button type="button" onClick={() => { dismissed.current.add(offer); setOffer(''); }} className="w-9 h-9 rounded-full text-[var(--yb-on-surface-variant)] flex items-center justify-center" aria-label="Not this one">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
        {message && <p className="text-xs text-amber-300 text-center" role="status">{message}</p>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="flex justify-center gap-6">
          <button type="button" onClick={pasteNow} className={iconBtn} aria-label="Paste" title="Paste"><ClipboardPaste className="w-6 h-6" /></button>
          {onType && <button type="button" onClick={onType} className={iconBtn} aria-label="Type it in" title="Type it in"><Keyboard className="w-6 h-6" /></button>}
          <button type="button" onClick={() => fileRef.current?.click()} className={iconBtn} aria-label="Choose a photo" title="Choose a photo"><ImageIcon className="w-6 h-6" /></button>
        </div>
      </div>
    </div>
  );
};
