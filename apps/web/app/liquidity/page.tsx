"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import LineChart from "@/components/LineChart";
import Gauge from "@/components/Gauge";
import Heatmap from "@/components/Heatmap";
import NetworkGraph from "@/components/NetworkGraph";

type NodeStatus = {
  alias: string;
  pubkey: string;
  block_height: number;
  synced_to_chain: boolean;
  version: string;
  num_peers: number;
  num_active_channels: number;
  uptime_seconds: number;
};

type Channel = {
  channel_id: string;
  peer_alias: string;
  peer_pubkey: string;
  capacity_sats: number;
  local_balance_sats: number;
  remote_balance_sats: number;
  local_ratio_pct: number;
  fee_rate_ppm: number;
  base_fee_msat: number;
  status: string;
  health: string;
};

type ChannelsResponse = {
  channels: Channel[];
  total_local_sats: number;
  total_remote_sats: number;
  total_capacity_sats: number;
};

type Peer = {
  pubkey: string;
  alias: string;
  address: string;
  connected: boolean;
};

type OnchainTx = {
  direction: string;
  amount_sats: number;
  txid: string;
  confirmations: number;
  created_at: string;
};

type OnchainInfo = {
  confirmed_sats: number;
  unconfirmed_sats: number;
  transactions: OnchainTx[];
};

type RoutingFeePoint = {
  date: string;
  fee_sats: number;
};

type MpesaQueueEntry = {
  id: string;
  user_name: string;
  amount_sats: number;
  amount_kes: number;
  created_at: string;
};

type MpesaQueues = {
  deposits: MpesaQueueEntry[];
  withdrawals: MpesaQueueEntry[];
};

type Overview = {
  total_local_sats: number;
  total_remote_sats: number;
  total_capacity_sats: number;
  onchain_confirmed_sats: number;
  onchain_unconfirmed_sats: number;
  pending_mpesa_deposit_sats: number;
  pending_mpesa_withdraw_sats: number;
  routing_fees_today_sats: number;
  routing_fees_30d_sats: number;
};

type Alert = {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

type Config = {
  hot_wallet_min_sats: number;
  auto_open_channel_threshold_sats: number;
  mpesa_float_balance_kes: number;
  mpesa_float_low_threshold_kes: number;
  mpesa_float_high_threshold_kes: number;
};

type ActionLogEntry = {
  action_type: string;
  channel_id: string | null;
  detail: string;
  performed_by_name: string | null;
  created_at: string;
};

type FeeDraft = { fee_rate_ppm: number; base_fee_msat: number };

const ALERT_STYLES: Record<string, string> = {
  info: "border-stone-200 bg-stone-50 text-stone-600",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

const HEALTH_COLORS: Record<string, string> = {
  balanced: "bg-emerald-300",
  needs_rebalance: "bg-amber-300",
  zombie: "bg-red-300",
};

const HEALTH_LABELS: Record<string, string> = {
  balanced: "Balanced",
  needs_rebalance: "Needs rebalance",
  zombie: "Zombie",
};

const DEFAULT_CONFIG: Config = {
  hot_wallet_min_sats: 0,
  auto_open_channel_threshold_sats: 0,
  mpesa_float_balance_kes: 0,
  mpesa_float_low_threshold_kes: 0,
  mpesa_float_high_threshold_kes: 0,
};

function formatSats(n: number) {
  return `${n.toLocaleString("en-US")} sats`;
}

function formatPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function truncateTxid(txid: string) {
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
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

export default function LiquidityPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null);
  const [channelsData, setChannelsData] = useState<ChannelsResponse | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [onchain, setOnchain] = useState<OnchainInfo | null>(null);
  const [routingFees, setRoutingFees] = useState<RoutingFeePoint[]>([]);
  const [mpesaQueues, setMpesaQueues] = useState<MpesaQueues | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Channel fee edit / close
  const [feeDrafts, setFeeDrafts] = useState<Record<string, FeeDraft>>({});
  const [feeSavingId, setFeeSavingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelSuccess, setChannelSuccess] = useState<string | null>(null);

  // Open channel
  const [openAlias, setOpenAlias] = useState("");
  const [openCapacity, setOpenCapacity] = useState("");
  const [openSaving, setOpenSaving] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openSuccess, setOpenSuccess] = useState<string | null>(null);

  // Rebalance
  const [rebalFrom, setRebalFrom] = useState("");
  const [rebalTo, setRebalTo] = useState("");
  const [rebalAmount, setRebalAmount] = useState("");
  const [rebalSaving, setRebalSaving] = useState(false);
  const [rebalError, setRebalError] = useState<string | null>(null);
  const [rebalSuccess, setRebalSuccess] = useState<string | null>(null);

  // On-chain <-> Lightning swap
  const [swapDirection, setSwapDirection] = useState("onchain_to_lightning");
  const [swapChannel, setSwapChannel] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  // M-Pesa float replenish/sweep
  const [replenishAmount, setReplenishAmount] = useState("");
  const [replenishSaving, setReplenishSaving] = useState(false);
  const [replenishError, setReplenishError] = useState<string | null>(null);
  const [replenishSuccess, setReplenishSuccess] = useState<string | null>(null);

  const [sweepAmount, setSweepAmount] = useState("");
  const [sweepSaving, setSweepSaving] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [sweepSuccess, setSweepSuccess] = useState<string | null>(null);

  // Liquidity config
  const [configDraft, setConfigDraft] = useState<Config>(DEFAULT_CONFIG);
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

  const loadAll = async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    try {
      const [
        overviewRes,
        nodeStatusRes,
        channelsRes,
        peersRes,
        onchainRes,
        routingFeesRes,
        mpesaQueuesRes,
        alertsRes,
        configRes,
        actionLogRes,
      ] = await Promise.all([
        apiFetch("/admin/liquidity/overview"),
        apiFetch("/admin/liquidity/node-status"),
        apiFetch("/admin/liquidity/channels"),
        apiFetch("/admin/liquidity/peers"),
        apiFetch("/admin/liquidity/onchain"),
        apiFetch("/admin/liquidity/routing-fees?days=30"),
        apiFetch("/admin/liquidity/mpesa-queues"),
        apiFetch("/admin/liquidity/alerts"),
        apiFetch("/admin/liquidity/config"),
        apiFetch("/admin/liquidity/action-log?limit=20"),
      ]);
      if (
        !overviewRes.ok ||
        !nodeStatusRes.ok ||
        !channelsRes.ok ||
        !peersRes.ok ||
        !onchainRes.ok ||
        !routingFeesRes.ok ||
        !mpesaQueuesRes.ok ||
        !alertsRes.ok ||
        !configRes.ok ||
        !actionLogRes.ok
      ) {
        throw new Error("Failed to load liquidity dashboard");
      }

      setOverview(await overviewRes.json());
      setNodeStatus(await nodeStatusRes.json());

      const channels: ChannelsResponse = await channelsRes.json();
      setChannelsData(channels);
      setFeeDrafts(
        Object.fromEntries(
          channels.channels.map((c) => [c.channel_id, { fee_rate_ppm: c.fee_rate_ppm, base_fee_msat: c.base_fee_msat }])
        )
      );

      setPeers((await peersRes.json()).peers ?? []);
      setOnchain(await onchainRes.json());
      setRoutingFees((await routingFeesRes.json()).history ?? []);
      setMpesaQueues(await mpesaQueuesRes.json());
      setAlerts((await alertsRes.json()).alerts ?? []);

      const cfg: Config = await configRes.json();
      setConfig(cfg);
      setConfigDraft(cfg);

      setActionLog((await actionLogRes.json()).entries ?? []);
    } catch (err) {
      if (showLoading) {
        setError("Could not load liquidity dashboard.");
        console.error(err);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchData = () => loadAll(true);
  const refreshAll = () => loadAll(false);

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

  const updateFeeDraft = (channelId: string, field: keyof FeeDraft, value: string) => {
    const num = parseInt(value, 10);
    setFeeDrafts((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], [field]: isNaN(num) ? 0 : num },
    }));
  };

  const handleUpdateFee = async (channelId: string) => {
    const draft = feeDrafts[channelId];
    if (!draft) return;
    setFeeSavingId(channelId);
    setChannelError(null);
    setChannelSuccess(null);
    try {
      const res = await apiFetch(`/admin/liquidity/channels/${channelId}/fee`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update fee");
      setChannelSuccess("Fee policy updated.");
      await refreshAll();
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Failed to update fee");
    } finally {
      setFeeSavingId(null);
    }
  };

  const handleCloseChannel = async (channelId: string) => {
    setClosingId(channelId);
    setChannelError(null);
    setChannelSuccess(null);
    try {
      const res = await apiFetch(`/admin/liquidity/channels/${channelId}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to close channel");
      setChannelSuccess("Channel closed.");
      await refreshAll();
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Failed to close channel");
    } finally {
      setClosingId(null);
    }
  };

  const handleOpenChannel = async () => {
    setOpenSaving(true);
    setOpenError(null);
    setOpenSuccess(null);
    try {
      const capacity = parseInt(openCapacity, 10);
      if (!openAlias.trim() || isNaN(capacity) || capacity <= 0) {
        throw new Error("Peer alias and a positive capacity are required");
      }
      const res = await apiFetch("/admin/liquidity/channels/open", {
        method: "POST",
        body: JSON.stringify({ peer_alias: openAlias.trim(), capacity_sats: capacity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open channel");
      setOpenSuccess("Channel opened.");
      setOpenAlias("");
      setOpenCapacity("");
      await refreshAll();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open channel");
    } finally {
      setOpenSaving(false);
    }
  };

  const handleRebalance = async () => {
    setRebalSaving(true);
    setRebalError(null);
    setRebalSuccess(null);
    try {
      const amount = parseInt(rebalAmount, 10);
      if (!rebalFrom || !rebalTo || isNaN(amount) || amount <= 0) {
        throw new Error("From channel, to channel, and a positive amount are required");
      }
      const res = await apiFetch("/admin/liquidity/rebalance", {
        method: "POST",
        body: JSON.stringify({ from_channel_id: rebalFrom, to_channel_id: rebalTo, amount_sats: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rebalance");
      setRebalSuccess("Channels rebalanced.");
      setRebalAmount("");
      await refreshAll();
    } catch (err) {
      setRebalError(err instanceof Error ? err.message : "Failed to rebalance");
    } finally {
      setRebalSaving(false);
    }
  };

  const handleSwap = async () => {
    setSwapSaving(true);
    setSwapError(null);
    setSwapSuccess(null);
    try {
      const amount = parseInt(swapAmount, 10);
      if (!swapChannel || isNaN(amount) || amount <= 0) {
        throw new Error("Channel and a positive amount are required");
      }
      const res = await apiFetch("/admin/liquidity/swap", {
        method: "POST",
        body: JSON.stringify({ direction: swapDirection, channel_id: swapChannel, amount_sats: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to execute swap");
      setSwapSuccess("Swap executed.");
      setSwapAmount("");
      await refreshAll();
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : "Failed to execute swap");
    } finally {
      setSwapSaving(false);
    }
  };

  const handleReplenish = async () => {
    setReplenishSaving(true);
    setReplenishError(null);
    setReplenishSuccess(null);
    try {
      const amount = parseFloat(replenishAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("A positive KES amount is required");
      const res = await apiFetch("/admin/liquidity/mpesa-float/replenish", {
        method: "POST",
        body: JSON.stringify({ amount_kes: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to replenish float");
      setReplenishSuccess("Float replenished.");
      setReplenishAmount("");
      await refreshAll();
    } catch (err) {
      setReplenishError(err instanceof Error ? err.message : "Failed to replenish float");
    } finally {
      setReplenishSaving(false);
    }
  };

  const handleSweep = async () => {
    setSweepSaving(true);
    setSweepError(null);
    setSweepSuccess(null);
    try {
      const amount = parseFloat(sweepAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("A positive KES amount is required");
      const res = await apiFetch("/admin/liquidity/mpesa-float/sweep", {
        method: "POST",
        body: JSON.stringify({ amount_kes: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sweep float");
      setSweepSuccess("Float swept.");
      setSweepAmount("");
      await refreshAll();
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : "Failed to sweep float");
    } finally {
      setSweepSaving(false);
    }
  };

  const handleConfigSubmit = async () => {
    setConfigSaving(true);
    setConfigError(null);
    setConfigSuccess(null);
    try {
      const res = await apiFetch("/admin/liquidity/config", {
        method: "PUT",
        body: JSON.stringify(configDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update config");
      setConfig(data);
      setConfigDraft(data);
      setConfigSuccess("Config updated.");
      await refreshAll();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to update config");
    } finally {
      setConfigSaving(false);
    }
  };

  const routingFeePoints = routingFees.map((p) => ({ label: formatDate(p.date), value: p.fee_sats }));
  const activeChannels = channelsData?.channels.filter((c) => c.status === "active") ?? [];

  const heatmapRows =
    channelsData && channelsData.channels.length > 0
      ? [
          {
            label: "Channels",
            cells: channelsData.channels.map((c) => ({
              label: c.peer_alias,
              value: c.local_ratio_pct,
              display: `${Math.round(c.local_ratio_pct)}%`,
              colorClass: HEALTH_COLORS[c.health] ?? "bg-stone-100",
            })),
          },
        ]
      : [];

  return (
    <main className="min-h-screen bg-stone-50 pb-12">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="pt-10 pb-6">
          <h1 className="text-2xl font-semibold text-stone-800">Liquidity · Node Operations</h1>
          <p className="text-sm text-stone-400 mt-1">
            Monitor node health, channel liquidity, on-chain reserves, and M-Pesa settlement
          </p>
        </div>

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : error || !nodeStatus || !channelsData || !overview || !onchain || !mpesaQueues || !config ? (
          <p className="text-red-500 text-sm">{error ?? "Could not load liquidity dashboard."}</p>
        ) : (
          <>
            {/* Node Health */}
            <Card title="Node Health">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Alias" value={nodeStatus.alias} />
                <StatCard label="Block Height" value={nodeStatus.block_height.toLocaleString("en-US")} />
                <StatCard label="Synced" value={nodeStatus.synced_to_chain ? "✓ Synced" : "⚠ Syncing"} />
                <StatCard label="Version" value={nodeStatus.version} />
                <StatCard label="Connected Peers" value={String(nodeStatus.num_peers)} />
                <StatCard label="Active Channels" value={String(nodeStatus.num_active_channels)} />
                <StatCard label="Uptime" value={formatUptime(nodeStatus.uptime_seconds)} />
              </div>
            </Card>

            {/* Overview KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <StatCard label="Total Lightning Balance" value={formatSats(overview.total_local_sats + overview.total_remote_sats)} />
              <StatCard label="On-Chain Balance" value={formatSats(overview.onchain_confirmed_sats)} />
              <StatCard label="Pending M-Pesa Deposits" value={formatSats(overview.pending_mpesa_deposit_sats)} />
              <StatCard label="Pending M-Pesa Withdrawals" value={formatSats(overview.pending_mpesa_withdraw_sats)} />
              <StatCard label="Routing Fees Today" value={formatSats(overview.routing_fees_today_sats)} />
              <StatCard label="Routing Fees (30d)" value={formatSats(overview.routing_fees_30d_sats)} />
            </div>

            {/* Gauges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">Channel Liquidity</p>
                <Gauge
                  value={channelsData.total_local_sats}
                  max={channelsData.total_capacity_sats}
                  target={channelsData.total_capacity_sats / 2}
                  label="Local balance vs capacity"
                  valueLabel={formatSats(channelsData.total_local_sats)}
                />
              </div>
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-1">Hot Wallet Availability</p>
                <Gauge
                  value={channelsData.total_local_sats}
                  max={config.hot_wallet_min_sats * 2}
                  target={config.hot_wallet_min_sats}
                  label={`vs minimum ${formatSats(config.hot_wallet_min_sats)}`}
                  valueLabel={formatSats(channelsData.total_local_sats)}
                  colorClass={
                    channelsData.total_local_sats >= config.hot_wallet_min_sats ? "stroke-emerald-500" : "stroke-red-500"
                  }
                />
              </div>
            </div>

            {/* Routing fee revenue */}
            <Card title="Routing Fee Revenue (30d, sats)">
              <LineChart points={routingFeePoints} />
            </Card>

            {/* Channel health */}
            <Card title="Channel Health">
              <Heatmap rows={heatmapRows} />
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="font-medium pb-2 pr-3">Peer</th>
                      <th className="font-medium pb-2 pr-3 text-right">Capacity</th>
                      <th className="font-medium pb-2 pr-3 text-right">Local</th>
                      <th className="font-medium pb-2 pr-3 text-right">Remote</th>
                      <th className="font-medium pb-2 pr-3 text-right">Local %</th>
                      <th className="font-medium pb-2 pr-3">Status</th>
                      <th className="font-medium pb-2 pr-3">Fee ppm</th>
                      <th className="font-medium pb-2 pr-3">Base fee (msat)</th>
                      <th className="font-medium pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelsData.channels.map((c) => (
                      <tr key={c.channel_id} className="border-t border-stone-100">
                        <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">
                          {c.peer_alias}
                          <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] ${HEALTH_COLORS[c.health] ?? "bg-stone-100"}`}>
                            {HEALTH_LABELS[c.health] ?? c.health}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatSats(c.capacity_sats)}</td>
                        <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatSats(c.local_balance_sats)}</td>
                        <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatSats(c.remote_balance_sats)}</td>
                        <td className="py-2 pr-3 text-right text-stone-700">{formatPct(c.local_ratio_pct)}</td>
                        <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">{c.status}</td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min="0"
                            value={feeDrafts[c.channel_id]?.fee_rate_ppm ?? c.fee_rate_ppm}
                            onChange={(e) => updateFeeDraft(c.channel_id, "fee_rate_ppm", e.target.value)}
                            className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min="0"
                            value={feeDrafts[c.channel_id]?.base_fee_msat ?? c.base_fee_msat}
                            onChange={(e) => updateFeeDraft(c.channel_id, "base_fee_msat", e.target.value)}
                            className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleUpdateFee(c.channel_id)}
                            disabled={feeSavingId === c.channel_id}
                            className="bg-indigo-600 text-white text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 mr-1"
                          >
                            {feeSavingId === c.channel_id ? "Saving..." : "Update fee"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCloseChannel(c.channel_id)}
                            disabled={closingId === c.channel_id}
                            className="bg-red-50 text-red-600 text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            {closingId === c.channel_id ? "Closing..." : "Close"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {channelError && <p className="text-xs text-red-500 mt-2">{channelError}</p>}
              {channelSuccess && <p className="text-xs text-emerald-600 mt-2">{channelSuccess}</p>}
            </Card>

            {/* Network topology */}
            <Card title="Network Topology">
              <NetworkGraph
                centerLabel={nodeStatus.alias}
                peers={peers.map((p) => ({ label: p.alias, connected: p.connected }))}
              />
            </Card>

            {/* Channel management */}
            <Card title="Open Channel">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Peer alias</span>
                  <input
                    type="text"
                    value={openAlias}
                    onChange={(e) => setOpenAlias(e.target.value)}
                    className="w-44 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Capacity (sats)</span>
                  <input
                    type="number"
                    min="0"
                    value={openCapacity}
                    onChange={(e) => setOpenCapacity(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleOpenChannel}
                  disabled={openSaving}
                  className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {openSaving ? "Opening..." : "Open Channel"}
                </button>
              </div>
              {openError && <p className="text-xs text-red-500 mt-2">{openError}</p>}
              {openSuccess && <p className="text-xs text-emerald-600 mt-2">{openSuccess}</p>}
            </Card>

            <Card title="Rebalance Channels">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">From</span>
                  <select
                    value={rebalFrom}
                    onChange={(e) => setRebalFrom(e.target.value)}
                    className="w-40 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Select channel</option>
                    {activeChannels.map((c) => (
                      <option key={c.channel_id} value={c.channel_id}>
                        {c.peer_alias}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">To</span>
                  <select
                    value={rebalTo}
                    onChange={(e) => setRebalTo(e.target.value)}
                    className="w-40 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Select channel</option>
                    {activeChannels.map((c) => (
                      <option key={c.channel_id} value={c.channel_id}>
                        {c.peer_alias}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Amount (sats)</span>
                  <input
                    type="number"
                    min="0"
                    value={rebalAmount}
                    onChange={(e) => setRebalAmount(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRebalance}
                  disabled={rebalSaving}
                  className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {rebalSaving ? "Rebalancing..." : "Rebalance"}
                </button>
              </div>
              {rebalError && <p className="text-xs text-red-500 mt-2">{rebalError}</p>}
              {rebalSuccess && <p className="text-xs text-emerald-600 mt-2">{rebalSuccess}</p>}
            </Card>

            {/* Action log */}
            <Card title="Action Log">
              {actionLog.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone-400">
                        <th className="font-medium pb-2 pr-3">Date</th>
                        <th className="font-medium pb-2 pr-3">Action</th>
                        <th className="font-medium pb-2 pr-3">Channel</th>
                        <th className="font-medium pb-2 pr-3">Detail</th>
                        <th className="font-medium pb-2">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionLog.map((e, i) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="py-2 pr-3 text-stone-400 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                          <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">{e.action_type}</td>
                          <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">{e.channel_id ?? "—"}</td>
                          <td className="py-2 pr-3 text-stone-700">{e.detail}</td>
                          <td className="py-2 text-stone-500 whitespace-nowrap">{e.performed_by_name ?? "Automated"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-stone-400 text-sm">No actions recorded yet.</p>
              )}
            </Card>

            {/* On-chain reserves */}
            <Card title="On-Chain Reserves">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard label="Confirmed" value={formatSats(onchain.confirmed_sats)} />
                <StatCard label="Unconfirmed" value={formatSats(onchain.unconfirmed_sats)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="font-medium pb-2 pr-3">Date</th>
                      <th className="font-medium pb-2 pr-3">Direction</th>
                      <th className="font-medium pb-2 pr-3 text-right">Amount</th>
                      <th className="font-medium pb-2 pr-3">Txid</th>
                      <th className="font-medium pb-2 text-right">Confirmations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onchain.transactions.map((tx, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td className="py-2 pr-3 text-stone-400 whitespace-nowrap">{formatDateTime(tx.created_at)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className={tx.direction === "in" ? "text-emerald-600" : "text-red-500"}>
                            {tx.direction === "in" ? "Deposit" : "Withdrawal"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatSats(tx.amount_sats)}</td>
                        <td className="py-2 pr-3 text-stone-500 whitespace-nowrap font-mono">{truncateTxid(tx.txid)}</td>
                        <td className="py-2 text-right text-stone-700">{tx.confirmations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="On-Chain ↔ Lightning Swap">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Direction</span>
                  <select
                    value={swapDirection}
                    onChange={(e) => setSwapDirection(e.target.value)}
                    className="w-52 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="onchain_to_lightning">On-chain → Lightning</option>
                    <option value="lightning_to_onchain">Lightning → On-chain</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Channel</span>
                  <select
                    value={swapChannel}
                    onChange={(e) => setSwapChannel(e.target.value)}
                    className="w-40 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Select channel</option>
                    {activeChannels.map((c) => (
                      <option key={c.channel_id} value={c.channel_id}>
                        {c.peer_alias}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Amount (sats)</span>
                  <input
                    type="number"
                    min="0"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={swapSaving}
                  className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {swapSaving ? "Swapping..." : "Swap"}
                </button>
              </div>
              {swapError && <p className="text-xs text-red-500 mt-2">{swapError}</p>}
              {swapSuccess && <p className="text-xs text-emerald-600 mt-2">{swapSuccess}</p>}
            </Card>

            {/* M-Pesa gateway & float */}
            <Card title="M-Pesa Deposit Queue (pending → sats)">
              {mpesaQueues.deposits.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone-400">
                        <th className="font-medium pb-2 pr-3">Date</th>
                        <th className="font-medium pb-2 pr-3">User</th>
                        <th className="font-medium pb-2 pr-3 text-right">Amount (KES)</th>
                        <th className="font-medium pb-2 text-right">Amount (sats)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mpesaQueues.deposits.map((e) => (
                        <tr key={e.id} className="border-t border-stone-100">
                          <td className="py-2 pr-3 text-stone-400 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                          <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">{e.user_name}</td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatKES(e.amount_kes)}</td>
                          <td className="py-2 text-right text-stone-700 whitespace-nowrap">{formatSats(e.amount_sats)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-stone-400 text-sm">No pending M-Pesa deposits.</p>
              )}
            </Card>

            <Card title="M-Pesa Withdrawal Queue (sats → pending)">
              {mpesaQueues.withdrawals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone-400">
                        <th className="font-medium pb-2 pr-3">Date</th>
                        <th className="font-medium pb-2 pr-3">User</th>
                        <th className="font-medium pb-2 pr-3 text-right">Amount (KES)</th>
                        <th className="font-medium pb-2 text-right">Amount (sats)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mpesaQueues.withdrawals.map((e) => (
                        <tr key={e.id} className="border-t border-stone-100">
                          <td className="py-2 pr-3 text-stone-400 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                          <td className="py-2 pr-3 text-stone-700 whitespace-nowrap">{e.user_name}</td>
                          <td className="py-2 pr-3 text-right text-stone-700 whitespace-nowrap">{formatKES(e.amount_kes)}</td>
                          <td className="py-2 text-right text-stone-700 whitespace-nowrap">{formatSats(e.amount_sats)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-stone-400 text-sm">No pending M-Pesa withdrawals.</p>
              )}
            </Card>

            <Card title="M-Pesa Float">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="Float Balance" value={formatKES(config.mpesa_float_balance_kes)} />
                <StatCard label="Low Threshold" value={formatKES(config.mpesa_float_low_threshold_kes)} />
                <StatCard label="High Threshold" value={formatKES(config.mpesa_float_high_threshold_kes)} />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Replenish (KES)</span>
                  <input
                    type="number"
                    min="0"
                    value={replenishAmount}
                    onChange={(e) => setReplenishAmount(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleReplenish}
                  disabled={replenishSaving}
                  className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {replenishSaving ? "Replenishing..." : "Replenish"}
                </button>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Sweep (KES)</span>
                  <input
                    type="number"
                    min="0"
                    value={sweepAmount}
                    onChange={(e) => setSweepAmount(e.target.value)}
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSweep}
                  disabled={sweepSaving}
                  className="bg-stone-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {sweepSaving ? "Sweeping..." : "Sweep"}
                </button>
              </div>
              {replenishError && <p className="text-xs text-red-500 mt-2">{replenishError}</p>}
              {replenishSuccess && <p className="text-xs text-emerald-600 mt-2">{replenishSuccess}</p>}
              {sweepError && <p className="text-xs text-red-500 mt-2">{sweepError}</p>}
              {sweepSuccess && <p className="text-xs text-emerald-600 mt-2">{sweepSuccess}</p>}
            </Card>

            <Card title="Liquidity Config">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Hot wallet min (sats)</span>
                  <input
                    type="number"
                    min="0"
                    value={configDraft.hot_wallet_min_sats}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, hot_wallet_min_sats: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Auto-open threshold (sats)</span>
                  <input
                    type="number"
                    min="0"
                    value={configDraft.auto_open_channel_threshold_sats}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        auto_open_channel_threshold_sats: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Float low threshold (KES)</span>
                  <input
                    type="number"
                    min="0"
                    value={configDraft.mpesa_float_low_threshold_kes}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        mpesa_float_low_threshold_kes: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400">Float high threshold (KES)</span>
                  <input
                    type="number"
                    min="0"
                    value={configDraft.mpesa_float_high_threshold_kes}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        mpesa_float_high_threshold_kes: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-32 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
            </Card>

            {/* Alerts */}
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
          </>
        )}
      </div>
    </main>
  );
}
