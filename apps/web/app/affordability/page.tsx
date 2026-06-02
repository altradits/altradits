"use client";

import { useState } from "react";

type GoalImpact = {
  goal_name: string;
  goal_emoji: string;
  current_pct: number;
  after_pct: number;
  days_delayed: number;
};

type CheckResult = {
  item: string;
  amount: number;
  comfort: "good" | "caution" | "tight";
  message: string;
  detail: string;
  budget_headroom: number;
  goal_impact: GoalImpact | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

const COMFORT_CONFIG = {
  good: {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    dot: "bg-emerald-400",
    text: "text-emerald-700",
    label: "Comfortable",
  },
  caution: {
    bg: "bg-amber-50",
    border: "border-amber-100",
    dot: "bg-amber-400",
    text: "text-amber-700",
    label: "Worth knowing",
  },
  tight: {
    bg: "bg-red-50",
    border: "border-red-100",
    dot: "bg-red-400",
    text: "text-red-600",
    label: "Tight",
  },
};

export default function AffordabilityPage() {
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    const amt = parseFloat(amount);
    if (!item.trim() || !amt || amt <= 0) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${API}/affordability/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: item.trim(), amount: amt }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setItem("");
    setAmount("");
    setError(null);
  };

  const comfort = result ? COMFORT_CONFIG[result.comfort] : null;

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <h1 className="text-xl font-semibold text-stone-800">
          Can I afford this?
        </h1>
        <p className="text-sm text-stone-400 mt-1">
          Get an honest, calm answer based on your actual plan.
        </p>
      </div>

      {/* Input form */}
      {!result && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 font-medium block mb-1.5">
                What is it?
              </label>
              <input
                type="text"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                placeholder="e.g. Airpods, New phone, Weekend trip"
                className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 text-stone-800 placeholder-stone-300"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 font-medium block mb-1.5">
                How much?
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                placeholder="Amount in KES"
                className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 text-stone-800 placeholder-stone-300"
              />
            </div>
            <button
              onClick={handleCheck}
              disabled={loading || !item.trim() || !amount}
              className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && comfort && (
        <div className="space-y-3">

          {/* Main verdict */}
          <div className={`${comfort.bg} ${comfort.border} border rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${comfort.dot}`} />
              <span className={`text-xs font-semibold uppercase tracking-wider ${comfort.text}`}>
                {comfort.label}
              </span>
            </div>
            <p className={`text-lg font-semibold ${comfort.text} mb-2`}>
              {result.message}
            </p>
            <p className="text-sm text-stone-600 leading-relaxed">
              {result.detail}
            </p>
          </div>

          {/* Numbers breakdown */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              The numbers
            </p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">{result.item}</span>
                <span className="text-sm font-semibold text-stone-800">
                  {formatKES(result.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">
                  Budget headroom this month
                </span>
                <span className="text-sm text-stone-700">
                  {formatKES(result.budget_headroom)}
                </span>
              </div>
              {result.budget_headroom > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-stone-500">After purchase</span>
                  <span className="text-sm text-stone-700">
                    {formatKES(Math.max(0, result.budget_headroom - result.amount))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Goal impact */}
          {result.goal_impact && result.goal_impact.days_delayed > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Goal impact
              </p>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{result.goal_impact.goal_emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-700">
                    {result.goal_impact.goal_name}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    May be delayed by ~{result.goal_impact.days_delayed}{" "}
                    {result.goal_impact.days_delayed === 1 ? "day" : "days"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-stone-700">
                    {Math.round(result.goal_impact.current_pct)}%
                  </p>
                  <p className="text-xs text-stone-400">progress</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
            >
              Check another
            </button>
            <a
              href="/budget"
              className="flex-1 py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors text-center"
            >
              See budget
            </a>
          </div>

        </div>
      )}

    </main>
  );
}