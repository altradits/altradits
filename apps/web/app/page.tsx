"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import DonutChart from "@/components/DonutChart";
import LineChart from "@/components/LineChart";
import ReceivePanel from "@/components/ReceivePanel";
import SendPanel from "@/components/SendPanel";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
};

type Balance = {
  sats_balance: number;
  kes_value: number;
  lightning_address: string;
  rate: ExchangeRate;
};

type Transaction = {
  id: string;
  amount_sats: number;
  type: string;
  status: string;
  created_at: string;
};

type PoolAsset = {
  name: string;
  asset_class: string;
  allocation_pct: number;
  apy_pct: number;
};

type InterestSummary = {
  monthly_earned_sats: number;
  lifetime_earned_sats: number;
  current_apy_pct: number;
};

const POOL_COLORS: Record<string, { stroke: string; dot: string }> = {
  bond_funds: { stroke: "stroke-indigo-500", dot: "bg-indigo-500" },
  money_market: { stroke: "stroke-violet-400", dot: "bg-violet-400" },
  dividend_equities: { stroke: "stroke-sky-400", dot: "bg-sky-400" },
  cash_btc: { stroke: "stroke-slate-300", dot: "bg-slate-300" },
  tokenized_rwa: { stroke: "stroke-amber-400", dot: "bg-amber-400" },
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
  const isInterest = tx.type === "interest";
  const isDeposit = tx.type.startsWith("deposit") || isInterest;
  const isLightning = tx.type.endsWith("lightning");
  const isPending = tx.status === "pending";
  const amountColor = isPending
    ? "text-amber-600"
    : isDeposit
    ? "text-emerald-600"
    : "text-stone-700";
  const icon = isInterest ? "💰" : isLightning ? "⚡" : "📲";

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
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
  const [poolAssets, setPoolAssets] = useState<PoolAsset[]>([]);
  const [interest, setInterest] = useState<InterestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [balRes, txRes, poolRes, interestRes] = await Promise.all([
        apiFetch("/wallet/balance"),
        apiFetch("/wallet/transactions?limit=50"),
        apiFetch("/wallet/pool/allocation"),
        apiFetch("/wallet/pool/interest"),
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

      if (poolRes.ok) {
        const poolData = await poolRes.json();
        setPoolAssets(poolData.assets ?? []);
      }
      if (interestRes.ok) {
        setInterest(await interestRes.json());
      }
    } catch (err) {
      setError("Could not reach the server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!balance?.lightning_address) return;
    try {
      await navigator.clipboard.writeText(balance.lightning_address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      // ignore
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

  // Cumulative balance over time, ending at the current balance.
  const completedTx = transactions
    .filter((tx) => tx.status === "completed")
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const balanceHistory = (() => {
    if (completedTx.length === 0) {
      return [{ label: "Now", value: balance.sats_balance }];
    }
    const totalDelta = completedTx.reduce(
      (sum, tx) => sum + (tx.type.startsWith("withdraw") ? -tx.amount_sats : tx.amount_sats),
      0
    );
    let running = balance.sats_balance - totalDelta;
    const points = [{ label: formatDate(completedTx[0].created_at), value: running }];
    for (const tx of completedTx) {
      running += tx.type.startsWith("withdraw") ? -tx.amount_sats : tx.amount_sats;
      points.push({ label: formatDate(tx.created_at), value: running });
    }
    return points;
  })();

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

          {balance.lightning_address && (
            <div className="mt-3 flex items-center justify-between gap-2 bg-white/10 rounded-xl px-3 py-2">
              <p className="text-xs font-mono text-white truncate">
                ⚡ {balance.lightning_address}
              </p>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="text-xs text-white/80 hover:text-white shrink-0"
              >
                {addressCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        {/* Balance growth */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            Balance growth
          </p>
          <LineChart points={balanceHistory} />
        </div>

        {/* Interest meter + pool allocation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Interest earned
            </p>
            {interest ? (
              <div className="space-y-2">
                <div>
                  <p className="text-2xl font-semibold text-emerald-600">
                    +{formatSats(interest.monthly_earned_sats)}
                  </p>
                  <p className="text-xs text-stone-400">this month</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <span className="text-xs text-stone-400">APY</span>
                  <span className="text-sm font-medium text-stone-700">
                    {interest.current_apy_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400">Lifetime</span>
                  <span className="text-sm font-medium text-stone-700">
                    {formatSats(interest.lifetime_earned_sats)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-stone-400 text-sm">Loading...</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
              Your sats are working
            </p>
            {poolAssets.length > 0 ? (
              <>
                <DonutChart
                  segments={poolAssets.map((a) => ({
                    label: a.name,
                    value: a.allocation_pct,
                    colorClass: POOL_COLORS[a.asset_class]?.stroke ?? "stroke-stone-300",
                    dotClass: POOL_COLORS[a.asset_class]?.dot ?? "bg-stone-300",
                  }))}
                />
                <p className="text-xs text-stone-400 mt-3">
                  Your sats are diversified across low-risk funds for steady,
                  capital-preserving yield.
                </p>
              </>
            ) : (
              <p className="text-stone-400 text-sm">Loading...</p>
            )}
          </div>
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
