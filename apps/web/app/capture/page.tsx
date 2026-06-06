"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

type Transaction = {
  id: string;
  description: string;
  amount: number;
  category: string;
  source: string;
  created_at: string;
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

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function CapturePage() {
  const [input, setInput] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent transactions on mount
  useEffect(() => {
    apiFetch("/capture/recent")
      .then((r) => r.json())
      .then((data) => setTransactions(data.transactions || []))
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const raw = input.trim();
    if (!raw) return;

    setLoading(true);
    setFeedback(null);
    setError(null);

    try {
      const res = await apiFetch("/capture", {
        method: "POST",
        body: JSON.stringify({ raw }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      // Show the friendly message
      setFeedback(data.message);
      setInput("");

      // Prepend to the list
      setTransactions((prev) => [data.transaction, ...prev].slice(0, 20));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const formatAmount = (amount: number) =>
    `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <h1 className="text-xl font-semibold text-stone-800">What happened today?</h1>
        <p className="text-sm text-stone-400 mt-1">
          Type anything — "Lunch 300", "Oak 5k", "Send mum 2k"
        </p>
      </div>

      {/* Input */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-4">
        <div className="flex gap-3 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setFeedback(null);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Lunch 300"
            disabled={loading}
            className="flex-1 text-base text-stone-800 placeholder-stone-300 outline-none bg-transparent"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-emerald-700">{feedback}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Today
          </p>
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {CATEGORY_EMOJI[tx.category] ?? "📝"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-stone-700">
                      {tx.description}
                    </p>
                    <p className="text-xs text-stone-400 capitalize">
                      {tx.category} · {formatTime(tx.created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-stone-800">
                  {formatAmount(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-stone-300 text-sm">No entries yet.</p>
          <p className="text-stone-300 text-xs mt-1">
            Type something above to start.
          </p>
        </div>
      )}

    </main>
  );
}