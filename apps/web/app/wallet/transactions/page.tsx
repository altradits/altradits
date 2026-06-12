"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type Transaction = {
  id: string;
  amount_sats: number;
  amount_kes?: number;
  type: string;
  status: string;
  description: string;
  created_at: string;
  completed_at?: string;
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

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-red-500",
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletTransactionsPage() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch("/wallet/transactions?limit=200");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch transactions");
        const data = await res.json();
        setTransactions(data.transactions ?? []);
      } catch (err) {
        setError("Could not reach the server.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, authLoading, router]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch("/wallet/transactions/export");
      if (!res.ok) throw new Error("Failed to export transactions");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wallet-transactions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export transactions", err);
    } finally {
      setExporting(false);
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
          <p className="text-xs text-stone-300">
            Make sure the backend is running on port 8080.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">
              Transactions
            </h1>
            <p className="text-sm text-stone-400 mt-1">
              Your full wallet ledger
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-2 bg-white border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        {/* Transactions list */}
        {transactions.length > 0 ? (
          <div className="space-y-2 mb-6">
            {transactions.map((tx) => {
              const isDeposit = tx.type.startsWith("deposit");
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-xl border border-stone-100 shadow-sm px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {TYPE_EMOJI[tx.type] ?? "💸"}
                      </span>
                      <div>
                        <p className="text-sm text-stone-700">
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </p>
                        <p className="text-xs text-stone-400">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          isDeposit ? "text-emerald-600" : "text-stone-700"
                        }`}
                      >
                        {isDeposit ? "+" : "-"}
                        {formatSats(tx.amount_sats)}
                      </p>
                      <p
                        className={`text-xs ${
                          STATUS_COLORS[tx.status] ?? "text-stone-400"
                        }`}
                      >
                        {tx.status}
                      </p>
                    </div>
                  </div>
                  {tx.description && (
                    <p className="text-xs text-stone-400 mt-2 pt-2 border-t border-stone-50">
                      {tx.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-stone-400 text-sm">
              No wallet activity yet.
            </p>
          </div>
        )}

        <a
          href="/"
          className="block text-center text-xs text-stone-400 mt-4"
        >
          ← Back to wallet
        </a>
      </div>
    </main>
  );
}
