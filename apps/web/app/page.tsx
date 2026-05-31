"use client";

import { useEffect, useState } from "react";

type HealthStatus = {
  status: string;
  database: { connected: boolean };
  redis: { connected: boolean };
  app: string;
  version: string;
} | null;

export default function Home() {
  const [health, setHealth] = useState<HealthStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    console.log('Fetching health from:', apiUrl);
    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then((data) => {
        console.log('Health response:', data);
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-8 font-sans">
      <div className="max-w-sm w-full space-y-6">

        {/* Wordmark */}
        <div>
          <p className="text-xs text-stone-400 mb-1 tracking-wide">
            calm financial companionship
          </p>
          <h1 className="text-2xl font-semibold text-stone-800">
            ⚡ Altradits
          </h1>
        </div>

        {/* Status card */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 space-y-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
            System status
          </p>

          {loading && (
            <p className="text-sm text-stone-400">Checking connections...</p>
          )}

          {error && (
            <div className="space-y-3">
              <Row label="Backend API" ok={false} />
              <Row label="Database" ok={false} />
              <Row label="Redis" ok={false} />
              <p className="text-xs text-red-400 pt-2 border-t border-stone-50">
                Could not reach {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/health
              </p>
              <p className="text-xs text-stone-400">
                Make sure the Go server is running: <code className="bg-stone-100 px-1 rounded">cd server && air</code>
              </p>
            </div>
          )}

          {health && (
            <div className="space-y-3">
              <Row
                label="Backend API"
                ok={true}
                note={health.status === "degraded" ? "degraded" : undefined}
              />
              <Row label="Database" ok={health.database.connected} />
              <Row label="Redis" ok={health.redis.connected} />
              <div className="pt-3 border-t border-stone-50">
                <p className="text-xs text-stone-300">
                  {health.app} v{health.version}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Ready banner */}
         {health?.status === "ok" && (
           <div className="mt-4 space-y-3">
             <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
               <p className="text-sm text-emerald-700 font-medium">
                 ✅ All systems connected.
               </p>
             </div>
             <a
               href="/capture"
               className="block w-full text-center px-4 py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
             >
               Open Capture →
             </a>
           </div>
         )}

        {health?.status === "degraded" && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-700">
              ⚠️ Partially connected.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Check the terminal output for connection errors.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}

function Row({
  label,
  ok,
  note,
}: {
  label: string;
  ok: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-600">{label}</span>
      <span
        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
          ok
            ? "bg-emerald-50 text-emerald-600"
            : "bg-red-50 text-red-500"
        }`}
      >
        {ok ? (note ?? "connected") : "offline"}
      </span>
    </div>
  );
}
