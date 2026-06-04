"use client";

import { useState, useEffect } from "react";

type CurrentState = {
  total_invested: number;
  total_value: number;
  estimated_passive: number;
  avg_monthly_expenses: number;
  avg_monthly_savings: number;
  coverage_percent: number;
};

type Target = {
  monthly_savings: number;
  target_passive: number;
  assumed_return_pct: number;
};

type ProjectionYear = {
  year: number;
  years_from_now: number;
  portfolio_value: number;
  passive_income: number;
  expenses: number;
  is_freedom: boolean;
};

type Plan = {
  current_state: CurrentState;
  target: Target;
  projection: ProjectionYear[];
  freedom_year: number | null;
  message: string;
  milestone: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function formatKESFull(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function CoverageBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-stone-200 rounded-full h-2">
      <div
        className="h-2 rounded-full bg-emerald-400 transition-all duration-700"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

// Mini projection chart — rendered as SVG bars
function ProjectionChart({
  projection,
  expenses,
}: {
  projection: ProjectionYear[];
  expenses: number;
}) {
  const maxPassive = Math.max(...projection.map((y) => y.passive_income), expenses);
  const display = projection.slice(0, 20); // show max 20 years

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-1.5 min-w-0" style={{ height: 120 }}>
        {display.map((y) => {
          const barH = Math.max((y.passive_income / maxPassive) * 100, 2);
          const expH = Math.max((y.expenses / maxPassive) * 100, 2);
          return (
            <div key={y.year} className="flex flex-col items-center flex-1 min-w-0 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-stone-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                {y.year}: {formatKES(y.passive_income)}/mo
              </div>
              {/* Bar */}
              <div className="w-full flex items-end gap-px" style={{ height: 100 }}>
                {/* Passive income bar */}
                <div
                  className={`flex-1 rounded-t transition-all duration-300 ${
                    y.is_freedom ? "bg-emerald-400" : "bg-emerald-200"
                  }`}
                  style={{ height: `${barH}%` }}
                />
                {/* Expenses line marker (subtle) */}
                <div
                  className="flex-1 rounded-t bg-stone-200"
                  style={{ height: `${expH}%` }}
                />
              </div>
              {/* Year label */}
              <p className={`text-xs mt-1 ${
                y.is_freedom ? "text-emerald-500 font-bold" : "text-stone-400"
              }`}>
                {y.year.toString().slice(2)}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded bg-emerald-300" />
          <span className="text-xs text-stone-400">Passive income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded bg-stone-200" />
          <span className="text-xs text-stone-400">Monthly expenses</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded bg-emerald-400" />
          <span className="text-xs text-stone-400">Freedom year</span>
        </div>
      </div>
    </div>
  );
}

export default function FreedomPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Target form state
  const [newSavings, setNewSavings] = useState("");
  const [newPassive, setNewPassive] = useState("");
  const [newReturn, setNewReturn] = useState("12");
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`${API}/freedom`)
      .then((r) => r.json())
      .then((d) => { setPlan(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSaveTarget = async () => {
    if (!newSavings || !newPassive) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/freedom/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_savings: parseFloat(newSavings),
          target_passive: parseFloat(newPassive),
          assumed_return_pct: parseFloat(newReturn) || 12,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message);
        setShowTargetForm(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">
        <p className="text-stone-400 text-sm text-center pt-20">
          Calculating your freedom plan...
        </p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">
        <p className="text-red-400 text-sm text-center pt-20">
          Could not load freedom plan. Is the backend running?
        </p>
      </main>
    );
  }

  const { current_state: cs, target, projection, freedom_year, message } = plan;
  const freedomPoint = projection.find((y) => y.is_freedom);

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">

        {/* Header */}
        <div className="pt-10 pb-6">
          <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
            ← Altradits
          </a>
          <h1 className="text-xl font-semibold text-stone-800">
            Financial Freedom
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            When your money works so you don't have to.
          </p>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-emerald-700">{feedback}</p>
          </div>
        )}

        {/* Freedom year banner */}
        {freedom_year ? (
          <div className="bg-stone-800 rounded-2xl p-6 mb-4 text-center">
            <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-2">
              Projected freedom year
            </p>
            <p className="text-5xl font-bold text-emerald-400 mb-2">
              {freedom_year}
            </p>
            <p className="text-sm text-stone-400">
              {freedomPoint
                ? `${formatKES(freedomPoint.passive_income)}/mo passive income`
                : "Keep the momentum going."}
            </p>
          </div>
        ) : (
          <div className="bg-stone-800 rounded-2xl p-6 mb-4 text-center">
            <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-2">
              Freedom timeline
            </p>
            <p className="text-lg font-medium text-stone-300 mb-1">
              Set a monthly savings target
            </p>
            <p className="text-sm text-stone-500">
              to see when you reach financial freedom.
            </p>
          </div>
        )}

        {/* Message */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 mb-4">
          <p className="text-sm text-stone-600 leading-relaxed">{message}</p>
          {plan.milestone && (
            <p className="text-xs text-emerald-500 font-medium mt-2">
              🌱 {plan.milestone}
            </p>
          )}
        </div>

        {/* Current state */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-4">
            Where you are today
          </p>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-500">Portfolio value</span>
              <span className="text-sm font-semibold text-stone-800">
                {formatKESFull(cs.total_value)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-500">Passive income / mo</span>
              <span className="text-sm font-semibold text-stone-800">
                {formatKESFull(cs.estimated_passive)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-500">Monthly expenses</span>
              <span className="text-sm font-semibold text-stone-800">
                {formatKESFull(cs.avg_monthly_expenses)}
              </span>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-stone-500">Coverage</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {cs.coverage_percent.toFixed(0)}%
                </span>
              </div>
              <CoverageBar percent={cs.coverage_percent} />
            </div>
          </div>
        </div>

        {/* Projection chart */}
        {projection && projection.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Projection
              </p>
              <p className="text-xs text-stone-400">
                {target.assumed_return_pct}% p.a. assumed
              </p>
            </div>
            <ProjectionChart
              projection={projection}
              expenses={cs.avg_monthly_expenses}
            />
          </div>
        )}

        {/* Projection table — first 10 years */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-4">
            Year by year
          </p>
          <div className="space-y-2">
            {projection.slice(0, 10).map((y) => (
              <div
                key={y.year}
                className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${
                  y.is_freedom ? "bg-emerald-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    y.is_freedom ? "text-emerald-600" : "text-stone-500"
                  }`}>
                    {y.year}
                  </span>
                  {y.is_freedom && (
                    <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                      Freedom 🌱
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    y.is_freedom ? "text-emerald-600" : "text-stone-800"
                  }`}>
                    {formatKES(y.passive_income)}/mo
                  </p>
                  <p className="text-xs text-stone-400">
                    {formatKES(y.portfolio_value)} total
                  </p>
                </div>
              </div>
            ))}
          </div>
          {projection.length > 10 && (
            <p className="text-xs text-stone-400 text-center mt-3">
              Showing first 10 of {projection.length} years
            </p>
          )}
        </div>

        {/* Target settings */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
              Your targets
            </p>
            <button
              onClick={() => {
                setShowTargetForm(!showTargetForm);
                setNewSavings(String(target.monthly_savings));
                setNewPassive(String(target.target_passive));
                setNewReturn(String(target.assumed_return_pct));
              }}
              className="text-xs text-stone-500 hover:text-stone-700"
            >
              {showTargetForm ? "Cancel" : "Edit"}
            </button>
          </div>

          {showTargetForm ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-400 block mb-1">
                  Monthly savings / investment (KES)
                </label>
                <input
                  type="number"
                  value={newSavings}
                  onChange={(e) => setNewSavings(e.target.value)}
                  className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400"
                />
              </div>
              <div>
                <label className="text-xs text-stone-400 block mb-1">
                  Target monthly passive income (KES)
                </label>
                <input
                  type="number"
                  value={newPassive}
                  onChange={(e) => setNewPassive(e.target.value)}
                  className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400"
                />
              </div>
              <div>
                <label className="text-xs text-stone-400 block mb-1">
                  Assumed annual return (%)
                </label>
                <input
                  type="number"
                  value={newReturn}
                  onChange={(e) => setNewReturn(e.target.value)}
                  step="0.5"
                  className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400"
                />
              </div>
              <button
                onClick={handleSaveTarget}
                disabled={saving || !newSavings || !newPassive}
                className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
              >
                {saving ? "Saving..." : "Update freedom target →"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Monthly savings</span>
                <span className="text-sm font-medium text-stone-800">
                  {formatKESFull(target.monthly_savings)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Target passive income</span>
                <span className="text-sm font-medium text-stone-800">
                  {formatKESFull(target.target_passive)}/mo
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Assumed return</span>
                <span className="text-sm font-medium text-stone-800">
                  {target.assumed_return_pct}% p.a.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-stone-400 text-center leading-relaxed px-4 mb-6">
          Projections are estimates based on consistent monthly investing
          at the assumed return rate. Actual returns vary. This is a
          planning tool, not financial advice.
        </p>

        {/* Nav */}
        <div className="flex gap-3">
          <a
            href="/investments"
            className="flex-1 text-center py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Investments
          </a>
          <a
            href="/goals"
            className="flex-1 text-center py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Goals
          </a>
        </div>

      </div>
    </main>
  );
}
