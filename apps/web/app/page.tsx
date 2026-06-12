"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import DonutChart from "@/components/DonutChart";
import ReceivePanel from "@/components/ReceivePanel";
import SendPanel from "@/components/SendPanel";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
};

type Balance = {
  sats_balance: number;
  kes_value: number;
  rate: ExchangeRate;
};

type Transaction = {
  id: string;
  amount_sats: number;
  type: string;
  status: string;
  created_at: string;
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-KE", {
    month: "short",
    day: "numeric",
  });
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isDeposit = tx.type.startsWith("deposit");
  const isLightning = tx.type.endsWith("lightning");
  const isPending = tx.status === "pending";
  const amountColor = isPending
    ? "text-amber-600"
    : isDeposit
    ? "text-emerald-600"
    : "text-stone-700";

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xl">{isLightning ? "⚡" : "📲"}</span>
        <p className="text-xs text-stone-400">
          {formatDate(tx.created_at)}
          {isPending && " · pending"}
        </p>
      </div>
      <p className={`text-sm font-medium ${amountColor}`}>
        {isDeposit ? "+" : "-"}
        {formatSats(tx.amount_sats)}
      </p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [balRes, txRes] = await Promise.all([
        apiFetch("/wallet/balance"),
        apiFetch("/wallet/transactions?limit=50"),
      ]);

      if (balRes.status === 401 || txRes.status === 401) {
        router.push("/login");
        return;
      }

      if (!balRes.ok || !txRes.ok) {
        throw new Error("Failed to fetch wallet");
      }

      setBalance(await balRes.json());
      const txData = await txRes.json();
      setTransactions(txData.transactions ?? []);
    } catch (err) {
      setError("Could not reach the server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !token) return;
    fetchData();
  }, [token, authLoading, router]);

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!token) {
    return <LandingPage />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !balance) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-stone-400 text-sm mb-2">
            {error ?? "Could not load wallet."}
          </p>
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  const satsVolume = transactions
    .filter((tx) => tx.type === "deposit_lightning" || tx.type === "withdraw_lightning")
    .reduce((sum, tx) => sum + tx.amount_sats, 0);
  const mpesaVolume = transactions
    .filter((tx) => tx.type === "deposit_mpesa" || tx.type === "withdraw_mpesa")
    .reduce((sum, tx) => sum + tx.amount_sats, 0);

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">
            Hi, {user?.name ?? "there"}
          </h1>
        </div>

        {/* Balance card */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 mb-4">
          <p className="text-xs text-indigo-100 font-medium uppercase tracking-wider mb-1">
            Balance
          </p>
          <p className="text-3xl font-semibold text-white">{formatSats(balance.sats_balance)}</p>
          <p className="text-sm text-indigo-100 mt-1">≈ {formatKES(balance.kes_value)}</p>
          <a
            href="/wallet/price"
            className="text-xs text-white/80 hover:text-white mt-3 inline-block"
          >
            📈 Track price →
          </a>
        </div>

        {/* Activity donut */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            Activity
          </p>
          <DonutChart
            segments={[
              { label: "Sats", value: satsVolume, colorClass: "stroke-indigo-500", dotClass: "bg-indigo-500" },
              { label: "M-Pesa", value: mpesaVolume, colorClass: "stroke-violet-400", dotClass: "bg-violet-400" },
            ]}
          />
        </div>

        {/* Receive / Send */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div id="receive">
            <ReceivePanel rate={balance.rate} onCompleted={fetchData} />
          </div>
          <div id="send">
            <SendPanel rate={balance.rate} onCompleted={fetchData} />
          </div>
        </div>

        {/* Recent activity */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
              Recent
            </p>
            <a href="/wallet/transactions" className="text-xs text-stone-400 hover:text-stone-600">
              See all →
            </a>
          </div>

          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          ) : (
            <p className="text-stone-400 text-sm text-center py-8">No activity yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-stone-400 text-sm">Loading...</p>
    </main>
  );
}

function FeatureCard({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
      <p className="text-xl mb-1">{icon}</p>
      <p className="text-xs font-medium text-stone-600">{title}</p>
    </div>
  );
}

function LandingPage() {
  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <p className="text-4xl">⚡</p>
        <h1 className="text-3xl font-semibold text-stone-800 mt-3">Altradits</h1>
        <p className="text-sm text-stone-400 mt-2">
          Send, receive, and cash out — Sats or M-Pesa, in one place.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <a
            href="/register"
            className="flex-1 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Create account
          </a>
          <a
            href="/login"
            className="flex-1 py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Sign in
          </a>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-10">
          <FeatureCard icon="⚡" title="Lightning" />
          <FeatureCard icon="📲" title="M-Pesa" />
          <FeatureCard icon="📈" title="Live rates" />
        </div>
      </div>
    </main>
  );
}
