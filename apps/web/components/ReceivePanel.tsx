"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
};

type DepositTransaction = {
  id: string;
  lightning_invoice?: string;
  amount_sats: number;
};

function formatSats(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} sats`;
}

export default function ReceivePanel({
  rate,
  onCompleted,
}: {
  rate: ExchangeRate | null;
  onCompleted: () => void;
}) {
  const [mode, setMode] = useState<"sats" | "mpesa">("sats");

  // Sats (Lightning invoice) state
  const [satsAmount, setSatsAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [creating, setCreating] = useState(false);
  const [invoice, setInvoice] = useState<DepositTransaction | null>(null);
  const [satsError, setSatsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [paid, setPaid] = useState(false);

  // M-Pesa state
  const [kesAmount, setKesAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null);
  const [mpesaError, setMpesaError] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!invoice?.lightning_invoice || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, `lightning:${invoice.lightning_invoice}`, {
      width: 200,
      margin: 1,
    }).catch(() => {});
  }, [invoice]);

  // Poll for real settlement
  useEffect(() => {
    if (!invoice || paid) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/wallet/deposit/lightning/${invoice.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.transaction?.status === "completed") {
          setPaid(true);
          onCompleted();
        }
      } catch {
        // ignore — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [invoice, paid, onCompleted]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setSatsError(null);
    setInvoice(null);
    setPaid(false);
    try {
      const res = await apiFetch("/wallet/deposit/lightning", {
        method: "POST",
        body: JSON.stringify({ amount_sats: parseInt(satsAmount, 10), memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create invoice");
      setInvoice(data.transaction);
    } catch (err) {
      setSatsError(err instanceof Error ? err.message : "Could not create invoice");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!invoice?.lightning_invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.lightning_invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (!invoice?.lightning_invoice) return;
    const text = `Pay me ${invoice.amount_sats.toLocaleString("en-US")} sats on Lightning${
      memo ? ` for "${memo}"` : ""
    }:\n${invoice.lightning_invoice}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    handleCopy();
  };

  const handleSimulatePaid = async () => {
    if (!invoice) return;
    setSimulating(true);
    setSatsError(null);
    try {
      const res = await apiFetch(`/wallet/deposit/lightning/${invoice.id}/simulate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not confirm payment");
      setPaid(true);
      onCompleted();
    } catch (err) {
      setSatsError(err instanceof Error ? err.message : "Could not confirm payment");
    } finally {
      setSimulating(false);
    }
  };

  const handleNewInvoice = () => {
    setInvoice(null);
    setSatsAmount("");
    setMemo("");
    setSatsError(null);
    setPaid(false);
  };

  const handleMpesaDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpesaLoading(true);
    setMpesaError(null);
    setMpesaMessage(null);
    try {
      const res = await apiFetch("/wallet/deposit/mpesa", {
        method: "POST",
        body: JSON.stringify({ amount_kes: parseFloat(kesAmount), phone_number: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start deposit");
      setMpesaMessage(data.message);
      setKesAmount("");
      onCompleted();
    } catch (err) {
      setMpesaError(err instanceof Error ? err.message : "Could not start deposit");
    } finally {
      setMpesaLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-stone-700">↓ Receive</p>
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
        !invoice ? (
          <form onSubmit={handleCreateInvoice} className="space-y-3">
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
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Note (optional)"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {satsError && <p className="text-xs text-red-500 text-center">{satsError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {creating ? "Generating..." : "Generate Invoice"}
            </button>
          </form>
        ) : paid ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-3xl">⚡</p>
            <p className="text-sm font-medium text-stone-700">Payment received!</p>
            <button
              type="button"
              onClick={handleNewInvoice}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
            >
              New invoice
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center bg-stone-50 border border-stone-100 rounded-xl p-3">
              <canvas ref={qrCanvasRef} className="rounded-lg" />
            </div>
            <p className="text-xs text-stone-400 text-center">
              {invoice.amount_sats.toLocaleString("en-US")} sats — scan to pay
            </p>
            {satsError && <p className="text-xs text-red-500 text-center">{satsError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="py-2 bg-stone-100 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-200 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="py-2 bg-stone-100 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-200 transition-colors"
              >
                Share
              </button>
            </div>
            <button
              type="button"
              onClick={handleSimulatePaid}
              disabled={simulating}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {simulating ? "Confirming..." : "Simulate payment received"}
            </button>
            <button
              type="button"
              onClick={handleNewInvoice}
              className="w-full py-1.5 text-xs text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        )
      ) : (
        <form onSubmit={handleMpesaDeposit} className="space-y-3">
          <div>
            <input
              type="number"
              value={kesAmount}
              onChange={(e) => setKesAmount(e.target.value)}
              placeholder="Amount (KES)"
              min="10"
              step="1"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            />
            {rate && parseFloat(kesAmount) > 0 && (
              <p className="text-xs text-indigo-600 mt-1">
                ≈ {formatSats(parseFloat(kesAmount) / rate.sats_to_kes)}
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
            {mpesaLoading ? "Sending STK push..." : "Send STK Push"}
          </button>
        </form>
      )}
    </div>
  );
}
