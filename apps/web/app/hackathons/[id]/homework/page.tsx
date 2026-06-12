"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type Homework = {
  id: string;
  hackathon_id: string;
  day_number: number;
  title: string;
  description: string;
  reward_sats: number;
  created_at: string;
  my_submission_status?: string | null;
};

type Submission = {
  id: string;
  homework_id: string;
  hackathon_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
};

type CreateForm = {
  day_number: string;
  title: string;
  description: string;
  reward_sats: string;
};

const EMPTY_FORM: CreateForm = { day_number: "", title: "", description: "", reward_sats: "0" };

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-500",
};

export default function HackathonHomeworkPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token } = useAuth();

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitDrafts, setSubmitDrafts] = useState<Record<string, string>>({});
  const [expandedID, setExpandedID] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});

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
      setIsOrganizer(!!h.is_organizer);

      const hwRes = await apiFetch(`/hackathons/${id}/homework`);
      const hwData = await hwRes.json().catch(() => ({}));
      if (!hwRes.ok) throw new Error(hwData.error || "Failed to fetch homework");
      setHomework(Array.isArray(hwData.homework) ? hwData.homework : []);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/homework`, {
        method: "POST",
        body: JSON.stringify({
          day_number: parseInt(createForm.day_number, 10) || 0,
          title: createForm.title,
          description: createForm.description,
          reward_sats: parseInt(createForm.reward_sats, 10) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create homework");
      setMessage(data.message || "Homework posted.");
      setCreateForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create homework.");
    }
  };

  const handleSubmit = async (hwID: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/homework/${hwID}/submit`, {
        method: "POST",
        body: JSON.stringify({ content: submitDrafts[hwID] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to submit homework");
      setMessage(data.message || "Submission received.");
      setSubmitDrafts((prev) => ({ ...prev, [hwID]: "" }));
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not submit homework.");
    }
  };

  const toggleSubmissions = async (hwID: string) => {
    if (expandedID === hwID) {
      setExpandedID(null);
      return;
    }
    setExpandedID(hwID);
    if (!submissions[hwID]) {
      try {
        const res = await apiFetch(`/hackathons/${id}/homework/${hwID}/submissions`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to fetch submissions");
        setSubmissions((prev) => ({ ...prev, [hwID]: data.submissions || [] }));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not fetch submissions.");
      }
    }
  };

  const handleReview = async (hwID: string, subID: string, status: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/homework/${hwID}/submissions/${subID}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to review submission");
      setMessage(data.message || "Submission updated.");
      const refreshed = await apiFetch(`/hackathons/${id}/homework/${hwID}/submissions`);
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) {
        setSubmissions((prev) => ({ ...prev, [hwID]: refreshedData.submissions || [] }));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not review submission.");
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
          <h1 className="text-2xl font-semibold text-stone-800">Homework</h1>
          <p className="text-sm text-stone-400 mt-1">
            Daily assignments and rewards
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

        {isOrganizer && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Post New Homework
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Day Number</label>
                  <input
                    type="number"
                    min="1"
                    value={createForm.day_number}
                    onChange={(e) => setCreateForm({ ...createForm, day_number: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Reward (sats)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.reward_sats}
                    onChange={(e) => setCreateForm({ ...createForm, reward_sats: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g., Build your project skeleton"
                  required
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  placeholder="What should hackers submit?"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Post Homework
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {homework.length > 0 ? (
            homework.map((hw) => (
              <div key={hw.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <p className="text-sm font-semibold text-stone-800">
                    Day {hw.day_number} — {hw.title}
                  </p>
                  {hw.reward_sats > 0 && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">
                      {hw.reward_sats} sats
                    </span>
                  )}
                </div>
                {hw.description && (
                  <p className="text-sm text-stone-600 whitespace-pre-wrap mb-3">{hw.description}</p>
                )}

                {!isOrganizer && (
                  <div>
                    {hw.my_submission_status ? (
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          STATUS_COLORS[hw.my_submission_status] || "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {STATUS_LABELS[hw.my_submission_status] || hw.my_submission_status}
                      </span>
                    ) : null}

                    {hw.my_submission_status !== "approved" && hw.my_submission_status !== "rejected" && (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={submitDrafts[hw.id] || ""}
                          onChange={(e) =>
                            setSubmitDrafts((prev) => ({ ...prev, [hw.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Link to your work or a short writeup..."
                          className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmit(hw.id)}
                          disabled={!(submitDrafts[hw.id] || "").trim()}
                          className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
                        >
                          {hw.my_submission_status === "pending" ? "Update Submission" : "Submit"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isOrganizer && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSubmissions(hw.id)}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      {expandedID === hw.id ? "Hide submissions" : "View submissions"}
                    </button>
                    {expandedID === hw.id && (
                      <div className="mt-3 space-y-2 pt-3 border-t border-stone-50">
                        {(submissions[hw.id] || []).length > 0 ? (
                          (submissions[hw.id] || []).map((sub) => (
                            <div key={sub.id} className="border border-stone-100 rounded-xl p-3">
                              <div className="flex items-start justify-between mb-1">
                                <p className="text-sm font-medium text-stone-800">
                                  {sub.user_name || "Unknown"}
                                </p>
                                <span
                                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                                    STATUS_COLORS[sub.status] || "bg-stone-100 text-stone-500"
                                  }`}
                                >
                                  {STATUS_LABELS[sub.status] || sub.status}
                                </span>
                              </div>
                              <p className="text-xs text-stone-500 mb-2 whitespace-pre-wrap">
                                {sub.content}
                              </p>
                              {sub.status === "pending" && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleReview(hw.id, sub.id, "approved")}
                                    className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReview(hw.id, sub.id, "rejected")}
                                    className="px-2 py-1 bg-stone-100 text-stone-500 text-xs font-medium rounded-lg hover:bg-stone-200 transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-stone-400">No submissions yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400 text-sm">No homework posted yet.</p>
            </div>
          )}
        </div>

        <a href={`/hackathons/${id}`} className="block text-center text-xs text-stone-400 mt-6">
          ← Back to hackathon
        </a>
      </div>
    </main>
  );
}
