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

type PriceAlert = {
  id: string;
  direction: "above" | "below";
  target_kes: number;
  active: boolean;
  triggered_at: string | null;
  created_at: string;
};

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PriceAlertsPage() {
  const router = useRouter();
  const { token } = useAuth();

  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New alert form
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [targetKES, setTargetKES] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadAlerts = () => {
    apiFetch("/price-alerts")
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    Promise.all([
      apiFetch("/wallet/price"),
      apiFetch("/price-alerts"),
    ])
      .then(async ([priceRes, alertsRes]) => {
        if (priceRes.status === 401 || alertsRes.status === 401) {
          router.push("/login");
          return;
        }
        if (!priceRes.ok || !alertsRes.ok) {
          throw new Error("Failed to fetch price data");
        }
        setPrice(await priceRes.json());
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      })
      .catch((err) => {
        setError("Could not reach the server.");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [token, router]);

  const handleCreate = async () => {
    const target = parseFloat(targetKES);
    if (!target || target <= 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiFetch("/price-alerts", {
        method: "POST",
        body: JSON.stringify({ direction, target_kes: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Could not create alert");
        return;
      }
      setFeedback(data.message);
      setTargetKES("");
      loadAlerts();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/price-alerts/${id}`, { method: "DELETE" });
    loadAlerts();
  };

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

  const active = alerts.filter((a) => a.active);
  const triggered = alerts.filter((a) => !a.active);
  const up = price.change_24h_pct >= 0;

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <a href="/wallet" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
            ← Wallet
          </a>
          <h1 className="text-2xl font-semibold text-stone-800">BTC Price</h1>
          <p className="text-sm text-stone-400 mt-1">
            Track the rate and get notified when it moves
          </p>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-emerald-700">{feedback}</p>
          </div>
        )}

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

        {/* New alert form */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
          <p className="text-sm font-medium text-stone-700 mb-4">Set a price alert</p>

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setDirection("above")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
                direction === "above"
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              Goes above
            </button>
            <button
              type="button"
              onClick={() => setDirection("below")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
                direction === "below"
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              Goes below
            </button>
          </div>

          <input
            type="number"
            placeholder="Target price (KES per BTC)"
            value={targetKES}
            onChange={(e) => setTargetKES(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-stone-400"
          />
          {createError && (
            <p className="text-xs text-red-500 -mt-1 mb-3">{createError}</p>
          )}
          <button
            onClick={handleCreate}
            disabled={creating || !targetKES}
            className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
          >
            {creating ? "Setting alert..." : "Set alert"}
          </button>
        </div>

        {/* Active alerts */}
        <div className="mb-6">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            Active Alerts
          </p>
          {active.length > 0 ? (
            <div className="space-y-2">
              {active.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🔔</span>
                    <p className="text-sm text-stone-700">
                      Notify when BTC goes{" "}
                      <span className="font-medium">{a.direction}</span>{" "}
                      {formatKES(a.target_kes)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-stone-300 hover:text-stone-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-300 text-sm text-center py-6">
              No active alerts. Set one above.
            </p>
          )}
        </div>

        {/* Triggered alerts */}
        {triggered.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
              Triggered
            </p>
            <div className="space-y-2">
              {triggered.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center justify-between opacity-60"
                >
                  <div>
                    <p className="text-sm text-stone-600">
                      BTC went {a.direction} {formatKES(a.target_kes)}
                    </p>
                    {a.triggered_at && (
                      <p className="text-xs text-stone-400">
                        {formatDateTime(a.triggered_at)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-stone-300 hover:text-stone-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
