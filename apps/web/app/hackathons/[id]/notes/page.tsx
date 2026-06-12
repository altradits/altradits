"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type DailyNote = {
  id: string;
  hackathon_id: string;
  day_number: number;
  title: string;
  content: string;
  resources: string;
  created_at: string;
  updated_at: string;
};

type NoteForm = {
  day_number: string;
  title: string;
  content: string;
  resources: string;
};

const EMPTY_FORM: NoteForm = { day_number: "", title: "", content: "", resources: "" };

export default function HackathonNotesPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token } = useAuth();

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<NoteForm>(EMPTY_FORM);

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

      const notesRes = await apiFetch(`/hackathons/${id}/notes`);
      const notesData = await notesRes.json().catch(() => ({}));
      if (!notesRes.ok) throw new Error(notesData.error || "Failed to fetch notes");
      setNotes(Array.isArray(notesData.notes) ? notesData.notes : []);
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

  const handleEdit = (note: DailyNote) => {
    setForm({
      day_number: String(note.day_number),
      title: note.title,
      content: note.content,
      resources: note.resources,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          day_number: parseInt(form.day_number, 10) || 0,
          title: form.title,
          content: form.content,
          resources: form.resources,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save note");
      setMessage(data.message || "Note saved.");
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save note.");
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
          <h1 className="text-2xl font-semibold text-stone-800">Daily Notes</h1>
          <p className="text-sm text-stone-400 mt-1">
            Resources and updates for each day
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
              Post or Edit a Day&apos;s Note
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Day Number</label>
                <input
                  type="number"
                  min="1"
                  value={form.day_number}
                  onChange={(e) => setForm({ ...form, day_number: e.target.value })}
                  placeholder="e.g., 1"
                  required
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Kickoff & team formation"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={4}
                  placeholder="What's happening today?"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Resources</label>
                <textarea
                  value={form.resources}
                  onChange={(e) => setForm({ ...form, resources: e.target.value })}
                  rows={2}
                  placeholder="Links, slides, docs..."
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
              >
                Save Note
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {notes.length > 0 ? (
            notes.map((n) => (
              <div key={n.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-stone-800">
                    Day {n.day_number}
                    {n.title ? ` — ${n.title}` : ""}
                  </p>
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={() => handleEdit(n)}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {n.content && (
                  <p className="text-sm text-stone-600 whitespace-pre-wrap mb-2">{n.content}</p>
                )}
                {n.resources && (
                  <p className="text-xs text-stone-500 whitespace-pre-wrap">
                    📎 {n.resources}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400 text-sm">No notes posted yet.</p>
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
