"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import LineChart from "@/components/LineChart";
import BarChart from "@/components/BarChart";
import Gauge from "@/components/Gauge";
import Treemap from "@/components/Treemap";
import Heatmap from "@/components/Heatmap";

type PoolAsset = {
  name: string;
  asset_class: string;
  allocation_pct: number;
  apy_pct: number;
  risk_score: string;
};

type PoolOverview = {
  aum_sats: number;
  interest_paid_this_month_sats: number;
  projected_monthly_interest_sats: number;
  available_for_deployment_sats: number;
  pending_withdrawals_sats: number;
  blended_apy_pct: number;
  customer_apy_pct: number;
};

type NAVPoint = {
  date: string;
  aum_sats: number;
  blended_apy_pct: number;
};

type RiskReport = {
  current_aum_sats: number;
  all_time_high_sats: number;
  current_drawdown_pct: number;
  max_drawdown_pct: number;
  volatility_pct: number;
  sharpe_ratio: number;
};

type Alert = {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

type PoolConfig = {
  bank_fee_pct: number;
  target_apy_pct: number;
};

type RebalanceLogEntry = {
  asset_class: string;
  old_allocation_pct: number;
  new_allocation_pct: number;
  old_apy_pct: number;
  new_apy_pct: number;
  changed_by_name: string | null;
  created_at: string;
};

type AllocDraft = Record<string, { allocation_pct: number; apy_pct: number }>;

const ASSET_COLORS: Record<string, string> = {
  bond_funds: "bg-indigo-500",
  money_market: "bg-violet-400",
  dividend_equities: "bg-sky-400",
  cash_btc: "bg-slate-400",
  tokenized_rwa: "bg-amber-400",
};

const ALERT_STYLES: Record<string, string> = {
  info: "border-stone-200 bg-stone-50 text-stone-600",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

function formatDateTime(dateString: string) {
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
      <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-semibold text-stone-800">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-4">
      <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function TraderPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const [overview, setOverview] = useState<PoolOverview | null>(null);
  const [navHistory, setNavHistory] = useState<NAVPoint[]>([]);
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<PoolConfig | null>(null);
  const [assets, setAssets] = useState<PoolAsset[]>([]);
  const [rebalanceLog, setRebalanceLog] = useState<RebalanceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allocDraft, setAllocDraft] = useState<AllocDraft>({});
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [allocSuccess, setAllocSuccess] = useState<string | null>(null);

  const [configDraft, setConfigDraft] = useState<PoolConfig>({ bank_fee_pct: 0, target_apy_pct: 0 });
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewRes, navRes, riskRes, alertsRes, configRes, assetsRes, logRes] = await Promise.all([
        apiFetch("/admin/pool/overview"),
        apiFetch("/admin/pool/nav-history?days=30"),
        apiFetch("/admin/pool/risk"),
        apiFetch("/admin/pool/alerts"),
        apiFetch("/admin/pool/config"),
        apiFetch("/wallet/pool/allocation"),
        apiFetch("/admin/pool/rebalance-log?limit=20"),
      ]);
      if (!overviewRes.ok || !navRes.ok || !riskRes.ok || !alertsRes.ok || !configRes.ok || !assetsRes.ok || !logRes.ok) {
        throw new Error("Failed to load trader dashboard");
      }
      setOverview(await overviewRes.json());
      setNavHistory((await navRes.json()).history ?? []);
      setRisk(await riskRes.json());
      setAlerts((await alertsRes.json()).alerts ?? []);

      const configData: PoolConfig = await configRes.json();
      setConfig(configData);
      setConfigDraft(configData);

      const assetsData: PoolAsset[] = (await assetsRes.json()).assets ?? [];
      setAssets(assetsData);
      setAllocDraft(
        Object.fromEntries(
          assetsData.map((a) => [a.asset_class, { allocation_pct: a.allocation_pct, apy_pct: a.apy_pct }])
        )
      );

      setRebalanceLog((await logRes.json()).entries ?? []);
    } catch (err) {
      setError("Could not load trader dashboard.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshDerived = async () => {
    const [overviewRes, riskRes, alertsRes, logRes] = await Promise.all([
      apiFetch("/admin/pool/overview"),
      apiFetch("/admin/pool/risk"),
      apiFetch("/admin/pool/alerts"),
      apiFetch("/admin/pool/rebalance-log?limit=20"),
    ]);
    if (overviewRes.ok) setOverview(await overviewRes.json());
    if (riskRes.ok) setRisk(await riskRes.json());
    if (alertsRes.ok) setAlerts((await alertsRes.json()).alerts ?? []);
    if (logRes.ok) setRebalanceLog((await logRes.json()).entries ?? []);
  };

  useEffect(() => {
    if (authLoading || !token || !user?.is_admin) return;
    fetchData();
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

  const updateAlloc = (assetClass: string, field: "allocation_pct" | "apy_pct", value: string) => {
    const num = parseFloat(value);
    setAllocDraft((prev) => ({
      ...prev,
      [assetClass]: { ...prev[assetClass], [field]: isNaN(num) ? 0 : num },
    }));
  };

  const totalAllocPct =
    Math.round(Object.values(allocDraft).reduce((sum, e) => sum + (e.allocation_pct || 0), 0) * 100) / 100;

  const handleRebalanceSubmit = async () => {
    setAllocSaving(true);
    setAllocError(null);
    setAllocSuccess(null);
    try {
      const entries = assets.map((a) => ({
        asset_class: a.asset_class,
        allocation_pct: allocDraft[a.asset_class]?.allocation_pct ?? a.allocation_pct,
        apy_pct: allocDraft[a.asset_class]?.apy_pct ?? a.apy_pct,
      }));
      const res = await apiFetch("/admin/pool/allocation", {
        method: "PUT",
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rebalance");
      const updated: PoolAsset[] = data.assets ?? [];
      setAssets(updated);
      setAllocDraft(
        Object.fromEntries(updated.map((a) => [a.asset_class, { allocation_pct: a.allocation_pct, apy_pct: a.apy_pct }]))
      );
      setAllocSuccess("Allocation updated.");
      await refreshDerived();
    } catch (err) {
      setAllocError(err instanceof Error ? err.message : "Failed to rebalance");
    } finally {
      setAllocSaving(false);
    }
  };

  const handleConfigSubmit = async () => {
    setConfigSaving(true);
    setConfigError(null);
    setConfigSuccess(null);
    try {
      const res = await apiFetch("/admin/pool/config", {
        method: "PUT",
        body: JSON.stringify(configDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update config");
      setConfig(data);
      setConfigDraft(data);
      setConfigSuccess("Config updated.");
      await refreshDerived();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to update config");
    } finally {
      setConfigSaving(false);
    }
  };

  const navPoints = navHistory.map((p) => ({ label: formatDate(p.date), value: p.aum_sats }));
  const pnlBars = navHistory.slice(1).map((p, i) => ({
    label: formatDate(p.date),
    value: p.aum_sats - navHistory[i].aum_sats,
  }));

  const treemapBlocks = assets.map((a) => ({
    label: a.name,
    value: a.allocation_pct,
    colorClass: ASSET_COLORS[a.asset_class] ?? "bg-stone-400",
  }));

  const heatmapDays = navHistory.slice(-7);
  const heatmapRows = assets.map((a) => ({
    label: a.name,
    cells: heatmapDays.map((d) => ({
      label: formatDate(d.date),
      value: (a.allocation_pct / 100) * (a.apy_pct / 365 / 100) * d.aum_sats,
    })),
  }));

  const assetNameByClass = Object.fromEntries(assets.map((a) => [a.asset_class, a.name]));

  let drawdownColor = "stroke-emerald-500";
  if (risk) {
    if (risk.current_drawdown_pct >= 2) drawdownColor = "stroke-red-500";
    else if (risk.current_drawdown_pct >= 1) drawdownColor = "stroke-amber-500";
  }

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Trader · Pool Management</h1>
          <p className="text-sm text-stone-400 mt-1">
            Deploy pooled sats for yield, monitor risk, and rebalance the portfolio
          </p>
        </div>

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : error || !overview || !risk || !config ? (
          <p className="text-red-500 text-sm">{error ?? "Could not load trader dashboard."}</p>
        ) : (
          <>
            {/* Pool Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <StatCard label="AUM" value={formatSats(overview.aum_sats)} />
              <StatCard label="Customer APY" value={formatPct(overview.customer_apy_pct)} />
              <StatCard label="Pool (Blended) APY" value={formatPct(overview.blended_apy_pct)} />
              <StatCard label="Interest Paid This Month" value={formatSats(overview.interest_paid_this_month_sats)} />
              <StatCard label="Projected Monthly Interest" value={formatSats(overview.projected_monthly_interest_sats)} />
              <StatCard label="Available for Deployment" value={formatSats(overview.available_for_deployment_sats)} />
              <StatCard label="Pending Withdrawals" value={formatSats(overview.pending_withdrawals_sats)} />
            </div>

            {/* NAV history */}
            <Card title="Pool NAV (sats)">
              <LineChart points={navPoints} />
            </Card>

            {/* P&L waterfall */}
            <Card title="Daily P&L (sats)">
              <BarChart bars={pnlBars} />
            </Card>

            {/* Gauges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">
                  Yield vs Target
                </p>
                <Gauge
                  value={overview.customer_apy_pct}
                  max={10}
                  target={config.target_apy_pct}
                  label={`Target ${formatPct(config.target_apy_pct)}`}
                  valueLabel={formatPct(overview.customer_apy_pct)}
                  colorClass={overview.customer_apy_pct >= config.target_apy_pct ? "stroke-emerald-500" : "stroke-amber-500"}
                />
              </div>
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">
                  Drawdown vs -2% Limit
                </p>
                <Gauge
                  value={risk.current_drawdown_pct}
                  max={2}
                  label="From all-time high"
                  valueLabel={`-${formatPct(risk.current_drawdown_pct)}`}
                  colorClass={drawdownColor}
                />
              </div>
            </div>

            {/* Asset allocation */}
            <Card title="Asset Allocation">
              <Treemap blocks={treemapBlocks} />
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="font-medium pb-2 pr-3">Asset</th>
                      <th className="font-medium pb-2 pr-3">Risk</th>
                      <th className="font-medium pb-2 pr-3 text-right">Allocation</th>
                      <th className="font-medium pb-2 pr-3 text-right">APY</th>
                      <th className="font-medium pb-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.asset_class} className="border-t border-stone-100">
                        <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">{a.name}</td>
                        <td className="py-2 pr-3 text-stone-500">{a.risk_score}</td>
                        <td className="py-2 pr-3 text-right text-stone-700">{formatPct(a.allocation_pct)}</td>
                        <td className="py-2 pr-3 text-right text-stone-700">{formatPct(a.apy_pct)}</td>
                        <td className="py-2 text-right text-stone-700 whitespace-nowrap">
                          {formatSats(Math.round((a.allocation_pct / 100) * overview.aum_sats))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Performance heatmap */}
            <Card title="Performance by Asset Class (last 7 days, est. daily sats)">
              <Heatmap rows={heatmapRows} />
            </Card>

            {/* Rebalance / order entry panel */}
            <Card title="Rebalance Pool (Order Entry)">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="font-medium pb-2 pr-3">Asset</th>
                      <th className="font-medium pb-2 pr-3 text-right">Allocation %</th>
                      <th className="font-medium pb-2 text-right">APY %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.asset_class} className="border-t border-stone-100">
                        <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">{a.name}</td>
                        <td className="py-2 pr-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={allocDraft[a.asset_class]?.allocation_pct ?? a.allocation_pct}
                            onChange={(e) => updateAlloc(a.asset_class, "allocation_pct", e.target.value)}
                            className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={allocDraft[a.asset_class]?.apy_pct ?? a.apy_pct}
                            onChange={(e) => updateAlloc(a.asset_class, "apy_pct", e.target.value)}
                            className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                <p className={`text-sm font-medium ${totalAllocPct === 100 ? "text-emerald-600" : "text-red-500"}`}>
                  Total: {totalAllocPct}% {totalAllocPct === 100 ? "✓" : "✗ must equal 100%"}
                </p>
                <button
                  type="button"
                  onClick={handleRebalanceSubmit}
                  disabled={allocSaving || totalAllocPct !== 100}
                  className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {allocSaving ? "Submitting..." : "Submit Rebalance"}
                </button>
              </div>
              {allocError && <p className="text-xs text-red-500 mt-2">{allocError}</p>}
              {allocSuccess && <p className="text-xs text-emerald-600 mt-2">{allocSuccess}</p>}

              {/* Rebalance log */}
              <div className="mt-5 pt-4 border-t border-stone-100">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                  Recent Rebalances
                </p>
                {rebalanceLog.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-stone-400">
                          <th className="font-medium pb-2 pr-3">Date</th>
                          <th className="font-medium pb-2 pr-3">Asset</th>
                          <th className="font-medium pb-2 pr-3 text-right">Allocation</th>
                          <th className="font-medium pb-2 pr-3 text-right">APY</th>
                          <th className="font-medium pb-2">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rebalanceLog.map((e, i) => (
                          <tr key={i} className="border-t border-stone-100">
                            <td className="py-2 pr-3 text-stone-400 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                            <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">
                              {assetNameByClass[e.asset_class] ?? e.asset_class}
                            </td>
                            <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                              {formatPct(e.old_allocation_pct)} → {formatPct(e.new_allocation_pct)}
                            </td>
                            <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">
                              {formatPct(e.old_apy_pct)} → {formatPct(e.new_apy_pct)}
                            </td>
                            <td className="py-2 text-stone-500 whitespace-nowrap">{e.changed_by_name ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-stone-400 text-sm">No rebalances yet.</p>
                )}
              </div>
            </Card>

            {/* Alert feed */}
            <Card title="Alerts">
              {alerts.length === 0 ? (
                <p className="text-sm text-emerald-600">✓ All clear — no active alerts.</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className={`rounded-xl border px-3 py-2 ${ALERT_STYLES[a.severity] ?? ALERT_STYLES.info}`}>
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-xs mt-0.5">{a.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Reporting */}
            <Card title="Reporting">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="Sharpe Ratio" value={risk.sharpe_ratio.toFixed(2)} />
                <StatCard label="Max Drawdown" value={`-${formatPct(risk.max_drawdown_pct)}`} />
                <StatCard label="Volatility" value={formatPct(risk.volatility_pct)} />
                <StatCard label="Current Yield" value={formatPct(overview.customer_apy_pct)} />
                <StatCard label="Target Yield" value={formatPct(config.target_apy_pct)} />
                <StatCard label="All-Time High AUM" value={formatSats(risk.all_time_high_sats)} />
              </div>

              <div className="pt-3 border-t border-stone-100">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-3">
                  Pool Config
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-stone-400">Bank fee (% of pool yield)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={configDraft.bank_fee_pct}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({ ...prev, bank_fee_pct: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-28 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-stone-400">Target customer APY (%)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={configDraft.target_apy_pct}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({ ...prev, target_apy_pct: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-28 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleConfigSubmit}
                    disabled={configSaving}
                    className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {configSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                {configError && <p className="text-xs text-red-500 mt-2">{configError}</p>}
                {configSuccess && <p className="text-xs text-emerald-600 mt-2">{configSuccess}</p>}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
