"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type CreateForm = {
  name: string;
  description: string;
  theme: string;
  application_deadline: string;
  start_date: string;
  end_date: string;
  min_team_size: number;
  max_team_size: number;
  social_post_reward_sats: number;
};

export default function NewHackathonPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [form, setForm] = useState<CreateForm>({
    name: "",
    description: "",
    theme: "",
    application_deadline: "",
    start_date: "",
    end_date: "",
    min_team_size: 2,
    max_team_size: 5,
    social_post_reward_sats: 1000,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim(),
      theme: form.theme.trim(),
      min_team_size: form.min_team_size,
      max_team_size: form.max_team_size,
      social_post_reward_sats: form.social_post_reward_sats,
    };
    if (form.application_deadline) {
      payload.application_deadline = new Date(form.application_deadline).toISOString();
    }
    if (form.start_date) {
      payload.start_date = new Date(form.start_date).toISOString();
    }
    if (form.end_date) {
      payload.end_date = new Date(form.end_date).toISOString();
    }

    try {
      const res = await apiFetch("/hackathons", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create hackathon");
      }

      router.push(`/hackathons/${data.hackathon.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save hackathon. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">
            New Hackathon
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Set up your event
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Lightning Build Sprint"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Theme</label>
            <input
              type="text"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value })}
              placeholder="e.g., Financial inclusion"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What's this hackathon about?"
              rows={4}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Application Deadline
            </label>
            <input
              type="date"
              value={form.application_deadline}
              onChange={(e) => setForm({ ...form, application_deadline: e.target.value })}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Min Team Size
              </label>
              <input
                type="number"
                value={form.min_team_size}
                onChange={(e) =>
                  setForm({ ...form, min_team_size: parseInt(e.target.value) || 1 })
                }
                min="1"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                Max Team Size
              </label>
              <input
                type="number"
                value={form.max_team_size}
                onChange={(e) =>
                  setForm({ ...form, max_team_size: parseInt(e.target.value) || 1 })
                }
                min="1"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Social Post Reward (sats)
            </label>
            <input
              type="number"
              value={form.social_post_reward_sats}
              onChange={(e) =>
                setForm({ ...form, social_post_reward_sats: parseInt(e.target.value) || 0 })
              }
              min="0"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
            <p className="text-xs text-stone-400 mt-1">
              Sats awarded for each approved social media post.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Hackathon"}
          </button>
        </form>

        <a
          href="/hackathons"
          className="block text-center text-xs text-stone-400 mt-4"
        >
          ← Back to hackathons
        </a>
      </div>
    </main>
  );
}
