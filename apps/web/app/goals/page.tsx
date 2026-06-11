"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Goal = {
  id: string;
  name: string;
  emoji: string;
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  currency: "kes" | "sats";
  deadline: string | null;
  completed: boolean;
  completed_at: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatAmount(g: Goal, value: number) {
  return g.currency === "sats" ? formatSats(value) : formatKES(value);
}

function ProgressBar({ percent, completed }: { percent: number; completed: boolean }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1.5 mt-3">
      <div
        className={`h-1.5 rounded-full transition-all duration-700 ${
          completed ? "bg-emerald-500" : "bg-emerald-400"
        }`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

const EMOJI_OPTIONS = ["🎯","🛡️","🎂","💻","✈️","🏠","📚","🕊️","💍","🚗","🎓","💰","₿"];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New goal form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newEmoji, setNewEmoji] = useState("🎯");
  const [newCurrency, setNewCurrency] = useState<"kes" | "sats">("kes");
  const [newDeadline, setNewDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  // Contribute
  const [contributing, setContributing] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeError, setContributeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Wallet balance, shown as a hint when moving sats into a goal
  const [walletSats, setWalletSats] = useState<number | null>(null);

  const load = () => {
    apiFetch("/goals")
      .then((r) => r.json())
      .then((d) => { setGoals(d.goals || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const loadWalletBalance = () => {
    apiFetch("/wallet/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWalletSats(d ? d.sats_balance : null))
      .catch(() => setWalletSats(null));
  };

  useEffect(() => { load(); loadWalletBalance(); }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newTarget) return;
    setCreating(true);
    try {
      const res = await apiFetch("/goals", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          emoji: newEmoji,
          target: parseFloat(newTarget),
          currency: newCurrency,
          deadline: newDeadline || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message);
        setShowForm(false);
        setNewName(""); setNewTarget(""); setNewEmoji("🎯"); setNewCurrency("kes"); setNewDeadline("");
        load();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleContribute = async (id: string) => {
    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setContributeError(null);
    try {
      const res = await apiFetch(`/goals/${id}/contribute`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContributeError(data.error || "Could not update goal");
        return;
      }
      setFeedback(data.message);
      setContributing(null);
      setContributeAmount("");
      load();
      loadWalletBalance();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return;
    await apiFetch(`/goals/${id}`, { method: "DELETE" });
    load();
  };

  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">Goals</h1>
            <p className="text-sm text-stone-400 mt-1">What you are saving toward</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setFeedback(null); }}
            className="px-3 py-1.5 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
          >
            {showForm ? "Cancel" : "+ New"}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-emerald-700">{feedback}</p>
        </div>
      )}

      {/* New goal form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
          <p className="text-sm font-medium text-stone-700 mb-4">New goal</p>

          {/* Emoji picker */}
          <div className="flex flex-wrap gap-2 mb-4">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setNewEmoji(e)}
                className={`text-xl p-1.5 rounded-lg transition-colors ${
                  newEmoji === e
                    ? "bg-stone-800 text-white"
                    : "bg-stone-100 hover:bg-stone-200"
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Goal name (e.g. Laptop)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-stone-400"
          />

          {/* Currency toggle */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setNewCurrency("kes")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
                newCurrency === "kes"
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              KES
            </button>
            <button
              type="button"
              onClick={() => setNewCurrency("sats")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
                newCurrency === "sats"
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              ⚡ Sats
            </button>
          </div>

          <input
            type="number"
            placeholder={newCurrency === "sats" ? "Target amount (sats)" : "Target amount (KES)"}
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-stone-400"
          />
          {newCurrency === "sats" && (
            <p className="text-xs text-stone-300 -mt-2 mb-3">
              Sats are moved here from your Lightning wallet as you contribute.
            </p>
          )}
          <input
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-4 outline-none focus:border-stone-400 text-stone-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !newTarget}
            className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
          >
            {creating ? "Creating..." : `Create ${newEmoji} ${newName || "goal"}`}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-sm text-stone-400 text-center py-12">Loading your goals...</p>
      )}

      {/* Active goals */}
      {!loading && active.length > 0 && (
        <div className="space-y-3 mb-6">
          {active.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              {/* Goal header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{g.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-stone-800">{g.name}</p>
                      {g.currency === "sats" && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5">
                          ⚡ sats
                        </span>
                      )}
                    </div>
                    {g.deadline && (
                      <p className="text-xs text-stone-400">by {g.deadline}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(g.id, g.name)}
                  className="text-stone-300 hover:text-stone-400 text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Amounts */}
              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="text-lg font-semibold text-stone-800">
                    {formatAmount(g, g.saved)}
                  </p>
                  <p className="text-xs text-stone-400">
                    of {formatAmount(g, g.target)} · {Math.round(g.percent)}%
                  </p>
                </div>
                <p className="text-sm text-stone-500">
                  {formatAmount(g, g.remaining)} to go
                </p>
              </div>

              {/* Progress bar */}
              <ProgressBar percent={g.percent} completed={false} />

              {/* Contribute */}
              {contributing === g.id ? (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="number"
                      placeholder={g.currency === "sats" ? "Amount (sats)" : "Amount"}
                      value={contributeAmount}
                      onChange={(e) => setContributeAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleContribute(g.id);
                        if (e.key === "Escape") {
                          setContributing(null);
                          setContributeAmount("");
                          setContributeError(null);
                        }
                      }}
                      className="flex-1 text-sm border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-stone-400"
                    />
                    <button
                      onClick={() => handleContribute(g.id)}
                      disabled={saving}
                      className="px-3 py-2 bg-stone-800 text-white text-sm rounded-xl disabled:opacity-30"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setContributing(null); setContributeAmount(""); setContributeError(null); }}
                      className="px-3 py-2 text-stone-400 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                  {g.currency === "sats" && walletSats !== null && (
                    <p className="text-xs text-stone-300 mt-1.5">
                      {formatSats(walletSats)} available in your wallet
                    </p>
                  )}
                  {contributeError && (
                    <p className="text-xs text-red-500 mt-1.5">{contributeError}</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setContributing(g.id); setFeedback(null); setContributeError(null); }}
                  className="mt-3 w-full text-sm text-stone-500 py-2 border border-stone-100 rounded-xl hover:bg-stone-50 transition-colors"
                >
                  {g.currency === "sats" ? "+ Move sats from wallet" : "+ Add money"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && active.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-stone-300 text-sm">No goals yet.</p>
          <p className="text-stone-300 text-xs mt-1">
            Tap <strong>+ New</strong> to create your first one.
          </p>
        </div>
      )}

      {/* Completed goals */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Completed 🎉
          </p>
          <div className="space-y-2">
            {completed.map((g) => (
              <div
                key={g.id}
                className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center justify-between opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{g.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-stone-700 line-through">
                      {g.name}
                    </p>
                    <p className="text-xs text-emerald-500">
                      {formatAmount(g, g.target)} reached 🌱
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(g.id, g.name)}
                  className="text-stone-300 hover:text-stone-400 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="mt-8 pt-6 border-t border-stone-100 flex gap-3">
        <a
          href="/capture"
          className="flex-1 text-center px-4 py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
        >
          + Capture
        </a>
        <a
          href="/budget"
          className="flex-1 text-center px-4 py-3 bg-white border border-stone-200 text-stone-700 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
        >
          Budget
        </a>
      </div>

    </main>
  );
}
