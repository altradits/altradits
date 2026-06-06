"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CategoryBudget = {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
  percent: number;
  period: string;
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️",
  transport: "🚗",
  family: "👨‍👩‍👧",
  investments: "🌱",
  bills: "💡",
  fun: "🎉",
  savings: "💰",
  health: "💊",
  uncategorized: "📝",
};

const CATEGORY_LABEL: Record<string, string> = {
  food: "Food",
  transport: "Transport",
  family: "Family",
  investments: "Grow Money",
  bills: "Bills",
  fun: "Fun",
  savings: "Save",
  health: "Health",
  uncategorized: "Other",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(amount: number) {
  return `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function ProgressBar({ percent, over }: { percent: number; over: boolean }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1.5 mt-2">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${
          over ? "bg-amber-400" : "bg-emerald-400"
        }`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = () => {
    apiFetch("/budget")
      .then((r) => r.json())
      .then((data) => {
        setBudgets(data.budgets || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalAllocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalPercent = totalAllocated > 0
    ? Math.min((totalSpent / totalAllocated) * 100, 100)
    : 0;

  const startEdit = (b: CategoryBudget) => {
    setEditing(b.category);
    setEditValue(String(b.allocated));
    setFeedback(null);
  };

  const saveEdit = async (category: string) => {
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) return;

    setSaving(true);
    try {
      const res = await apiFetch("/budget", {
        method: "POST",
        body: JSON.stringify({ category, amount }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message);
        setEditing(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <h1 className="text-xl font-semibold text-stone-800">Budget</h1>
        <p className="text-sm text-stone-400 mt-1">
          How your money is moving this month
        </p>
      </div>

      {/* Monthly overview card */}
      {!loading && budgets.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                This month
              </p>
              <p className="text-2xl font-semibold text-stone-800 mt-1">
                {formatKES(totalSpent)}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                of {formatKES(totalAllocated)} planned
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-stone-600">
                {formatKES(totalAllocated - totalSpent)}
              </p>
              <p className="text-xs text-stone-400">remaining</p>
            </div>
          </div>
          <ProgressBar
            percent={totalPercent}
            over={totalSpent > totalAllocated}
          />
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-emerald-700">{feedback}</p>
        </div>
      )}

      {/* Category list */}
      {loading && (
        <p className="text-sm text-stone-400 text-center py-12">
          Loading your budget...
        </p>
      )}

      {!loading && (
        <div className="space-y-3">
          {budgets
            .filter((b) => b.category !== "uncategorized")
            .map((b) => {
              const over = b.spent > b.allocated && b.allocated > 0;
              const isEditing = editing === b.category;

              return (
                <div
                  key={b.id}
                  className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {CATEGORY_EMOJI[b.category] ?? "📝"}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-stone-700">
                          {CATEGORY_LABEL[b.category] ?? b.category}
                        </p>
                        <p className="text-xs text-stone-400">
                          {formatKES(b.spent)} spent
                          {b.allocated > 0 && ` · ${Math.round(b.percent)}%`}
                        </p>
                      </div>
                    </div>

                    {/* Allocated amount / edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(b.category);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="w-24 text-sm text-right border border-stone-200 rounded-lg px-2 py-1 outline-none focus:border-stone-400"
                        />
                        <button
                          onClick={() => saveEdit(b.category)}
                          disabled={saving}
                          className="text-xs text-emerald-600 font-medium hover:text-emerald-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs text-stone-400 hover:text-stone-600"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(b)}
                        className="text-right group"
                      >
                        <p className={`text-sm font-semibold ${over ? "text-amber-500" : "text-stone-800"}`}>
                          {formatKES(b.allocated)}
                        </p>
                        <p className="text-xs text-stone-300 group-hover:text-stone-400 transition-colors">
                          tap to edit
                        </p>
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  {b.allocated > 0 && (
                    <ProgressBar percent={b.percent} over={over} />
                  )}

                  {/* Over budget message */}
                  {over && (
                    <p className="text-xs text-amber-500 mt-1.5">
                      {CATEGORY_LABEL[b.category]} felt fuller this month.
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Quick link to capture */}
      <div className="mt-8 pt-6 border-t border-stone-100">
        <a
          href="/capture"
          className="block w-full text-center px-4 py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
        >
          + Add entry
        </a>
      </div>

    </main>
  );
}