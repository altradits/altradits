"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  social_post_reward_sats: number;
  created_at: string;
  updated_at: string;
  is_organizer?: boolean;
  my_application_status?: string | null;
  my_team_id?: string | null;
};

type Application = {
  id: string;
  hackathon_id: string;
  user_id: string;
  user_name?: string;
  status: string;
  motivation: string;
  skills: string;
  applied_at: string;
  reviewed_at?: string | null;
};

type TeamMember = {
  user_id: string;
  name: string;
  role: string;
  joined_at: string;
};

type Team = {
  id: string;
  hackathon_id: string;
  name: string;
  created_at: string;
  members: TeamMember[];
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

const STATUS_OPTIONS = ["draft", "open", "in_progress", "judging", "completed"];

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
};

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  accepted: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-500",
  waitlisted: "bg-blue-50 text-blue-600",
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Not set";
  return new Date(dateString).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HackathonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token } = useAuth();

  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [motivation, setMotivation] = useState("");
  const [skills, setSkills] = useState("");
  const [teamName, setTeamName] = useState("");
  const [statusDraft, setStatusDraft] = useState("draft");

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiFetch(`/hackathons/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to fetch hackathon");
      }
      const h: Hackathon = await res.json();
      setHackathon(h);
      setStatusDraft(h.status);

      const teamsRes = await apiFetch(`/hackathons/${id}/teams`);
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(Array.isArray(teamsData.teams) ? teamsData.teams : []);
      }

      if (h.is_organizer) {
        const appsRes = await apiFetch(`/hackathons/${id}/applications`);
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          setApplications(Array.isArray(appsData.applications) ? appsData.applications : []);
        }
      }
    } catch (err) {
      setError("Could not reach the server.");
      console.error(err);
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

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ motivation, skills }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to apply");
      setMessage(data.message || "Application submitted.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not submit application.");
    }
  };

  const handleStatusUpdate = async () => {
    if (!hackathon) return;
    setActionError(null);
    setMessage(null);
    try {
      const payload = {
        name: hackathon.name,
        description: hackathon.description,
        theme: hackathon.theme,
        status: statusDraft,
        application_deadline: hackathon.application_deadline,
        start_date: hackathon.start_date,
        end_date: hackathon.end_date,
        min_team_size: hackathon.min_team_size,
        max_team_size: hackathon.max_team_size,
        social_post_reward_sats: hackathon.social_post_reward_sats,
      };
      const res = await apiFetch(`/hackathons/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update hackathon");
      setMessage(data.message || "Hackathon updated.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update hackathon.");
    }
  };

  const handleReview = async (appID: string, status: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/applications/${appID}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update application");
      setMessage(data.message || "Application updated.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update application.");
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/teams`, {
        method: "POST",
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create team");
      setMessage(data.message || "Team created.");
      setTeamName("");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create team.");
    }
  };

  const handleJoinTeam = async (teamID: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/teams/${teamID}/join`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to join team");
      setMessage(data.message || "Joined team.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not join team.");
    }
  };

  const handleLeaveTeam = async (teamID: string) => {
    if (!confirm("Leave this team?")) return;
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/teams/${teamID}/leave`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to leave team");
      setMessage(data.message || "Left team.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not leave team.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (error || !hackathon) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">{error || "Hackathon not found."}</p>
          <a href="/hackathons" className="text-xs text-stone-400">
            ← Back to hackathons
          </a>
        </div>
      </main>
    );
  }

  const canApply =
    !hackathon.is_organizer &&
    !hackathon.my_application_status &&
    hackathon.status === "open";

  const canFormTeam =
    !hackathon.is_organizer &&
    hackathon.my_application_status === "accepted" &&
    !hackathon.my_team_id;

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <div className="flex items-start justify-between mb-2 gap-3">
            <h1 className="text-2xl font-semibold text-stone-800">{hackathon.name}</h1>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                STATUS_COLORS[hackathon.status] || "bg-stone-100 text-stone-500"
              }`}
            >
              {STATUS_LABELS[hackathon.status] || hackathon.status}
            </span>
          </div>
          {hackathon.theme && (
            <p className="text-sm text-stone-400">🎯 {hackathon.theme}</p>
          )}
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

        {/* Details card */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          {hackathon.description && (
            <p className="text-sm text-stone-600 mb-4">{hackathon.description}</p>
          )}
          <div className="grid grid-cols-2 gap-4 text-xs text-stone-500">
            <div>
              <p className="font-medium">Organizer</p>
              <p>{hackathon.organizer_name || "Unknown"}</p>
            </div>
            <div>
              <p className="font-medium">Team Size</p>
              <p>
                {hackathon.min_team_size}–{hackathon.max_team_size} members
              </p>
            </div>
            <div>
              <p className="font-medium">Application Deadline</p>
              <p>{formatDate(hackathon.application_deadline)}</p>
            </div>
            <div>
              <p className="font-medium">Starts</p>
              <p>{formatDate(hackathon.start_date)}</p>
            </div>
            <div>
              <p className="font-medium">Ends</p>
              <p>{formatDate(hackathon.end_date)}</p>
            </div>
          </div>
        </div>

        {/* Engagement tools */}
        {(hackathon.is_organizer || hackathon.my_application_status === "accepted") && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Hackathon Tools
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/hackathons/${id}/notes`}
                className="px-3 py-2 bg-stone-50 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-100 transition-colors text-center"
              >
                📝 Daily Notes
              </a>
              <a
                href={`/hackathons/${id}/checkin`}
                className="px-3 py-2 bg-stone-50 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-100 transition-colors text-center"
              >
                ✅ Check-in
              </a>
              <a
                href={`/hackathons/${id}/chat`}
                className="px-3 py-2 bg-stone-50 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-100 transition-colors text-center"
              >
                💬 Chat
              </a>
              <a
                href={`/hackathons/${id}/homework`}
                className="px-3 py-2 bg-stone-50 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-100 transition-colors text-center"
              >
                📚 Homework
              </a>
              <a
                href={`/hackathons/${id}/social`}
                className="px-3 py-2 bg-stone-50 text-stone-700 text-xs font-medium rounded-xl hover:bg-stone-100 transition-colors text-center col-span-2"
              >
                📣 Social Posts
              </a>
            </div>
          </div>
        )}

        {/* Organizer panel */}
        {hackathon.is_organizer && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Organizer Controls
            </p>
            <div className="flex items-center gap-2">
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStatusUpdate}
                disabled={statusDraft === hackathon.status}
                className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>

            {/* Applications */}
            <div className="mt-4 pt-3 border-t border-stone-50">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Applications ({applications.length})
              </p>
              {applications.length > 0 ? (
                <div className="space-y-3">
                  {applications.map((a) => (
                    <div key={a.id} className="border border-stone-100 rounded-xl p-3">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium text-stone-800">
                          {a.user_name || "Unknown"}
                        </p>
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            APPLICATION_STATUS_COLORS[a.status] || "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {APPLICATION_STATUS_LABELS[a.status] || a.status}
                        </span>
                      </div>
                      {a.skills && (
                        <p className="text-xs text-stone-500 mb-1">Skills: {a.skills}</p>
                      )}
                      {a.motivation && (
                        <p className="text-xs text-stone-500 mb-2">{a.motivation}</p>
                      )}
                      {a.status === "pending" && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => handleReview(a.id, "accepted")}
                            className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(a.id, "waitlisted")}
                            className="px-2 py-1 bg-amber-50 text-amber-600 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors"
                          >
                            Waitlist
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(a.id, "rejected")}
                            className="px-2 py-1 bg-stone-100 text-stone-500 text-xs font-medium rounded-lg hover:bg-stone-200 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-400">No applications yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Hacker application panel */}
        {!hackathon.is_organizer && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Your Application
            </p>
            {hackathon.my_application_status ? (
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  APPLICATION_STATUS_COLORS[hackathon.my_application_status] ||
                  "bg-stone-100 text-stone-500"
                }`}
              >
                {APPLICATION_STATUS_LABELS[hackathon.my_application_status] ||
                  hackathon.my_application_status}
              </span>
            ) : canApply ? (
              <form onSubmit={handleApply} className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">
                    Why do you want to join?
                  </label>
                  <textarea
                    value={motivation}
                    onChange={(e) => setMotivation(e.target.value)}
                    rows={3}
                    placeholder="Tell the organizer about yourself"
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Your skills</label>
                  <input
                    type="text"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="e.g., Go, React, Design"
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
                >
                  Apply
                </button>
              </form>
            ) : (
              <p className="text-xs text-stone-400">
                Applications aren&apos;t open for this hackathon.
              </p>
            )}
          </div>
        )}

        {/* Teams panel */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            Teams ({teams.length})
          </p>

          {teams.length > 0 ? (
            <div className="space-y-3 mb-4">
              {teams.map((t) => {
                const isMyTeam = hackathon.my_team_id === t.id;
                const isFull = t.members.length >= hackathon.max_team_size;
                return (
                  <div
                    key={t.id}
                    className={`border rounded-xl p-3 ${
                      isMyTeam ? "border-emerald-200 bg-emerald-50" : "border-stone-100"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium text-stone-800">
                        {t.name}
                        {isMyTeam ? " (Your Team)" : ""}
                      </p>
                      <span className="text-xs text-stone-400">
                        {t.members.length}/{hackathon.max_team_size}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mb-2">
                      {t.members
                        .map((m) => `${m.name}${m.role === "leader" ? " 👑" : ""}`)
                        .join(", ")}
                    </p>
                    {canFormTeam && !isFull && (
                      <button
                        type="button"
                        onClick={() => handleJoinTeam(t.id)}
                        className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        Join
                      </button>
                    )}
                    {isMyTeam && (
                      <button
                        type="button"
                        onClick={() => handleLeaveTeam(t.id)}
                        className="px-2 py-1 bg-stone-100 text-stone-500 text-xs font-medium rounded-lg hover:bg-stone-200 transition-colors"
                      >
                        Leave
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-stone-400 mb-4">No teams formed yet.</p>
          )}

          {canFormTeam && (
            <form
              onSubmit={handleCreateTeam}
              className="flex items-center gap-2 pt-3 border-t border-stone-50"
            >
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name"
                required
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Create Team
              </button>
            </form>
          )}
        </div>

        <a href="/hackathons" className="block text-center text-xs text-stone-400 mt-4">
          ← Back to hackathons
        </a>
      </div>
    </main>
  );
}
