"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type ChatMessage = {
  id: string;
  hackathon_id: string;
  team_id?: string | null;
  user_id: string;
  user_name?: string;
  body: string;
  created_at: string;
};

const POLL_INTERVAL_MS = 4000;

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-KE", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HackathonChatPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { token, user } = useAuth();

  const [myTeamID, setMyTeamID] = useState<string | null>(null);
  const [room, setRoom] = useState<"general" | "team">("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const lastTimestampRef = useRef<string | null>(null);

  const buildQuery = useCallback(
    (since?: string | null) => {
      const p = new URLSearchParams();
      if (room === "team" && myTeamID) p.set("team_id", myTeamID);
      if (since) p.set("since", since);
      return p.toString();
    },
    [room, myTeamID]
  );

  const fetchInitial = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/hackathons/${id}/chat?${buildQuery()}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load chat");
      const list: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
      setMessages(list);
      lastTimestampRef.current = list.length > 0 ? list[list.length - 1].created_at : null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [id, router, buildQuery]);

  const fetchHackathon = useCallback(async () => {
    const res = await apiFetch(`/hackathons/${id}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      setError("Failed to fetch hackathon");
      return;
    }
    const h = await res.json();
    setMyTeamID(h.my_team_id || null);
  }, [id, router]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchHackathon();
  }, [token, router, fetchHackathon]);

  useEffect(() => {
    if (!token) return;
    fetchInitial();
  }, [token, room, fetchInitial]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/hackathons/${id}/chat?${buildQuery(lastTimestampRef.current)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
        if (list.length > 0) {
          setMessages((prev) => [...prev, ...list]);
          lastTimestampRef.current = list[list.length - 1].created_at;
        }
      } catch {
        // ignore transient polling errors
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, id, buildQuery]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setActionError(null);
    try {
      const res = await apiFetch(`/hackathons/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({
          body: trimmed,
          team_id: room === "team" ? myTeamID : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      setMessages((prev) => [...prev, data.chat_message]);
      lastTimestampRef.current = data.chat_message.created_at;
      setBody("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not send message.");
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
          <h1 className="text-2xl font-semibold text-stone-800">Chat</h1>
          <p className="text-sm text-stone-400 mt-1">
            Talk with everyone, or just your team
          </p>
        </div>

        {myTeamID && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setRoom("general")}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${
                room === "general"
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-500 border border-stone-100"
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setRoom("team")}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${
                room === "team"
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-500 border border-stone-100"
              }`}
            >
              My Team
            </button>
          </div>
        )}

        {actionError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 mb-4">
            {actionError}
          </p>
        )}

        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          {messages.length > 0 ? (
            <div className="space-y-3 max-h-[28rem] overflow-y-auto">
              {messages.map((m) => {
                const isMine = m.user_id === user?.id;
                return (
                  <div key={m.id} className={isMine ? "text-right" : ""}>
                    <p className="text-xs text-stone-400 mb-0.5">
                      {isMine ? "You" : m.user_name || "Unknown"} · {formatTime(m.created_at)}
                    </p>
                    <p
                      className={`inline-block px-3 py-2 rounded-xl text-sm max-w-[85%] ${
                        isMine ? "bg-emerald-50 text-emerald-700" : "bg-stone-50 text-stone-700"
                      }`}
                    >
                      {m.body}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-stone-400 text-center py-4">
              No messages yet. Say hello!
            </p>
          )}
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-stone-800 text-white text-xs font-medium rounded-xl hover:bg-stone-700 transition-colors"
          >
            Send
          </button>
        </form>

        <a href={`/hackathons/${id}`} className="block text-center text-xs text-stone-400 mt-6">
          ← Back to hackathon
        </a>
      </div>
    </main>
  );
}
