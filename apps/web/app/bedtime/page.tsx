"use client";

import { useState, useEffect } from "react";

type CategorySummary = {
  category: string;
  amount: number;
  count: number;
};

type DayReview = {
  date: string;
  total_spent: number;
  total_entries: number;
  categories: CategorySummary[];
  already_closed: boolean;
  snapshot_id: string | null;
};

type CoachingNote = {
  note: string;
  tomorrow_hint: string;
};

type Snapshot = {
  id: string;
  snapshot_date: string;
  total_spent: number;
  total_entries: number;
  coaching_note: string | null;
  tomorrow_preview: string | null;
  closed_at: string | null;
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", transport: "🚗", family: "👨‍👩‍👧",
  investments: "🌱", bills: "💡", fun: "🎉",
  savings: "💰", health: "💊", uncategorized: "📝",
};

const MOOD_OPTIONS = [
  { value: "calm",    label: "Calm",    emoji: "😌" },
  { value: "okay",    label: "Okay",    emoji: "🙂" },
  { value: "harder",  label: "Harder",  emoji: "😔" },
  { value: "stressed",label: "Stressed",emoji: "😤" },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

// The 5 steps of the bedtime flow
type Step = "review" | "reflect" | "coaching" | "tomorrow" | "closed";

export default function BedtimePage() {
  const [step, setStep] = useState<Step>("review");
  const [review, setReview] = useState<DayReview | null>(null);
  const [coaching, setCoaching] = useState<CoachingNote | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  // Reflect step state
  const [mood, setMood] = useState<string>("");
  const [reflection, setReflection] = useState("");

  useEffect(() => {
    fetch(`${API}/bedtime/review`)
      .then((r) => r.json())
      .then((data) => {
        setReview(data.review);
        setCoaching(data.coaching);
        if (data.review?.already_closed) {
          setStep("closed");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await fetch(`${API}/bedtime/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflection, mood }),
      });
      const data = await res.json();
      if (res.ok) {
        setSnapshot(data.snapshot);
        setStep("closed");
      }
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-900 flex items-center justify-center">
        <p className="text-stone-500 text-sm">Preparing your evening...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-900 text-stone-100 flex flex-col">
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full p-6">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <a href="/" className="text-xs text-stone-600 hover:text-stone-400">
            ← Altradits
          </a>
          <p className="text-xs text-stone-600">
            {new Date().toLocaleDateString("en-KE", {
              weekday: "long", day: "numeric", month: "long"
            })}
          </p>
        </div>

        {/* ── STEP 1: Review ─────────────────────────────────── */}
        {step === "review" && review && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <p className="text-stone-500 text-sm mb-2">Ready to close today?</p>
              <h1 className="text-2xl font-semibold text-stone-100">
                {review.total_entries === 0
                  ? "Quiet day. 🌙"
                  : `You tracked ${review.total_entries} ${review.total_entries === 1 ? "entry" : "entries"}.`}
              </h1>
            </div>

            {/* Spending summary */}
            {review.total_entries > 0 && (
              <div className="bg-stone-800 rounded-2xl p-5 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-xs text-stone-500 uppercase tracking-wider font-medium">
                    Today's spending
                  </p>
                  <p className="text-lg font-semibold text-stone-100">
                    {formatKES(review.total_spent)}
                  </p>
                </div>
                <div className="space-y-2">
                  {(review.categories || []).map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {CATEGORY_EMOJI[cat.category] ?? "📝"}
                        </span>
                        <span className="text-sm text-stone-400 capitalize">
                          {cat.category}
                        </span>
                      </div>
                      <span className="text-sm text-stone-300">
                        {formatKES(cat.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {review.total_entries === 0 && (
              <div className="bg-stone-800 rounded-2xl p-5 mb-6 text-center">
                <p className="text-stone-500 text-sm">No entries today.</p>
                <p className="text-stone-600 text-xs mt-1">
                  Sometimes money just flows quietly.
                </p>
              </div>
            )}

            <div className="mt-auto">
              <button
                onClick={() => setStep("reflect")}
                className="w-full py-4 bg-stone-100 text-stone-900 font-medium rounded-2xl hover:bg-white transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Reflect ────────────────────────────────── */}
        {step === "reflect" && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <p className="text-stone-500 text-sm mb-2">Quick check-in</p>
              <h1 className="text-2xl font-semibold text-stone-100">
                How did money feel today?
              </h1>
            </div>

            {/* Mood picker */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMood(m.value)}
                  className={`py-4 rounded-2xl text-center transition-colors ${
                    mood === m.value
                      ? "bg-stone-100 text-stone-900"
                      : "bg-stone-800 text-stone-400 hover:bg-stone-700"
                  }`}
                >
                  <span className="text-2xl block mb-1">{m.emoji}</span>
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Optional reflection */}
            <div className="mb-6">
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Anything you want to remember about today? (optional)"
                rows={3}
                className="w-full bg-stone-800 text-stone-300 placeholder-stone-600 text-sm rounded-2xl px-4 py-3 outline-none resize-none border border-stone-700 focus:border-stone-500"
              />
            </div>

            <div className="mt-auto space-y-3">
              <button
                onClick={() => setStep("coaching")}
                disabled={!mood}
                className="w-full py-4 bg-stone-100 text-stone-900 font-medium rounded-2xl disabled:opacity-30 hover:bg-white transition-colors"
              >
                Continue →
              </button>
              <button
                onClick={() => setStep("review")}
                className="w-full py-2 text-stone-600 text-sm"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Coaching ───────────────────────────────── */}
        {step === "coaching" && coaching && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <p className="text-stone-500 text-sm mb-2">A thought</p>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="bg-stone-800 rounded-2xl p-6 mb-4">
                <p className="text-stone-100 text-lg leading-relaxed font-light">
                  {coaching.note}
                </p>
              </div>

              {mood && (
                <p className="text-stone-600 text-sm text-center">
                  {mood === "calm" && "Calm days build quietly."}
                  {mood === "okay" && "Okay is honest. That counts."}
                  {mood === "harder" && "Harder days happen. You still showed up."}
                  {mood === "stressed" && "Stress and money don't always agree. Rest helps."}
                </p>
              )}
            </div>

            <div className="mt-auto space-y-3">
              <button
                onClick={() => setStep("tomorrow")}
                className="w-full py-4 bg-stone-100 text-stone-900 font-medium rounded-2xl hover:bg-white transition-colors"
              >
                See tomorrow →
              </button>
              <button
                onClick={() => setStep("reflect")}
                className="w-full py-2 text-stone-600 text-sm"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Tomorrow ───────────────────────────────── */}
        {step === "tomorrow" && coaching && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <p className="text-stone-500 text-sm mb-2">Looking ahead</p>
              <h1 className="text-2xl font-semibold text-stone-100">
                Tomorrow
              </h1>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="bg-stone-800 rounded-2xl p-6 mb-6">
                <p className="text-stone-300 text-base leading-relaxed">
                  {coaching.tomorrow_hint}
                </p>
              </div>

              <div className="bg-stone-800 rounded-2xl p-5 space-y-3">
                <p className="text-xs text-stone-600 uppercase tracking-wider font-medium">
                  Quick reminders
                </p>
                <p className="text-sm text-stone-500">
                  📋 Open Capture first thing and log your day as it happens.
                </p>
                <p className="text-sm text-stone-500">
                  🌱 Every entry makes tomorrow's review richer.
                </p>
              </div>
            </div>

            <div className="mt-auto space-y-3">
              <button
                onClick={handleClose}
                disabled={closing}
                className="w-full py-4 bg-stone-100 text-stone-900 font-medium rounded-2xl disabled:opacity-50 hover:bg-white transition-colors"
              >
                {closing ? "Closing day..." : "Close today 🌙"}
              </button>
              <button
                onClick={() => setStep("coaching")}
                className="w-full py-2 text-stone-600 text-sm"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Closed ─────────────────────────────────── */}
        {step === "closed" && (
          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <div className="mb-8">
              <p className="text-5xl mb-4">🌙</p>
              <h1 className="text-2xl font-semibold text-stone-100 mb-2">
                Day closed.
              </h1>
              <p className="text-stone-500 text-sm">
                {snapshot?.coaching_note ?? "Sleep well."}
              </p>
            </div>

            {(snapshot || review?.already_closed) && (
              <div className="bg-stone-800 rounded-2xl p-5 w-full mb-6 text-left">
                <p className="text-xs text-stone-600 uppercase tracking-wider font-medium mb-3">
                  Today in numbers
                </p>
                <div className="flex justify-between">
                  <p className="text-sm text-stone-500">Total spent</p>
                  <p className="text-sm text-stone-300">
                    {formatKES(snapshot?.total_spent ?? review?.total_spent ?? 0)}
                  </p>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-sm text-stone-500">Entries</p>
                  <p className="text-sm text-stone-300">
                    {snapshot?.total_entries ?? review?.total_entries ?? 0}
                  </p>
                </div>
              </div>
            )}

            <div className="w-full space-y-3">
              <a
                href="/capture"
                className="block w-full py-4 bg-stone-800 text-stone-300 font-medium rounded-2xl hover:bg-stone-700 transition-colors text-center text-sm"
              >
                + Add a missed entry
              </a>
              <a
                href="/"
                className="block w-full py-3 text-stone-600 text-sm text-center"
              >
                Back to home
              </a>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}