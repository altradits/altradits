"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
  updated_at: string;
  source: string;
};

type PriceInfo = {
  rate: ExchangeRate;
  change_24h_kes: number;
  change_24h_pct: number;
  has_history: boolean;
};

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export default function PricePage() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();

  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch("/wallet/price")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch price data");
        }
        setPrice(await res.json());
      })
      .catch((err) => {
        setError("Could not reach the server.");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [token, authLoading, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (error || !price) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">
            {error ?? "Could not load price data."}
          </p>
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  const up = price.change_24h_pct >= 0;

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6">
          <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
            ← Wallet
          </a>
          <h1 className="text-2xl font-semibold text-stone-800">BTC Price</h1>
          <p className="text-sm text-stone-400 mt-1">
            Track the current exchange rate
          </p>
        </div>

        {/* Price card */}
        <div className="bg-stone-800 rounded-2xl p-6 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-2">
            1 BTC
          </p>
          <p className="text-3xl font-semibold text-white">
            {formatKES(price.rate.btc_to_kes)}
          </p>
          {price.has_history && (
            <p className={`text-sm font-medium mt-2 ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? "▲" : "▼"} {Math.abs(price.change_24h_pct).toFixed(2)}% (24h)
            </p>
          )}
          <p className="text-xs text-stone-500 mt-3">
            1 sat ≈ KES {price.rate.sats_to_kes.toFixed(4)}
            {price.rate.source === "default" && " (offline rate)"}
          </p>
        </div>
      </div>
    </main>
  );
}
