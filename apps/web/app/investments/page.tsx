"use client";

import { useEffect, useState } from "react";

type Investment = {
  id: string;
  name: string;
  institution: string;
  type: string;
  current_value: number;
  invested_amount: number;
  currency: string;
  notes: string;
  is_active: boolean;
  started_at: string | null;
  matures_at: string | null;
  created_at: string;
  updated_at: string;
};

type Summary = {
  total_invested: number;
  total_current_value: number;
  total_growth: number;
  allocation: Record<string, number>;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
}: {
  investment: Investment;
}) {
  const typeEmoji: Record<string, string> = {
    mmf: "🏦",
    tbill: "📄",
    bond: "📑",
    stock: "📈",
    etf: "🏪",
    saccos: "👥",
    fixed: "🔒",
    crypto: "₿",
    other: "📦",
  };

  const growth = investment.current_value - investment.invested_amount;
  const growthPercent =
    investment.invested_amount > 0
      ? (growth / investment.invested_amount) * 100
      : 0;

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
          <p className="text-sm font-semibold text-stone-800">
            {formatKES(investment.current_value)}
          </p>
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
          <p>{formatKES(investment.invested_amount)}</p>
        </div>
        <div>
          <p className="font-medium">Current Value</p>
          <p>{formatKES(investment.current_value)}</p>
        </div>
        <div>
          <p className="font-medium">Type</p>
          <p>
            {investment.type
              .split(/(?=[A-Z])/)
              .join(" ")
              .toUpperCase()}
          </p>
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
    </div>
  );
}

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [invRes, sumRes] = await Promise.all([
          fetch(`${API}/investments`),
          fetch(`${API}/investments/summary`),
        ]);

        if (invRes.ok && sumRes.ok) {
          const [invData, sumData] = await Promise.all([
            invRes.json(),
            sumRes.json(),
          ]);
          setInvestments(invData);
          setSummary(sumData);
        } else {
          throw new Error("Failed to fetch data");
        }
      } catch (err) {
        setError("Could not reach the server.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
                          saccos: "👥",
                          fixed: "🔒",
                          crypto: "₿",
                          other: "📦",
                        };
                        const formattedType = type
                          .split(/(?=[A-Z])/)
                          .join(" ")
                          .toUpperCase();

                        return (
                          <div key={type} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {typeEmoji[type] || "📦"}
                              </span>
                              <span className="text-sm text-stone-600 capitalize">
                                {formattedType}
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
              {investments.map((inv, index) => (
                <InvestmentCard key={inv.id} investment={inv} />
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