"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type ExchangeRate = {
  btc_to_kes: number;
  sats_to_kes: number;
  updated_at: string;
  source: string;
};

type Balance = {
  sats_balance: number;
  btc_balance: number;
  kes_value: number;
  total_sats_received: number;
  total_sats_withdrawn: number;
  preferred_currency: "btc" | "sats" | "kes";
  mpesa_phone_number?: string;
  rate: ExchangeRate;
};

type Transaction = {
  id: string;
  amount_sats: number;
  amount_kes?: number;
  type: string;
  status: string;
  description: string;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  deposit_mpesa: "M-Pesa Deposit",
  deposit_lightning: "Lightning Deposit",
  withdraw_mpesa: "M-Pesa Withdrawal",
  withdraw_lightning: "Lightning Withdrawal",
};

const TYPE_EMOJI: Record<string, string> = {
  deposit_mpesa: "📲",
  deposit_lightning: "⚡",
  withdraw_mpesa: "📤",
  withdraw_lightning: "⚡",
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatBTC(n: number) {
  return `₿ ${n.toFixed(8)}`;
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

function ConversionBox({
  title,
  options,
  active,
  onToggle,
  primaryDisplay,
  secondaryDisplay,
}: {
  title: string;
  options: { key: string; label: string }[];
  active: string;
  onToggle: (key: string) => void;
  primaryDisplay: string;
  secondaryDisplay: string;
}) {
  return (
    <div className="bg-stone-700/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
          {title}
        </p>
        <div className="flex bg-stone-700 rounded-lg p-0.5">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onToggle(o.key)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                active === o.key
                  ? "bg-emerald-400 text-stone-900"
                  : "text-stone-300 hover:text-stone-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xl font-semibold text-white">{primaryDisplay}</p>
      <p className="text-xs text-stone-400 mt-0.5">≈ {secondaryDisplay}</p>
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isDeposit = tx.type.startsWith("deposit");
  const isPending = tx.status === "pending";
  const amountColor = isPending
    ? "text-amber-600"
    : isDeposit
    ? "text-emerald-600"
    : "text-stone-700";

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xl">{TYPE_EMOJI[tx.type] ?? "💸"}</span>
        <div>
          <p className="text-sm text-stone-700">
            {TYPE_LABELS[tx.type] ?? tx.type}
          </p>
          <p className="text-xs text-stone-400">
            {formatDate(tx.created_at)}
            {isPending && " · pending"}
          </p>
        </div>
      </div>
      <p className={`text-sm font-medium ${amountColor}`}>
        {isDeposit ? "+" : "-"}
        {formatSats(tx.amount_sats)}
      </p>
    </div>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggle1, setToggle1] = useState<"btc" | "sats">("btc");
  const [toggle2, setToggle2] = useState<"sats" | "kes">("sats");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [balRes, txRes] = await Promise.all([
        apiFetch("/wallet/balance"),
        apiFetch("/wallet/transactions?limit=10"),
      ]);

      if (balRes.status === 401 || txRes.status === 401) {
        router.push("/login");
        return;
      }

      if (!balRes.ok || !txRes.ok) {
        throw new Error("Failed to fetch wallet");
      }

      const balData: Balance = await balRes.json();
      const txData = await txRes.json();
      setBalance(balData);
      setTransactions(txData.transactions ?? []);
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

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg mx-auto px-5">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Wallet</h1>
          <p className="text-sm text-stone-400 mt-1">
            Bitcoin Lightning + M-Pesa, in one place
          </p>
        </div>

        {/* Balance card */}
        <div className="bg-stone-800 rounded-2xl p-6 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            ⚡ Bitcoin Wallet
          </p>

          <div className="space-y-3">
            <ConversionBox
              title="BTC ⇄ Sats"
              options={[{ key: "btc", label: "BTC" }, { key: "sats", label: "SATS" }]}
              active={toggle1}
              onToggle={(k) => setToggle1(k as "btc" | "sats")}
              primaryDisplay={
                toggle1 === "btc" ? formatBTC(balance.btc_balance) : formatSats(balance.sats_balance)
              }
              secondaryDisplay={
                toggle1 === "btc" ? formatSats(balance.sats_balance) : formatBTC(balance.btc_balance)
              }
            />
            <ConversionBox
              title="Sats ⇄ KSh"
              options={[{ key: "sats", label: "SATS" }, { key: "kes", label: "KSH" }]}
              active={toggle2}
              onToggle={(k) => setToggle2(k as "sats" | "kes")}
              primaryDisplay={
                toggle2 === "sats" ? formatSats(balance.sats_balance) : formatKES(balance.kes_value)
              }
              secondaryDisplay={
                toggle2 === "sats" ? formatKES(balance.kes_value) : formatSats(balance.sats_balance)
              }
            />
          </div>

          <p className="text-xs text-stone-500 mt-3">
            1 BTC ≈ {formatKES(balance.rate.btc_to_kes)}
            {balance.rate.source === "default" && " (offline rate)"}
          </p>
          <a
            href="/wallet/price"
            className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 inline-block"
          >
            📈 Track price & set alerts →
          </a>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <a
            href="/wallet/deposit#mpesa"
            className="text-center py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium rounded-xl hover:bg-emerald-100 transition-colors"
          >
            📲 Deposit M-Pesa
          </a>
          <a
            href="/wallet/deposit#lightning"
            className="text-center py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium rounded-xl hover:bg-emerald-100 transition-colors"
          >
            ⚡ Deposit Lightning
          </a>
          <a
            href="/wallet/withdraw"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            ↑ Withdraw
          </a>
        </div>

        {/* Lifetime stats */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
            Lifetime
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-500">Total Received</p>
              <p className="text-sm font-semibold text-emerald-600">
                +{formatSats(balance.total_sats_received)}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Total Withdrawn</p>
              <p className="text-sm font-semibold text-stone-700">
                {formatSats(balance.total_sats_withdrawn)}
              </p>
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
              Recent Activity
            </p>
            <a
              href="/wallet/transactions"
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              See all →
            </a>
          </div>

          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-400 text-sm">
                No wallet activity yet. Make your first deposit to get started.
              </p>
            </div>
          )}
        </div>

        {/* Nav row */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <a
            href="/"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Dashboard
          </a>
          <a
            href="/investments"
            className="text-center py-3 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Investments
          </a>
        </div>
      </div>
    </main>
  );
}
