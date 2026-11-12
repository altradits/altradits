// Which wallet controls are shown: one source of truth, computed on the
// server (GET /api/yebente/health -> features) from the same switches that
// gate the endpoints. A control is shown only when its feature can complete
// for a real user right now. Nothing is deleted: a hidden feature reappears
// by configuration alone, without rebuilding the app.
//
// Only erasable TypeScript here (interfaces and annotations, no enums), so
// the repo's plain node:test suite can import this file directly.
export interface FeatureFlags {
  buy: boolean;
  cardTopup: boolean;
  sendMobile: boolean;
  receive: boolean;
  send: boolean;
  external: boolean;
  // Set up but waiting on the node: shown greyed out until it answers again.
  paused?: WalletAction[];
}

// When the health call fails: the core (Receive, Send), nothing else.
export const CORE_FEATURES: FeatureFlags = {
  buy: false,
  cardTopup: false,
  sendMobile: false,
  receive: true,
  send: true,
  external: false,
};

export type WalletAction = 'buy' | 'sendMobile' | 'receive' | 'send' | 'cardTopup';

// The tiles, in display order. Only an explicit true enables a control:
// anything missing, false or misshapen stays hidden.
const ORDER: WalletAction[] = ['buy', 'sendMobile', 'receive', 'send', 'cardTopup'];

export function visibleActions(features: Partial<FeatureFlags> | null | undefined): WalletAction[] {
  const f = (features || {}) as Record<string, unknown>;
  return ORDER.filter((a) => f[a] === true);
}

// Reads the server's features once. Any failure (offline, an error page, an
// answer without features) shows the core.
// The tiles shown greyed out: paused, and not already working.
export function pausedActions(features: Partial<FeatureFlags> | null | undefined): WalletAction[] {
  const p = Array.isArray(features?.paused) ? features!.paused : [];
  const on = visibleActions(features);
  return ORDER.filter((a) => p.includes(a) && !on.includes(a));
}

export async function fetchFeatures(): Promise<FeatureFlags> {
  try {
    const res = await fetch('/api/yebente/health');
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const f = data.features as Record<string, unknown> | undefined;
    if (!f || typeof f !== 'object') return { ...CORE_FEATURES };
    return {
      buy: f.buy === true,
      cardTopup: f.cardTopup === true,
      sendMobile: f.sendMobile === true,
      receive: f.receive === true,
      send: f.send === true,
      external: f.external === true,
      paused: ORDER.filter((a) => (data.paused as Record<string, unknown> | undefined)?.[a] === true),
    };
  } catch {
    return { ...CORE_FEATURES };
  }
}
