"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Snapshot = {
  date: string;
  total: number;
};

type NetWorthSummary = {
  wallet: number;
  investments: number;
  goals_saved: number;
  total: number;
  wallet_percent: number;
  investments_percent: number;
  goals_percent: number;
  history: Snapshot[];
};

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ShareBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1.5 mt-1.5">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
      />
    </div>
  );
}

function HistoryChart({ history }: { history: Snapshot[] }) {
  const max = Math.max(...history.map((h) => h.total), 1);

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-1 min-w-0" style={{ height: 100 }}>
        {history.map((h) => {
          const barH = Math.max((h.total / max) * 100, 2);
          return (
            <div key={h.date} className="flex flex-col items-center flex-1 min-w-0 group relative">
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-stone-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                {h.date}: {formatKES(h.total)}
              </div>
              <div className="w-full flex items-end" style={{ height: 84 }}>
                <div
                  className="w-full rounded-t bg-emerald-300 transition-all duration-300"
                  style={{ height: `${barH}%` }}
                />
              </div>
              <p className="text-[10px] mt-1 text-stone-400">
                {h.date.slice(5)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NetWorthPage() {
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/net-worth")
      .then((r) => { if (!r.ok) throw new Error("failed"); return r.json(); })
      .then((d) => { setSummary(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">Could not reach the server.</p>
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto pb-12">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <h1 className="text-xl font-semibold text-stone-800">Net Worth</h1>
        <p className="text-sm text-stone-400 mt-1">Everything you own, in one place</p>
      </div>

      {/* Total */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4 text-center">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
          Total net worth
        </p>
        <p className="text-4xl font-semibold text-stone-800 mt-2">
          {formatKES(summary.total)}
        </p>
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-4">
          Breakdown
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">⚡ Wallet</span>
              <span className="text-sm text-stone-800 font-medium">
                {formatKES(summary.wallet)}
              </span>
            </div>
            <ShareBar percent={summary.wallet_percent} color="bg-amber-400" />
            <p className="text-xs text-stone-300 mt-1">
              {summary.wallet_percent.toFixed(1)}%
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">📈 Investments</span>
              <span className="text-sm text-stone-800 font-medium">
                {formatKES(summary.investments)}
              </span>
            </div>
            <ShareBar percent={summary.investments_percent} color="bg-emerald-400" />
            <p className="text-xs text-stone-300 mt-1">
              {summary.investments_percent.toFixed(1)}%
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">🎯 Goals saved</span>
              <span className="text-sm text-stone-800 font-medium">
                {formatKES(summary.goals_saved)}
              </span>
            </div>
            <ShareBar percent={summary.goals_percent} color="bg-stone-400" />
            <p className="text-xs text-stone-300 mt-1">
              {summary.goals_percent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      {summary.history && summary.history.length > 1 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-4">
            Last 30 days
          </p>
          <HistoryChart history={summary.history} />
        </div>
      )}

      {/* Nav links */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <a
          href="/wallet"
          className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
        >
          ⚡ Wallet
        </a>
        <a
          href="/investments"
          className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
        >
          Investments
        </a>
        <a
          href="/goals"
          className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
        >
          Goals
        </a>
      </div>

    </main>
  );
}
