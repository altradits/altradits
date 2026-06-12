"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type CheckinCode = {
  id: string;
  hackathon_id: string;
  day_number: number;
  code: string;
  created_at: string;
};

type Checkin = {
  id: string;
  hackathon_id: string;
  user_id: string;
  user_name?: string;
  day_number: number;
  checked_in_at: string;
};

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HackathonCheckinPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token } = useAuth();

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [codes, setCodes] = useState<CheckinCode[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [dayNumber, setDayNumber] = useState("");
  const [codeInput, setCodeInput] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const hRes = await apiFetch(`/hackathons/${id}`);
      if (hRes.status === 401) {
        router.push("/login");
        return;
      }
      if (!hRes.ok) throw new Error("Failed to fetch hackathon");
      const h = await hRes.json();
      const organizer = !!h.is_organizer;
      setIsOrganizer(organizer);

      const checkinsRes = await apiFetch(`/hackathons/${id}/checkins`);
      const checkinsData = await checkinsRes.json().catch(() => ({}));
      if (!checkinsRes.ok) throw new Error(checkinsData.error || "Failed to fetch check-ins");
      setCheckins(Array.isArray(checkinsData.checkins) ? checkinsData.checkins : []);

      if (organizer) {
        const codesRes = await apiFetch(`/hackathons/${id}/checkin-codes`);
        const codesData = await codesRes.json().catch(() => ({}));
        if (!codesRes.ok) throw new Error(codesData.error || "Failed to fetch check-in codes");
        setCodes(Array.isArray(codesData.checkin_codes) ? codesData.checkin_codes : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchAll();
  }, [token, router, fetchAll]);

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/checkin-codes`, {
        method: "POST",
        body: JSON.stringify({ day_number: parseInt(dayNumber, 10) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to generate code");
      setMessage(data.message || "Code generated.");
      setDayNumber("");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not generate code.");
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/checkin`, {
        method: "POST",
        body: JSON.stringify({ code: codeInput.trim().toUpperCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to check in");
      setMessage(data.message || "Checked in.");
      setCodeInput("");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not check in.");
    }
  };

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
          <a href={`/hackathons/${id}`} className="text-xs text-stone-400">
            ← Back to hackathon
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Check-in</h1>
          <p className="text-sm text-stone-400 mt-1">
            Daily attendance tracking
          </p>
        </div>

        {message && (
          <p className="text-xs text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2 mb-4">
            {message}
          </p>
        )}
        {actionError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 mb-4">
            {actionError}
          </p>
        )}

        {isOrganizer ? (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Generate Today&apos;s Code
            </p>
            <form onSubmit={handleGenerateCode} className="flex items-center gap-2 mb-4">
              <input
                type="number"
                min="1"
                value={dayNumber}
                onChange={(e) => setDayNumber(e.target.value)}
                placeholder="Day number"
                required
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Generate
              </button>
            </form>

            {codes.length > 0 ? (
              <div className="space-y-2">
                {codes.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border border-stone-100 rounded-xl p-3"
                  >
                    <p className="text-sm text-stone-600">Day {c.day_number}</p>
                    <p className="text-lg font-mono font-semibold tracking-widest text-stone-800">
                      {c.code}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400">No codes generated yet.</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Enter Today&apos;s Code
            </p>
            <form onSubmit={handleCheckIn} className="flex items-center gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="e.g., AB12CD"
                required
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Check In
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            {isOrganizer ? `Attendance (${checkins.length})` : "Your Check-ins"}
          </p>
          {checkins.length > 0 ? (
            <div className="space-y-2">
              {checkins.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-sm text-stone-600"
                >
                  <span>
                    Day {c.day_number}
                    {isOrganizer ? ` — ${c.user_name || "Unknown"}` : ""}
                  </span>
                  <span className="text-xs text-stone-400">{formatTime(c.checked_in_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">No check-ins yet.</p>
          )}
        </div>

        <a href={`/hackathons/${id}`} className="block text-center text-xs text-stone-400 mt-6">
          ← Back to hackathon
        </a>
      </div>
    </main>
  );
}
