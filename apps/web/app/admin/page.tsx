"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type BankStats = {
  total_users: number;
  active_users: number;
  total_sats_balance: number;
  total_sats_received: number;
  total_sats_withdrawn: number;
  total_transactions: number;
  pending_transactions: number;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  current_sats_balance: number;
  total_sats_received: number;
  total_sats_withdrawn: number;
  created_at: string;
  last_login?: string;
};

type AdminTransaction = {
  id: string;
  user_name: string;
  user_email: string;
  amount_sats: number;
  type: string;
  status: string;
  description: string;
  created_at: string;
};

type LedgerDiscrepancy = {
  user_id: string;
  name: string;
  email: string;
  current_sats_balance: number;
  total_sats_received: number;
  total_sats_withdrawn: number;
  ledger_received_sats: number;
  ledger_withdrawn_sats: number;
};

const TYPE_LABELS: Record<string, string> = {
  deposit_mpesa: "M-Pesa Deposit",
  deposit_lightning: "Lightning Deposit",
  withdraw_mpesa: "M-Pesa Withdrawal",
  withdraw_lightning: "Lightning Withdrawal",
  interest: "Interest",
};

// Transaction types that credit (increase) a user's balance — used to pick
// the "+"/"-" sign in the activity feed. Everything else is a debit.
const CREDIT_TYPES = new Set(["deposit_mpesa", "deposit_lightning", "interest"]);

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-red-500",
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatDateTime(dateString?: string) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-semibold text-stone-800">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<BankStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [discrepancies, setDiscrepancies] = useState<LedgerDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    if (user && !user.is_admin) {
      router.push("/");
      return;
    }
  }, [token, user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !token || !user?.is_admin) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [statsRes, usersRes, txRes, integrityRes] = await Promise.all([
          apiFetch("/admin/stats"),
          apiFetch("/admin/users"),
          apiFetch("/admin/transactions?limit=20"),
          apiFetch("/admin/ledger/integrity"),
        ]);
        if (!statsRes.ok || !usersRes.ok || !txRes.ok || !integrityRes.ok) {
          throw new Error("Failed to load admin data");
        }
        setStats(await statsRes.json());
        setUsers((await usersRes.json()).users ?? []);
        setTransactions((await txRes.json()).transactions ?? []);
        setDiscrepancies((await integrityRes.json()).discrepancies ?? []);
      } catch (err) {
        setError("Could not load admin dashboard.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user, authLoading]);

  if (authLoading || (!authLoading && token && !user)) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading...</p>
      </main>
    );
  }

  if (!token || (user && !user.is_admin)) {
    return null;
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Admin · The Bank</h1>
          <p className="text-sm text-stone-400 mt-1">
            Bank-wide balances, accounts, and activity
          </p>
        </div>

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : error || !stats ? (
          <p className="text-red-500 text-sm">{error ?? "Could not load admin dashboard."}</p>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <StatCard label="Total Users" value={stats.total_users.toLocaleString("en-US")} />
              <StatCard label="Active Users" value={stats.active_users.toLocaleString("en-US")} />
              <StatCard label="In Wallets" value={formatSats(stats.total_sats_balance)} />
              <StatCard label="Total Received" value={formatSats(stats.total_sats_received)} />
              <StatCard label="Total Withdrawn" value={formatSats(stats.total_sats_withdrawn)} />
              <StatCard
                label="Pending Tx"
                value={`${stats.pending_transactions} / ${stats.total_transactions}`}
              />
            </div>

            {/* Users */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Users
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="font-medium pb-2 pr-3">Name</th>
                      <th className="font-medium pb-2 pr-3">Email</th>
                      <th className="font-medium pb-2 pr-3 text-right">Balance</th>
                      <th className="font-medium pb-2 pr-3">Status</th>
                      <th className="font-medium pb-2">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-stone-100">
                        <td className="py-2 pr-3 text-stone-700">{u.name}</td>
                        <td className="py-2 pr-3 text-stone-500">{u.email}</td>
                        <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                          {formatSats(u.current_sats_balance)}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-1">
                            {u.is_admin && (
                              <span className="text-emerald-600 font-medium">Admin</span>
                            )}
                            {!u.is_active && <span className="text-red-500">Inactive</span>}
                          </div>
                        </td>
                        <td className="py-2 text-stone-400 whitespace-nowrap">
                          {formatDateTime(u.last_login)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent transactions */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Recent Activity
              </p>
              {transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone-400">
                        <th className="font-medium pb-2 pr-3">User</th>
                        <th className="font-medium pb-2 pr-3">Type</th>
                        <th className="font-medium pb-2 pr-3 text-right">Amount</th>
                        <th className="font-medium pb-2 pr-3">Status</th>
                        <th className="font-medium pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-t border-stone-100">
                          <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">
                            {tx.user_name}
                          </td>
                          <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">
                            {TYPE_LABELS[tx.type] ?? tx.type}
                          </td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                            {CREDIT_TYPES.has(tx.type) ? "+" : "-"}
                            {formatSats(tx.amount_sats)}
                          </td>
                          <td className={`py-2 pr-3 ${STATUS_COLORS[tx.status] ?? "text-stone-500"}`}>
                            {tx.status}
                          </td>
                          <td className="py-2 text-stone-400 whitespace-nowrap">
                            {formatDateTime(tx.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-stone-400 text-sm text-center py-4">No transactions yet.</p>
              )}
            </div>

            {/* Ledger integrity */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                Ledger Integrity
              </p>
              {discrepancies.length === 0 ? (
                <p className="text-emerald-600 text-sm text-center py-4">
                  All balances reconciled ✓
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone-400">
                        <th className="font-medium pb-2 pr-3">User</th>
                        <th className="font-medium pb-2 pr-3 text-right">Recorded Balance</th>
                        <th className="font-medium pb-2 pr-3 text-right">Ledger Balance</th>
                        <th className="font-medium pb-2 pr-3 text-right">Recorded Received</th>
                        <th className="font-medium pb-2 pr-3 text-right">Ledger Received</th>
                        <th className="font-medium pb-2 pr-3 text-right">Recorded Withdrawn</th>
                        <th className="font-medium pb-2 text-right">Ledger Withdrawn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discrepancies.map((d) => (
                        <tr key={d.user_id} className="border-t border-stone-100">
                          <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">
                            {d.name}
                            <span className="block text-stone-400">{d.email}</span>
                          </td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                            {formatSats(d.current_sats_balance)}
                          </td>
                          <td className="py-2 pr-3 text-right text-red-500 whitespace-nowrap">
                            {formatSats(d.ledger_received_sats - d.ledger_withdrawn_sats)}
                          </td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                            {formatSats(d.total_sats_received)}
                          </td>
                          <td className="py-2 pr-3 text-right text-red-500 whitespace-nowrap">
                            {formatSats(d.ledger_received_sats)}
                          </td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                            {formatSats(d.total_sats_withdrawn)}
                          </td>
                          <td className="py-2 text-right text-red-500 whitespace-nowrap">
                            {formatSats(d.ledger_withdrawn_sats)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
