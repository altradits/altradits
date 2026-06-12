"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { apiFetch } from "@/lib/api";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
};

type SentResult = {
  amountSats: number;
  message: string;
};

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SendPanel({
  rate,
  onCompleted,
}: {
  rate: ExchangeRate | null;
  onCompleted: () => void;
}) {
  const [mode, setMode] = useState<"sats" | "mpesa">("sats");

  // Sats (pay invoice) state
  const [satsAmount, setSatsAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [sending, setSending] = useState(false);
  const [satsError, setSatsError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentResult | null>(null);

  // QR scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // M-Pesa withdraw state
  const [mpesaSats, setMpesaSats] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null);
  const [mpesaError, setMpesaError] = useState<string | null>(null);

  const stopScan = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const tickScan = () => {
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          setDestination(code.data.replace(/^lightning:/i, ""));
          stopScan();
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tickScan);
  };

  const startScan = async () => {
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(tickScan);
    } catch {
      setScanError("Could not access camera");
    }
  };

  useEffect(() => {
    return () => stopScan();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setDestination(text.trim().replace(/^lightning:/i, ""));
    } catch {
      // clipboard access denied — user can paste into the field manually
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSatsError(null);
    try {
      const amountSats = parseInt(satsAmount, 10);
      const res = await apiFetch("/wallet/withdraw/lightning", {
        method: "POST",
        body: JSON.stringify({ amount_sats: amountSats, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send payment");
      setSent({ amountSats, message: data.message });
      onCompleted();
    } catch (err) {
      setSatsError(err instanceof Error ? err.message : "Could not send payment");
    } finally {
      setSending(false);
    }
  };

  const handleSendAnother = () => {
    setSent(null);
    setSatsAmount("");
    setDestination("");
    setSatsError(null);
  };

  const handleMpesaWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpesaLoading(true);
    setMpesaError(null);
    setMpesaMessage(null);
    try {
      const res = await apiFetch("/wallet/withdraw/mpesa", {
        method: "POST",
        body: JSON.stringify({ amount_sats: parseInt(mpesaSats, 10), phone_number: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start withdrawal");
      setMpesaMessage(data.message);
      setMpesaSats("");
      onCompleted();
    } catch (err) {
      setMpesaError(err instanceof Error ? err.message : "Could not start withdrawal");
    } finally {
      setMpesaLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-stone-700">↑ Send</p>
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          {(["sats", "mpesa"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === m ? "bg-indigo-600 text-white" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {m === "sats" ? "Sats" : "M-Pesa"}
            </button>
          ))}
        </div>
      </div>

      {mode === "sats" ? (
        sent ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-3xl">⚡</p>
            <p className="text-sm font-medium text-stone-700">
              Sent {sent.amountSats.toLocaleString("en-US")} sats
            </p>
            <button
              type="button"
              onClick={handleSendAnother}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-3">
            <input
              type="number"
              value={satsAmount}
              onChange={(e) => setSatsAmount(e.target.value)}
              placeholder="Amount (sats)"
              min="1"
              step="1"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            />
            <div>
              <div className="flex items-center justify-end gap-3 mb-1">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  📋 Paste
                </button>
                <button
                  type="button"
                  onClick={() => (scanning ? stopScan() : startScan())}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {scanning ? "Cancel scan" : "📷 Scan QR"}
                </button>
              </div>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="lnbc... or name@wallet.com"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required
              />
              {scanError && <p className="text-xs text-red-500 mt-1">{scanError}</p>}
              {scanning && (
                <div className="mt-2 rounded-xl overflow-hidden border border-stone-200 bg-black">
                  <video ref={videoRef} className="w-full" muted playsInline />
                </div>
              )}
              <canvas ref={scanCanvasRef} className="hidden" />
            </div>
            {satsError && <p className="text-xs text-red-500 text-center">{satsError}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Payment"}
            </button>
          </form>
        )
      ) : (
        <form onSubmit={handleMpesaWithdraw} className="space-y-3">
          <div>
            <input
              type="number"
              value={mpesaSats}
              onChange={(e) => setMpesaSats(e.target.value)}
              placeholder="Amount (sats, min 10,000)"
              min="10000"
              step="1"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            />
            {rate && parseInt(mpesaSats, 10) > 0 && (
              <p className="text-xs text-indigo-600 mt-1">
                ≈ {formatKES(parseInt(mpesaSats, 10) * rate.sats_to_kes)}
              </p>
            )}
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="M-Pesa phone (07XXXXXXXX)"
            className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            required
          />
          {mpesaError && <p className="text-xs text-red-500 text-center">{mpesaError}</p>}
          {mpesaMessage && <p className="text-xs text-emerald-600 text-center">{mpesaMessage}</p>}
          <button
            type="submit"
            disabled={mpesaLoading}
            className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {mpesaLoading ? "Sending..." : "Withdraw to M-Pesa"}
          </button>
        </form>
      )}
    </div>
  );
}
