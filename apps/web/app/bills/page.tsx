"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Frequency = "weekly" | "monthly" | "yearly";

type Bill = {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  category: string;
  frequency: Frequency;
  next_due_date: string;
  days_until_due: number;
  active: boolean;
  created_at: string;
};

const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];

const EMOJI_OPTIONS = ["🧾", "💡", "📱", "🌐", "💧", "🔥", "🏠", "🚗", "📺", "🏥", "📚", "🎓"];

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

const CATEGORIES = Object.keys(CATEGORY_LABEL);

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function dueLabel(b: Bill) {
  if (b.days_until_due < 0) {
    const days = Math.abs(b.days_until_due);
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (b.days_until_due === 0) return "Due today";
  if (b.days_until_due === 1) return "Due tomorrow";
  return `Due in ${b.days_until_due} days`;
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmoji, setFormEmoji] = useState("🧾");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("bills");
  const [formFrequency, setFormFrequency] = useState<Frequency>("monthly");
  const [formDueDate, setFormDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    apiFetch("/bills")
      .then((r) => r.json())
      .then((d) => { setBills(d.bills || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setFormName("");
    setFormEmoji("🧾");
    setFormAmount("");
    setFormCategory("bills");
    setFormFrequency("monthly");
    setFormDueDate("");
    setFormError(null);
  };

  const openNewForm = () => {
    resetForm();
    setEditingId(null);
    setShowForm(true);
    setFeedback(null);
  };

  const openEditForm = (b: Bill) => {
    setFormName(b.name);
    setFormEmoji(b.emoji);
    setFormAmount(String(b.amount));
    setFormCategory(b.category);
    setFormFrequency(b.frequency);
    setFormDueDate(b.next_due_date);
    setFormError(null);
    setEditingId(b.id);
    setShowForm(true);
    setFeedback(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
  };

  const handleSave = async () => {
    const amount = parseFloat(formAmount);
    if (!formName.trim() || !amount || amount <= 0 || !formDueDate) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: formName.trim(),
        emoji: formEmoji,
        amount,
        category: formCategory,
        frequency: formFrequency,
        next_due_date: formDueDate,
      };
      const res = editingId
        ? await apiFetch(`/bills/${editingId}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch("/bills", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Could not save bill");
        return;
      }
      setFeedback(data.message);
      closeForm();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    const res = await apiFetch(`/bills/${id}/toggle`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setFeedback(data.message);
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return;
    await apiFetch(`/bills/${id}`, { method: "DELETE" });
    load();
  };

  const active = bills.filter((b) => b.active);
  const paused = bills.filter((b) => !b.active);

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">Bills</h1>
            <p className="text-sm text-stone-400 mt-1">Recurring expenses & reminders</p>
          </div>
          <button
            onClick={() => (showForm ? closeForm() : openNewForm())}
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

      {/* New/edit bill form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
          <p className="text-sm font-medium text-stone-700 mb-4">
            {editingId ? "Edit bill" : "New bill"}
          </p>

          {/* Emoji picker */}
          <div className="flex flex-wrap gap-2 mb-4">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setFormEmoji(e)}
                className={`text-xl p-1.5 rounded-lg transition-colors ${
                  formEmoji === e
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
            placeholder="Bill name (e.g. Rent)"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-stone-400"
          />

          <input
            type="number"
            placeholder="Amount (KES)"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-stone-400"
          />

          {/* Category picker */}
          <div className="flex flex-wrap gap-2 mb-3">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFormCategory(c)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  formCategory === c
                    ? "bg-stone-800 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          {/* Frequency picker */}
          <div className="flex gap-2 mb-3">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormFrequency(f)}
                className={`flex-1 py-2 text-sm font-medium rounded-xl capitalize transition-colors ${
                  formFrequency === f
                    ? "bg-stone-800 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.target.value)}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-4 outline-none focus:border-stone-400 text-stone-500"
          />

          {formError && (
            <p className="text-xs text-red-500 mb-3">{formError}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !formName.trim() || !formAmount || !formDueDate}
            className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : `Add ${formEmoji} ${formName || "bill"}`}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-sm text-stone-400 text-center py-12">Loading your bills...</p>
      )}

      {/* Active bills */}
      {!loading && active.length > 0 && (
        <div className="space-y-3 mb-6">
          {active.map((b) => {
            const urgent = b.days_until_due <= 3;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{b.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-stone-700">{b.name}</p>
                      <p className="text-xs text-stone-400">
                        {CATEGORY_LABEL[b.category] ?? b.category} · {b.frequency}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-stone-800">{formatKES(b.amount)}</p>
                    <p className={`text-xs ${urgent ? "text-amber-500" : "text-stone-400"}`}>
                      {dueLabel(b)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-stone-50">
                  <button onClick={() => openEditForm(b)} className="text-xs text-stone-400 hover:text-stone-600">
                    Edit
                  </button>
                  <button onClick={() => handleToggle(b.id)} className="text-xs text-stone-400 hover:text-stone-600">
                    Pause
                  </button>
                  <button onClick={() => handleDelete(b.id, b.name)} className="text-xs text-stone-300 hover:text-stone-400 ml-auto">
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && active.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-stone-300 text-sm">No bills yet.</p>
          <p className="text-stone-300 text-xs mt-1">
            Tap <strong>+ New</strong> to add your first recurring bill.
          </p>
        </div>
      )}

      {/* Paused bills */}
      {paused.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Paused
          </p>
          <div className="space-y-2">
            {paused.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{b.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-stone-700">{b.name}</p>
                    <p className="text-xs text-stone-400">{formatKES(b.amount)} / {b.frequency}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleToggle(b.id)} className="text-xs text-emerald-600 hover:text-emerald-700">
                    Resume
                  </button>
                  <button onClick={() => handleDelete(b.id, b.name)} className="text-stone-300 hover:text-stone-400 text-xs">
                    ✕
                  </button>
                </div>
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
