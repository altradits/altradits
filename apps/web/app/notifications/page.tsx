"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  read_at: string | null;
};

type Preferences = {
  bedtime_reminder: boolean;
  bedtime_reminder_time: string;
  bill_approaching: boolean;
  goal_milestone: boolean;
  streak_at_risk: boolean;
  weekly_summary: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const TYPE_EMOJI: Record<string, string> = {
  bedtime_reminder: "🌙",
  bill_approaching: "💡",
  goal_milestone:   "🎯",
  streak_at_risk:   "🔥",
  weekly_summary:   "📊",
  general:          "✦",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-50 last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-stone-700">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? "bg-emerald-400" : "bg-stone-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "settings">("inbox");

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    loadAll();
  }, [token, router]);

  const loadAll = async () => {
    const [notifRes, prefsRes] = await Promise.all([
      apiFetch("/notifications"),
      apiFetch("/notifications/preferences"),
    ]);
    if (notifRes.ok) {
      const d = await notifRes.json();
      setNotifications(d.notifications || []);
    }
    if (prefsRes.ok) {
      setPrefs(await prefsRes.json());
    }
    setLoading(false);

    await apiFetch("/notifications/read-all", { method: "POST" });
  };

  const handleToggle = async (key: keyof Preferences, value: boolean) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSavingPrefs(true);
    try {
      const res = await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback(data.message);
        setTimeout(() => setFeedback(null), 3000);
      }
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTimeChange = async (key: string, value: string) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated as Preferences);
  };

  const handleSaveTimes = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const res = await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({
          bedtime_reminder_time: prefs.bedtime_reminder_time,
          quiet_hours_start: prefs.quiet_hours_start,
          quiet_hours_end: prefs.quiet_hours_end,
        }),
      });
      if (res.ok) {
        setFeedback("Times saved. 🌱");
        setTimeout(() => setFeedback(null), 3000);
      }
    } finally {
      setSavingPrefs(false);
    }
  };

  const unread = notifications.filter((n) => n.status !== "read").length;

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">

        <div className="pt-10 pb-4">
          <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
            ← Altradits
          </a>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-stone-800">Notifications</h1>
              <p className="text-sm text-stone-400 mt-1">
                Calm reminders, when you want them.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-5">
          {(["inbox", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-stone-800 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {tab === "inbox" && unread > 0
                ? `Inbox (${unread})`
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {feedback && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-emerald-700">{feedback}</p>
          </div>
        )}

        {activeTab === "inbox" && (
          <div>
            {loading && (
              <p className="text-stone-400 text-sm text-center py-12">
                Loading...
              </p>
            )}
            {!loading && notifications.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🌱</p>
                <p className="text-stone-400 text-sm">Nothing here yet.</p>
                <p className="text-stone-300 text-xs mt-1">
                  Notifications will appear as you use Altradits.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`bg-white rounded-2xl border px-4 py-4 ${
                    n.status === "read"
                      ? "border-stone-100 opacity-60"
                      : "border-stone-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">
                      {TYPE_EMOJI[n.type] ?? "✦"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-stone-800 truncate">
                          {n.title}
                        </p>
                        <span className="text-xs text-stone-400 flex-shrink-0">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-stone-500 leading-relaxed">
                        {n.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && prefs && (
          <div className="space-y-4">

            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Remind me about
              </p>
              <Toggle
                label="Bedtime logoff"
                desc="Gentle nudge if you haven't closed your day"
                value={prefs.bedtime_reminder}
                onChange={(v) => handleToggle("bedtime_reminder", v)}
              />
              <Toggle
                label="Goal milestones"
                desc="When you reach 25%, 50%, 75%, or 100% of a goal"
                value={prefs.goal_milestone}
                onChange={(v) => handleToggle("goal_milestone", v)}
              />
              <Toggle
                label="Streak at risk"
                desc="If your daily streak is about to break"
                value={prefs.streak_at_risk}
                onChange={(v) => handleToggle("streak_at_risk", v)}
              />
              <Toggle
                label="Bill approaching"
                desc="When a recurring expense is likely due"
                value={prefs.bill_approaching}
                onChange={(v) => handleToggle("bill_approaching", v)}
              />
              <Toggle
                label="Weekly summary"
                desc="A calm Monday morning look at last week"
                value={prefs.weekly_summary}
                onChange={(v) => handleToggle("weekly_summary", v)}
              />
            </div>

            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-4">
                Timing
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-stone-400 block mb-1.5">
                    Bedtime reminder time
                  </label>
                  <input
                    type="time"
                    value={prefs.bedtime_reminder_time}
                    onChange={(e) => handleTimeChange("bedtime_reminder_time", e.target.value)}
                    className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 text-stone-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-400 block mb-1.5">
                    Quiet hours (no notifications sent)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-stone-400 mb-1">From</p>
                      <input
                        type="time"
                        value={prefs.quiet_hours_start}
                        onChange={(e) => handleTimeChange("quiet_hours_start", e.target.value)}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 text-stone-700"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-stone-400 mb-1">Until</p>
                      <input
                        type="time"
                        value={prefs.quiet_hours_end}
                        onChange={(e) => handleTimeChange("quiet_hours_end", e.target.value)}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 text-stone-700"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSaveTimes}
                  disabled={savingPrefs}
                  className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
                >
                  {savingPrefs ? "Saving..." : "Save times →"}
                </button>
              </div>
            </div>

            <div className="px-4 py-3 bg-stone-100 rounded-xl">
              <p className="text-xs text-stone-500 leading-relaxed">
                Altradits only sends notifications you have asked for.
                These are delivered within the app — no email, no push
                notifications, no surprises.
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
