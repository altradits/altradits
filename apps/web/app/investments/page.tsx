"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type Investment = {
  id: string;
  name: string;
  institution: string;
  type: string;
  current_value: number;
  principal: number;
  currency: string;
  notes: string | null;
  is_active: boolean;
  started_at: string | null;
  matures_at: string | null;
  created_at: string;
};

type Summary = {
  total_invested: number;
  total_current_value: number;
  total_growth: number;
  allocation: Record<string, number>;
  freedom_score?: FreedomScore;
};

type FreedomScore = {
  monthly_expenses: number;
  estimated_passive: number;
  coverage_percent: number;
  message: string;
};

const TYPE_LABELS: Record<string, string> = {
  mmf: "Money Market",
  tbill: "Treasury Bill",
  bond: "Bond",
  stock: "Stock",
  etf: "ETF",
  sacco: "SACCO",
  fixed: "Fixed Deposit",
  crypto: "Crypto",
  other: "Other",
};

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Not set";
  return new Date(dateString).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function InvestmentCard({
  investment,
  onUpdate,
  onDelete,
}: {
  investment: Investment;
  onUpdate?: (id: string, newValue: number) => void;
  onDelete?: (id: string) => void;
}) {
  const typeEmoji: Record<string, string> = {
    mmf: "🏦",
    tbill: "📄",
    bond: "📑",
    stock: "📈",
    etf: "🏪",
    sacco: "👥",
    fixed: "🔒",
    crypto: "₿",
    other: "📦",
  };

  const growth = investment.current_value - investment.principal;
  const growthPercent =
    investment.principal > 0
      ? (growth / investment.principal) * 100
      : 0;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(investment.current_value);

  const handleUpdate = async () => {
    if (onUpdate) {
      onUpdate(investment.id, editValue);
    }
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{typeEmoji[investment.type] || "📦"}</div>
          <div>
            <p className="text-sm font-semibold text-stone-800">
              {investment.name}
            </p>
            <p className="text-xs text-stone-500">
              {investment.institution || "Private"}
            </p>
          </div>
        </div>
        <div className="text-right space-y-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                onBlur={handleUpdate}
                onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                className="w-24 px-2 py-1 text-sm font-semibold text-stone-800 border border-stone-200 rounded"
                autoFocus
              />
              <span className="text-xs text-stone-400">KES</span>
            </div>
          ) : (
            <p
              className="text-sm font-semibold text-stone-800 cursor-pointer hover:text-stone-600"
              onClick={() => setEditing(true)}
              title="Tap to update"
            >
              {formatKES(investment.current_value)}
            </p>
          )}
          {growth !== 0 && (
            <p className={`text-xs ${
              growth >= 0 ? "text-emerald-600" : "text-red-600"
            }`}>
              {growth >= 0 ? "+" : ""}{formatKES(growth)} ({growthPercent.toFixed(
                1
              )}%)
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs text-stone-500">
        <div>
          <p className="font-medium">Invested</p>
          <p>{formatKES(investment.principal)}</p>
        </div>
        <div>
          <p className="font-medium">Current Value</p>
          <p>{formatKES(investment.current_value)}</p>
        </div>
        <div>
          <p className="font-medium">Type</p>
          <p>{TYPE_LABELS[investment.type] ?? investment.type}</p>
        </div>
        <div>
          <p className="font-medium">Currency</p>
          <p>{investment.currency}</p>
        </div>
        <div>
          <p className="font-medium">Started</p>
          <p>{formatDate(investment.started_at)}</p>
        </div>
        <div>
          <p className="font-medium">Matures</p>
          <p>{formatDate(investment.matures_at)}</p>
        </div>
        <div>
          <p className="font-medium">Status</p>
          <p className={`text-xs ${
            investment.is_active ? "text-emerald-600" : "text-stone-500"
          }`}>
            {investment.is_active ? "Active" : "Inactive"}
          </p>
        </div>
        {investment.notes && (
          <div className="col-span-2">
            <p className="font-medium">Notes</p>
            <p className="text-stone-600">{investment.notes}</p>
          </div>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(investment.id)}
          className="mt-3 text-xs text-stone-400 hover:text-red-500 transition-colors"
        >
          Remove from picture
        </button>
      )}
    </div>
  );
}

export default function InvestmentsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [invRes, sumRes] = await Promise.all([
        apiFetch("/investments"),
        apiFetch("/investments/summary"),
      ]);

      if (invRes.status === 401 || sumRes.status === 401) {
        router.push("/login");
        return;
      }

      if (!invRes.ok || !sumRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const [invData, sumData] = await Promise.all([
        invRes.json(),
        sumRes.json(),
      ]);
      setInvestments(Array.isArray(invData) ? invData : []);
      setSummary(sumData);
    } catch (err) {
      setError("Could not reach the server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [token, router]);

  const handleUpdate = async (id: string, newValue: number) => {
    try {
      const res = await apiFetch(`/investments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ current_value: newValue }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update investment", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this position from your picture?")) return;
    try {
      const res = await apiFetch(`/investments/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete investment", err);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">{error}</p>
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">
            Your Investments
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Track your money working for you
          </p>
        </div>

        {/* Summary */}
        {summary && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                  Portfolio Summary
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-stone-500">Total Invested</p>
                  <p className="text-lg font-semibold text-stone-800">
                    {formatKES(summary.total_invested)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Current Value</p>
                  <p className="text-lg font-semibold text-stone-800">
                    {formatKES(summary.total_current_value)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Total Growth</p>
                  <p className={`text-lg font-semibold ${
                    summary.total_growth >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}>
                    {formatKES(summary.total_growth)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Growth %</p>
                  <p className={`text-lg font-semibold ${
                    summary.total_invested > 0
                      ? (summary.total_growth / summary.total_invested) * 100 >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                      : "text-stone-500"
                  }`}>
                    {summary.total_invested > 0
                      ? ((summary.total_growth / summary.total_invested) * 100).toFixed(
                          1
                        ) + "%"
                      : "0%"}
                  </p>
                </div>
              </div>

              {/* Allocation */}
              {Object.keys(summary.allocation).length > 0 && (
                <div className="mt-4 pt-3 border-t border-stone-50">
                  <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                    Money Split
                  </p>
                  <div className="space-y-2">
                    {Object.entries(summary.allocation).map(
                      ([type, percentage]) => {
                        const typeEmoji: Record<string, string> = {
                          mmf: "🏦",
                          tbill: "📄",
                          bond: "📑",
                          stock: "📈",
                          etf: "🏪",
                          sacco: "👥",
                          fixed: "🔒",
                          crypto: "₿",
                          other: "📦",
                        };

                        return (
                          <div key={type} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {typeEmoji[type] || "📦"}
                              </span>
                              <span className="text-sm text-stone-600">
                                {TYPE_LABELS[type] ?? type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-stone-700 font-medium">
                                {percentage.toFixed(1)}%
                              </span>
                              <div
                                className="w-10 bg-stone-100 rounded-full h-1.5"
                              >
                                <div
                                  className={`h-1.5 rounded-full bg-emerald-400`}
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {/* Freedom Score */}
              {summary.freedom_score && (
                <div className="mt-4 pt-3 border-t border-stone-50">
                  <div className="bg-stone-800 rounded-xl p-4">
                    <p className="text-xs text-stone-300 font-medium uppercase tracking-wider mb-2">
                      Freedom Score
                    </p>
                    <p className="text-2xl font-semibold text-white mb-1">
                      {summary.freedom_score.coverage_percent.toFixed(0)}%
                    </p>
                    <p className="text-xs text-stone-300">
                      {summary.freedom_score.message}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-stone-400">Monthly Expenses</p>
                        <p className="text-stone-200 font-medium">
                          {formatKES(summary.freedom_score.monthly_expenses)}
                        </p>
                      </div>
                      <div>
                        <p className="text-stone-400">Passive Income</p>
                        <p className="text-stone-200 font-medium">
                          {formatKES(summary.freedom_score.estimated_passive)}/mo
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Investments List */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Positions
              </p>
              <p className="text-xl font-semibold text-stone-800">
                {investments.length}
              </p>
            </div>
            <a
              href="/investments/new"
              className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
            >
              + Add Position
            </a>
          </div>

          {investments.length > 0 ? (
            <div className="space-y-3">
              {investments.map((inv) => (
                <InvestmentCard
                  key={inv.id}
                  investment={inv}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400">
                No investments yet. Add your first position to start tracking.
              </p>
            </div>
          )}
        </div>

        {/* Nav row */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <a
            href="/budget"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Budget
          </a>
          <a
            href="/goals"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Goals
          </a>
          <a
            href="/affordability"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Can I afford it?
          </a>
          <a
            href="/sms"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            📱 SMS
          </a>
          <a
            href="/capture"
            className="col-span-2 text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            + Capture
          </a>
        </div>
      </div>
    </main>
  );
}