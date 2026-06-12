"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type DepositTransaction = {
  id: string;
  lightning_invoice?: string;
  amount_sats: number;
};

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
};

function formatSats(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} sats`;
}

export default function WalletDepositPage() {
  const router = useRouter();
  const { token } = useAuth();

  // M-Pesa deposit state
  const [kesAmount, setKesAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null);
  const [mpesaError, setMpesaError] = useState<string | null>(null);

  // Lightning deposit state
  const [satsAmount, setSatsAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [lnLoading, setLnLoading] = useState(false);
  const [invoice, setInvoice] = useState<DepositTransaction | null>(null);
  const [lnMessage, setLnMessage] = useState<string | null>(null);
  const [lnError, setLnError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const [rate, setRate] = useState<ExchangeRate | null>(null);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  useEffect(() => {
    apiFetch("/wallet/rate")
      .then((r) => r.json())
      .then(setRate)
      .catch(() => {});
  }, []);

  const handleMpesaDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpesaLoading(true);
    setMpesaError(null);
    setMpesaMessage(null);
    try {
      const res = await apiFetch("/wallet/deposit/mpesa", {
        method: "POST",
        body: JSON.stringify({
          amount_kes: parseFloat(kesAmount),
          phone_number: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start deposit");
      setMpesaMessage(data.message);
      setKesAmount("");
    } catch (err) {
      setMpesaError(
        err instanceof Error ? err.message : "Could not start deposit"
      );
    } finally {
      setMpesaLoading(false);
    }
  };

  const handleLightningInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLnLoading(true);
    setLnError(null);
    setLnMessage(null);
    setInvoice(null);
    try {
      const res = await apiFetch("/wallet/deposit/lightning", {
        method: "POST",
        body: JSON.stringify({
          amount_sats: parseInt(satsAmount, 10),
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create invoice");
      setInvoice(data.transaction);
    } catch (err) {
      setLnError(
        err instanceof Error ? err.message : "Could not create invoice"
      );
    } finally {
      setLnLoading(false);
    }
  };

  const handleSimulatePaid = async () => {
    if (!invoice) return;
    setSimulating(true);
    setLnError(null);
    try {
      const res = await apiFetch(
        `/wallet/deposit/lightning/${invoice.id}/simulate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not confirm payment");
      setLnMessage(data.message);
      setInvoice(null);
      setSatsAmount("");
      setMemo("");
    } catch (err) {
      setLnError(
        err instanceof Error ? err.message : "Could not confirm payment"
      );
    } finally {
      setSimulating(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Deposit</h1>
          <p className="text-sm text-stone-400 mt-1">
            Top up your wallet with M-Pesa or Lightning
          </p>
        </div>

        {/* M-Pesa deposit */}
        <div id="mpesa" className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            📲 M-Pesa
          </p>
          <form onSubmit={handleMpesaDeposit} className="space-y-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Amount (KES)
              </label>
              <input
                type="number"
                value={kesAmount}
                onChange={(e) => setKesAmount(e.target.value)}
                placeholder="100"
                min="10"
                step="1"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
              {rate && parseFloat(kesAmount) > 0 ? (
                <p className="text-xs text-emerald-600 mt-1">
                  KES {kesAmount} ≈ {formatSats(parseFloat(kesAmount) / rate.sats_to_kes)}
                </p>
              ) : (
                <p className="text-xs text-stone-300 mt-1">Minimum KES 10</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                M-Pesa Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
            </div>

            {mpesaError && (
              <p className="text-xs text-red-500 text-center">{mpesaError}</p>
            )}
            {mpesaMessage && (
              <p className="text-xs text-emerald-600 text-center">
                {mpesaMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={mpesaLoading}
              className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {mpesaLoading ? "Sending STK push..." : "Send STK Push"}
            </button>
          </form>
        </div>

        {/* Lightning deposit */}
        <div id="lightning" className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            ⚡ Lightning
          </p>

          {!invoice ? (
            <form onSubmit={handleLightningInvoice} className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  Amount (sats)
                </label>
                <input
                  type="number"
                  value={satsAmount}
                  onChange={(e) => setSatsAmount(e.target.value)}
                  placeholder="10000"
                  min="1"
                  step="1"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  Memo (optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="What's this for?"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>

              {lnError && (
                <p className="text-xs text-red-500 text-center">{lnError}</p>
              )}
              {lnMessage && (
                <p className="text-xs text-emerald-600 text-center">
                  {lnMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={lnLoading}
                className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                {lnLoading ? "Generating invoice..." : "Generate Invoice"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                Pay this invoice for{" "}
                <span className="font-semibold">
                  {invoice.amount_sats.toLocaleString("en-US")} sats
                </span>
                :
              </p>
              <p className="text-xs text-stone-500 break-all bg-stone-50 border border-stone-100 rounded-xl p-3 font-mono">
                {invoice.lightning_invoice}
              </p>
              <p className="text-xs text-stone-400">
                This is a simulated invoice — no real Lightning node is
                connected yet. Tap below once you&apos;d normally have paid it.
              </p>

              {lnError && (
                <p className="text-xs text-red-500 text-center">{lnError}</p>
              )}

              <button
                type="button"
                onClick={handleSimulatePaid}
                disabled={simulating}
                className="w-full py-3 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {simulating ? "Confirming..." : "I've paid this invoice"}
              </button>
              <button
                type="button"
                onClick={() => setInvoice(null)}
                className="w-full py-2 text-xs text-stone-400 hover:text-stone-600"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <a
          href="/wallet"
          className="block text-center text-xs text-stone-400 mt-4"
        >
          ← Back to wallet
        </a>
      </div>
    </main>
  );
}
