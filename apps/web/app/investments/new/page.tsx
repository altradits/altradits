"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type CreateInput = {
  name: string;
  institution: string;
  type: string;
  principal: number;
  current_value: number;
  notes: string;
  started_at: string;
  matures_at: string;
};

const INVESTMENT_TYPES = [
  { value: "mmf", label: "Money Market Fund" },
  { value: "tbill", label: "Treasury Bill" },
  { value: "bond", label: "Bond" },
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "sacco", label: "SACCO" },
  { value: "fixed", label: "Fixed Deposit" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];

export default function NewInvestmentPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [form, setForm] = useState<CreateInput>({
    name: "",
    institution: "",
    type: "mmf",
    principal: 0,
    current_value: 0,
    notes: "",
    started_at: "",
    matures_at: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (form.principal < 1) {
      setError("Amount invested must be at least KES 1.");
      setLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      principal: form.principal,
    };
    if (form.institution.trim()) payload.institution = form.institution.trim();
    if (form.current_value > 0) payload.current_value = form.current_value;
    if (form.notes.trim()) payload.notes = form.notes.trim();
    if (form.started_at) payload.started_at = form.started_at;
    if (form.matures_at) payload.matures_at = form.matures_at;

    try {
      const res = await apiFetch("/investments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create investment");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/investments");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save investment. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl mb-2">🌱</p>
          <p className="text-stone-600">Investment added! Redirecting...</p>
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
            Add Position
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Log a new investment
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              required
            >
              {INVESTMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Oak Special Fund"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Institution
            </label>
            <input
              type="text"
              value={form.institution}
              onChange={(e) =>
                setForm({ ...form, institution: e.target.value })
              }
              placeholder="e.g., Old Mutual"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Amount Invested
              </label>
              <input
                type="number"
                value={form.principal || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    principal: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0"
                min="1"
                step="1000"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Current Value
              </label>
              <input
                type="number"
                value={form.current_value || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    current_value: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="Same as invested"
                min="1"
                step="1000"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Started Date
            </label>
            <input
              type="date"
              value={form.started_at}
              onChange={(e) =>
                setForm({ ...form, started_at: e.target.value })
              }
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Matures Date (optional)
            </label>
            <input
              type="date"
              value={form.matures_at}
              onChange={(e) =>
                setForm({ ...form, matures_at: e.target.value })
              }
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any notes..."
              rows={3}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Position"}
          </button>
        </form>

        <a
          href="/investments"
          className="block text-center text-xs text-stone-400 mt-4"
        >
          ← Back to investments
        </a>
      </div>
    </main>
  );
}