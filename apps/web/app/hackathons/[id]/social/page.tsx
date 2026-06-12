"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type SocialPost = {
  id: string;
  hackathon_id: string;
  user_id: string;
  user_name?: string;
  platform: string;
  url: string;
  status: string;
  reward_sats: number;
  submitted_at: string;
  reviewed_at?: string | null;
};

type SubmitForm = {
  platform: string;
  url: string;
};

const EMPTY_FORM: SubmitForm = { platform: "", url: "" };

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

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HackathonSocialPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token } = useAuth();

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [rewardSats, setRewardSats] = useState(0);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<SubmitForm>(EMPTY_FORM);

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
      setRewardSats(h.social_post_reward_sats || 0);

      const postsRes = await apiFetch(`/hackathons/${id}/social-posts`);
      const postsData = await postsRes.json().catch(() => ({}));
      if (!postsRes.ok) throw new Error(postsData.error || "Failed to fetch social posts");
      setPosts(Array.isArray(postsData.posts) ? postsData.posts : []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/social-posts`, {
        method: "POST",
        body: JSON.stringify({
          platform: form.platform.trim(),
          url: form.url.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to submit post");
      setMessage(data.message || "Post submitted for review.");
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not submit post.");
    }
  };

  const handleReview = async (postID: string, status: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/social-posts/${postID}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to review post");
      setMessage(data.message || "Post updated.");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not review post.");
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
          <h1 className="text-2xl font-semibold text-stone-800">Social Posts</h1>
          <p className="text-sm text-stone-400 mt-1">
            Share the hackathon and earn sats
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

        {!isOrganizer && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Submit a Post
            </p>
            <p className="text-xs text-stone-500 mb-3">
              Posted about this hackathon? Submit the link for a {rewardSats} sat reward once approved.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Platform</label>
                <input
                  type="text"
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  placeholder="e.g., X, LinkedIn, Instagram"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Post URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://..."
                  required
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Submit for Review
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {posts.length > 0 ? (
            posts.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">
                      {p.platform || "Post"}
                      {isOrganizer ? ` — ${p.user_name || "Unknown"}` : ""}
                    </p>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 break-all hover:underline"
                    >
                      {p.url}
                    </a>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                      STATUS_COLORS[p.status] || "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {STATUS_LABELS[p.status] || p.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-400">{formatTime(p.submitted_at)}</p>
                  {p.reward_sats > 0 && (
                    <p className="text-xs font-medium text-amber-600">{p.reward_sats} sats</p>
                  )}
                </div>
                {isOrganizer && p.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleReview(p.id, "approved")}
                      className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(p.id, "rejected")}
                      className="px-2 py-1 bg-stone-100 text-stone-500 text-xs font-medium rounded-lg hover:bg-stone-200 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400 text-sm">No social posts submitted yet.</p>
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
