"use client";

import { useEffect, useState } from "react";

type RecentItem = {
  description: string;
  amount: number;
  category: string;
  created_at: string;
};

type CategoryHealth = {
  category: string;
  allocated: number;
  spent: number;
  percent: number;
};

type GoalPreview = {
  id: string;
  name: string;
  emoji: string;
  percent: number;
  saved: number;
  target: number;
};

type InvestmentsSnapshot = {
  total_value: number;
  total_growth: number;
  total_growth_pct: number;
  position_count: number;
};

type DashboardData = {
  date: string;
  greeting: string;
  today: {
    total_spent: number;
    entry_count: number;
    top_category: string;
    recent_items: RecentItem[];
  };
  budget: {
    total_allocated: number;
    total_spent: number;
    percent: number;
    top_categories: CategoryHealth[];
  };
  goals: {
    active_count: number;
    goals: GoalPreview[];
  };
  investments: InvestmentsSnapshot;
  bedtime_done: boolean;
  streak: number;
  freedom_coverage?: number;
  companion?: {
    emoji: string;
    level: string;
    streak_days: number;
    xp_percent: number;
  };
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", transport: "🚗", family: "👨‍👩‍👧",
  investments: "🌱", bills: "💡", fun: "🎉",
  savings: "💰", health: "💊", uncategorized: "📝",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function MiniBar({ percent, muted }: { percent: number; muted?: boolean }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1 mt-1.5">
      <div
        className={`h-1 rounded-full transition-all duration-500 ${
          muted ? "bg-stone-300" : percent > 85 ? "bg-amber-400" : "bg-emerald-400"
        }`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    console.log('Fetching dashboard from:', `${API}/dashboard`);
    fetch(`${API}/dashboard`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); console.log('Data:', d); })
      .catch(() => { setError(true); setLoading(false); console.error('Error fetching dashboard'); });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">Could not reach the server.</p>
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  const todayDate = new Date().toLocaleDateString("en-KE", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="pt-10 pb-6">
          <p className="text-xs text-stone-400 mb-1">{todayDate}</p>
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-semibold text-stone-800">
              {data.greeting}
            </h1>
            {data.streak > 1 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5 text-center">
                <p className="text-lg leading-none">🔥</p>
                <p className="text-xs text-amber-600 font-medium mt-0.5">
                  {data.streak}d
                </p>
              </div>
            )}
          </div>
          <p className="text-sm text-stone-400 mt-1">
            calm financial companionship
          </p>
        </div>

        {/* ── Companion widget ─────────────────────────────── */}
        {data.companion && (
          <a
            href="/companion"
            className="flex items-center gap-4 bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-4 mb-4 hover:bg-stone-50 transition-colors"
          >
            <span className="text-4xl select-none">{data.companion.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-stone-700 capitalize">
                  {data.companion.level.replace("_", " ")}
                </p>
                {data.companion.streak_days > 0 && (
                  <span className="text-xs text-amber-500 font-medium">
                    🔥 {data.companion.streak_days}d
                  </span>
                )}
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div
                  className="h-1.5 bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.companion.xp_percent, 100)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-stone-400">→</span>
          </a>
        )}

        {/* ── Today card ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Today
              </p>
              <p className="text-3xl font-semibold text-stone-800 mt-1">
                {formatKES(data.today.total_spent)}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {data.today.entry_count === 0
                  ? "No entries yet"
                  : `${data.today.entry_count} ${data.today.entry_count === 1 ? "entry" : "entries"}`}
              </p>
            </div>
            <a
              href="/capture"
              className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
            >
              + Add
            </a>
          </div>

          {/* Recent items */}
          {data.today.recent_items && data.today.recent_items.length > 0 ? (
            <div className="space-y-2 border-t border-stone-50 pt-3">
              {data.today.recent_items.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {CATEGORY_EMOJI[item.category] ?? "📝"}
                    </span>
                    <span className="text-sm text-stone-600">
                      {item.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-300">
                      {item.created_at}
                    </span>
                    <span className="text-sm text-stone-700 font-medium">
                      {formatKES(item.amount)}
                    </span>
                  </div>
                </div>
              ))}
              {data.today.entry_count > 3 && (
                <a
                  href="/capture"
                  className="block text-xs text-stone-400 hover:text-stone-600 pt-1 text-center"
                >
                  +{data.today.entry_count - 3} more →
                </a>
              )}
            </div>
          ) : (
            <div className="border-t border-stone-50 pt-3 text-center">
              <p className="text-xs text-stone-300">
                What happened today? Tap + Add to start.
              </p>
            </div>
          )}
        </div>

        {/* ── Budget card ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
              Budget · this month
            </p>
            <a href="/budget" className="text-xs text-stone-400 hover:text-stone-600">
              See all →
            </a>
          </div>

          {/* Overall bar */}
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-stone-600">
              {formatKES(data.budget.total_spent)}
            </span>
            <span className="text-xs text-stone-400">
              of {formatKES(data.budget.total_allocated)}
            </span>
          </div>
          <MiniBar percent={data.budget.percent} />

          {/* Top categories */}
          {data.budget.top_categories && data.budget.top_categories.length > 0 && (
            <div className="space-y-2 mt-4 pt-3 border-t border-stone-50">
              {data.budget.top_categories.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {CATEGORY_EMOJI[cat.category] ?? "📝"}
                      </span>
                      <span className="text-sm text-stone-600 capitalize">
                        {cat.category}
                      </span>
                    </div>
                    <span className="text-sm text-stone-700">
                      {formatKES(cat.spent)}
                    </span>
                  </div>
                  <MiniBar percent={cat.percent} />
                </div>
              ))}
            </div>
          )}
        </div>

        {!data.bedtime_done && (
          <div
            className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 cursor-pointer hover:bg-stone-100 transition-colors"
            onClick={() => window.location.href = '/bedtime'}
          >
            <p className="text-xs text-stone-500">
              💬 <span className="font-medium">How did money feel today?</span>{" "}
              <span className="text-stone-400">Close your day →</span>
            </p>
          </div>
        )}

        {/* ── Investments card ──────────────────────────────────── */}
        {data.investments && data.investments.position_count > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Investments · {data.investments.position_count} positions
              </p>
              <a href="/investments" className="text-xs text-stone-400 hover:text-stone-600">
                See all →
              </a>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Total Value</span>
                <span className="text-sm text-stone-800 font-medium">
                  {formatKES(data.investments.total_value)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Growth</span>
                <span className={`text-sm font-medium ${
                  data.investments.total_growth >= 0 ? "text-emerald-600" : "text-red-600"
                }`}>
                  {data.investments.total_growth >= 0 ? "+" : ""}{formatKES(data.investments.total_growth)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Freedom coverage ──────────────────────────────────── */}
        {data.freedom_coverage !== undefined && data.freedom_coverage > 0 && (
          <a
            href="/freedom"
            className="block bg-stone-800 rounded-xl px-4 py-3 mb-4 hover:bg-stone-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-stone-400 font-medium">Financial freedom</p>
              <p className="text-xs text-emerald-400 font-medium">
                {data.freedom_coverage.toFixed(0)}% covered →
              </p>
            </div>
            <div className="w-full bg-stone-700 rounded-full h-1">
              <div
                className="h-1 bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.min(data.freedom_coverage, 100)}%` }}
              />
            </div>
          </a>
        )}

        {/* ── Goals card ──────────────────────────────────── */}
        {data.goals.active_count > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Goals · {data.goals.active_count} active
              </p>
              <a href="/goals" className="text-xs text-stone-400 hover:text-stone-600">
                See all →
              </a>
            </div>
            <div className="space-y-3">
              {data.goals.goals.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{g.emoji}</span>
                      <span className="text-sm text-stone-600">{g.name}</span>
                    </div>
                    <span className="text-xs text-stone-400">
                      {Math.round(g.percent)}%
                    </span>
                  </div>
                  <MiniBar percent={g.percent} muted />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bedtime CTA ─────────────────────────────────── */}
        {data.bedtime_done ? (
          <div className="bg-stone-800 rounded-2xl p-5 text-center">
            <p className="text-lg mb-1">🌙</p>
            <p className="text-sm font-medium text-stone-100">Day closed.</p>
            <p className="text-xs text-stone-500 mt-1">
              Sleep well. Tomorrow is ready.
            </p>
          </div>
        ) : (
          <a
            href="/bedtime"
            className="block bg-stone-800 rounded-2xl p-5 text-center hover:bg-stone-700 transition-colors"
          >
            <p className="text-lg mb-1">🌙</p>
            <p className="text-sm font-medium text-stone-100">
              Close your day
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Review · Reflect · Rest
            </p>
          </a>
        )}

        {/* ── Nav row ─────────────────────────────────────── */}
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
            href="/investments"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Investments
          </a>
          <a
            href="/freedom"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Freedom
          </a>
          <a
            href="/sms"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            📱 SMS
          </a>
          <a
            href="/companion"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            🌱 Companion
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
