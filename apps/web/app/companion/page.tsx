"use client";

import { useState, useEffect } from "react";

type Milestone = {
  label: string;
  emoji: string;
  date: string;
};

type CompanionState = {
  id: string;
  companion: string;
  level: string;
  level_label: string;
  xp: number;
  xp_to_next: number;
  xp_percent: number;
  streak_days: number;
  longest_streak: number;
  total_checkins: number;
  last_checkin: string | null;
  milestones: Milestone[];
  emoji: string;
  greeting: string;
};

type HistoryEvent = {
  event_type: string;
  xp_awarded: number;
  note: string;
  created_at: string;
};

const COMPANIONS = [
  { key: "seed",   emoji: "🌱", name: "Seed",   desc: "Quiet and steady. Grows through patience." },
  { key: "puppy",  emoji: "🐶", name: "Puppy",  desc: "Loyal and energetic. Thrives on daily habit." },
  { key: "kitten", emoji: "🐱", name: "Kitten", desc: "Curious and careful. Grows through reflection." },
  { key: "tree",   emoji: "🌳", name: "Tree",   desc: "Deep roots. Built for the long term." },
];

const EVENT_EMOJI: Record<string, string> = {
  bedtime:    "🌙",
  capture:    "📝",
  goal:       "🎯",
  reflection: "💭",
  streak:     "🔥",
};

const EVENT_LABEL: Record<string, string> = {
  bedtime:    "Bedtime logoff",
  capture:    "Money captured",
  goal:       "Goal contribution",
  reflection: "Reflection",
  streak:     "Streak bonus",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function CompanionPage() {
  const [state, setState] = useState<CompanionState | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([
      fetch(`${API}/companion`).then((r) => r.json()),
      fetch(`${API}/companion/history`).then((r) => r.json()),
    ]).then(([s, h]) => {
      setState(s);
      setHistory(h.events || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleChoose = async (companionKey: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/companion/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion: companionKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message);
        setState(data.companion);
        setChoosing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">
        <p className="text-stone-400 text-sm text-center pt-20">
          Meeting your companion...
        </p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">
        <p className="text-red-400 text-sm text-center pt-20">
          Could not load companion. Is the backend running?
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">

        {/* Header */}
        <div className="pt-10 pb-6">
          <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
            ← Altradits
          </a>
          <h1 className="text-xl font-semibold text-stone-800">Companion</h1>
          <p className="text-sm text-stone-400 mt-1">
            Grows with your consistency, not your wealth.
          </p>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-emerald-700">{feedback}</p>
          </div>
        )}

        {/* Companion card */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 mb-4 text-center">
          {/* Big emoji */}
          <div className="text-7xl mb-4 select-none">{state.emoji}</div>

          {/* Level badge */}
          <div className="inline-flex items-center gap-2 bg-stone-100 rounded-full px-3 py-1 mb-3">
            <span className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
              {state.level_label}
            </span>
          </div>

          {/* Greeting */}
          <p className="text-sm text-stone-600 leading-relaxed mb-5 px-4">
            {state.greeting}
          </p>

          {/* XP bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-stone-400 mb-1.5">
              <span>{state.xp} XP</span>
              <span>{state.xp_to_next} XP to next level</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2">
              <div
                className="h-2 bg-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${state.xp_percent}%` }}
              />
            </div>
          </div>

          {/* Change companion button */}
          <button
            onClick={() => setChoosing(!choosing)}
            className="mt-4 text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2"
          >
            {choosing ? "Keep current companion" : "Change companion"}
          </button>
        </div>

        {/* Companion chooser */}
        {choosing && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-sm font-medium text-stone-700 mb-4">
              Choose your companion
            </p>
            <div className="grid grid-cols-2 gap-3">
              {COMPANIONS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => handleChoose(c.key)}
                  disabled={saving || state.companion === c.key}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    state.companion === c.key
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <p className="text-3xl mb-2">{c.emoji}</p>
                  <p className={`text-sm font-semibold mb-1 ${
                    state.companion === c.key ? "text-white" : "text-stone-800"
                  }`}>
                    {c.name}
                  </p>
                  <p className={`text-xs leading-snug ${
                    state.companion === c.key ? "text-stone-300" : "text-stone-400"
                  }`}>
                    {c.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-stone-100 p-4 text-center">
            <p className="text-2xl font-bold text-stone-800">{state.streak_days}</p>
            <p className="text-xs text-stone-400 mt-1">day streak</p>
          </div>
          <div className="bg-white rounded-xl border border-stone-100 p-4 text-center">
            <p className="text-2xl font-bold text-stone-800">{state.total_checkins}</p>
            <p className="text-xs text-stone-400 mt-1">logoffs</p>
          </div>
          <div className="bg-white rounded-xl border border-stone-100 p-4 text-center">
            <p className="text-2xl font-bold text-stone-800">{state.longest_streak}</p>
            <p className="text-xs text-stone-400 mt-1">best streak</p>
          </div>
        </div>

        {/* How XP works */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            How your companion grows
          </p>
          <div className="space-y-2">
            {[
              { event: "bedtime",    label: "Complete a bedtime logoff",  xp: 15 },
              { event: "goal",       label: "Contribute to a goal",       xp: 10 },
              { event: "reflection", label: "Write a reflection",         xp: 5  },
              { event: "capture",    label: "Log a transaction",          xp: 3  },
            ].map((item) => (
              <div key={item.event} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{EVENT_EMOJI[item.event]}</span>
                  <span className="text-sm text-stone-600">{item.label}</span>
                </div>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  +{item.xp} XP
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-stone-50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-500">🔥 3-day streak bonus</span>
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  +20 XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-500">🔥 7-day streak bonus</span>
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  +50 XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-500">🔥 30-day streak bonus</span>
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  +100 XP
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones */}
        {state.milestones && state.milestones.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Milestones
            </p>
            <div className="space-y-2">
              {state.milestones.map((m, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{m.emoji}</span>
                    <span className="text-sm text-stone-600">{m.label}</span>
                  </div>
                  <span className="text-xs text-stone-400">{m.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Recent activity
            </p>
            <div className="space-y-2">
              {history.slice(0, 8).map((ev, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {EVENT_EMOJI[ev.event_type] ?? "✦"}
                    </span>
                    <div>
                      <p className="text-sm text-stone-600">
                        {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                      </p>
                      {ev.note && (
                        <p className="text-xs text-stone-400">{ev.note}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-600">
                    +{ev.xp_awarded} XP
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex gap-3 mt-4">
          <a
            href="/bedtime"
            className="flex-1 text-center py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
          >
            🌙 Close today
          </a>
          <a
            href="/"
            className="flex-1 text-center py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Home
          </a>
        </div>

      </div>
    </main>
  );
}
