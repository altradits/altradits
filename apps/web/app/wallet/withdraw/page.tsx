"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export default function WalletWithdrawPage() {
  const router = useRouter();
  const { token } = useAuth();

  // M-Pesa withdrawal state
  const [mpesaSats, setMpesaSats] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null);
  const [mpesaError, setMpesaError] = useState<string | null>(null);

  // Lightning withdrawal state
  const [lnSats, setLnSats] = useState("");
  const [destination, setDestination] = useState("");
  const [lnLoading, setLnLoading] = useState(false);
  const [lnMessage, setLnMessage] = useState<string | null>(null);
  const [lnError, setLnError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const handleMpesaWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpesaLoading(true);
    setMpesaError(null);
    setMpesaMessage(null);
    try {
      const res = await apiFetch("/wallet/withdraw/mpesa", {
        method: "POST",
        body: JSON.stringify({
          amount_sats: parseInt(mpesaSats, 10),
          phone_number: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start withdrawal");
      setMpesaMessage(data.message);
      setMpesaSats("");
    } catch (err) {
      setMpesaError(
        err instanceof Error ? err.message : "Could not start withdrawal"
      );
    } finally {
      setMpesaLoading(false);
    }
  };

  const handleLightningWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setLnLoading(true);
    setLnError(null);
    setLnMessage(null);
    try {
      const res = await apiFetch("/wallet/withdraw/lightning", {
        method: "POST",
        body: JSON.stringify({
          amount_sats: parseInt(lnSats, 10),
          destination,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send payment");
      setLnMessage(data.message);
      setLnSats("");
      setDestination("");
    } catch (err) {
      setLnError(
        err instanceof Error ? err.message : "Could not send payment"
      );
    } finally {
      setLnLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Withdraw</h1>
          <p className="text-sm text-stone-400 mt-1">
            Move sats out to M-Pesa or Lightning
          </p>
        </div>

        {/* M-Pesa withdrawal */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            📲 M-Pesa
          </p>
          <form onSubmit={handleMpesaWithdraw} className="space-y-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Amount (sats)
              </label>
              <input
                type="number"
                value={mpesaSats}
                onChange={(e) => setMpesaSats(e.target.value)}
                placeholder="10000"
                min="10000"
                step="1"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
              <p className="text-xs text-stone-300 mt-1">Minimum 10,000 sats</p>
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
              {mpesaLoading ? "Sending..." : "Withdraw to M-Pesa"}
            </button>
          </form>
        </div>

        {/* Lightning withdrawal */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            ⚡ Lightning
          </p>
          <form onSubmit={handleLightningWithdraw} className="space-y-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Amount (sats)
              </label>
              <input
                type="number"
                value={lnSats}
                onChange={(e) => setLnSats(e.target.value)}
                placeholder="10000"
                min="1"
                step="1"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Invoice or Lightning Address
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="lnbc... or name@wallet.com"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
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
              {lnLoading ? "Sending..." : "Send over Lightning"}
            </button>
          </form>
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
