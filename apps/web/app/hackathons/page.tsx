"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type Hackathon = {
  id: string;
  organizer_id: string;
  organizer_name?: string;
  name: string;
  description: string;
  theme: string;
  status: string;
  application_deadline?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  min_team_size: number;
  max_team_size: number;
  created_at: string;
  updated_at: string;
  is_organizer?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open for Applications",
  in_progress: "In Progress",
  judging: "Judging",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-stone-100 text-stone-500",
  open: "bg-emerald-50 text-emerald-600",
  in_progress: "bg-amber-50 text-amber-600",
  judging: "bg-blue-50 text-blue-600",
  completed: "bg-stone-100 text-stone-500",
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Not set";
  return new Date(dateString).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HackathonsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/hackathons");

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to fetch hackathons");
      }

      const data = await res.json();
      setHackathons(Array.isArray(data.hackathons) ? data.hackathons : []);
    } catch (err) {
      setError("Could not reach the server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [token, router]);

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
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
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
            Hackathons
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Build, compete, and win sats
          </p>
        </div>

        {/* Hackathon list */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                Events
              </p>
              <p className="text-xl font-semibold text-stone-800">
                {hackathons.length}
              </p>
            </div>
            <a
              href="/hackathons/new"
              className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
            >
              + New Hackathon
            </a>
          </div>

          {hackathons.length > 0 ? (
            <div className="space-y-3">
              {hackathons.map((h) => (
                <a
                  key={h.id}
                  href={`/hackathons/${h.id}`}
                  className="block bg-white rounded-2xl border border-stone-100 shadow-sm p-5 hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-stone-800">
                      {h.name}
                    </p>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        STATUS_COLORS[h.status] || "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {STATUS_LABELS[h.status] || h.status}
                    </span>
                  </div>
                  {h.theme && (
                    <p className="text-xs text-stone-500 mb-2">🎯 {h.theme}</p>
                  )}
                  {h.description && (
                    <p className="text-xs text-stone-500 mb-3 line-clamp-2">
                      {h.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span>By {h.organizer_name || "Unknown"}</span>
                    {h.start_date && <span>Starts {formatDate(h.start_date)}</span>}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400">
                No hackathons yet. Create one to get started.
              </p>
            </div>
          )}
        </div>

        <a href="/" className="block text-center text-xs text-stone-400 mt-4">
          ← Altradits
        </a>
      </div>
    </main>
  );
}
