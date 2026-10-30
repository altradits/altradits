import { Transaction } from '../types';

// The Ye₿ente wallet kept by Altradits (custodial, on the Altradits node). The
// balance and history live on the server; this device only keeps its sign-in token.
const TOKEN_KEY = 'altradits_yw_token';

export interface ServerWallet {
  id: string;
  handle: string;
  address: string;
  balance: number;
  createdAt: string;
  limits: { maxBalance: number; maxPayment: number; dailySend: number };
  email?: string | null;
  emailPending?: string | null;
  holdUntil?: string | null;
  passkeys?: number;
}

export interface ServerEntry {
  id: string;
  kind: string;
  sats: number;
  fee?: number;
  counterparty?: string;
  status: 'completed' | 'pending' | 'failed';
  ref: string;
  note?: string;
  receiptUrl?: string;
  at: string;
}

export const getWalletToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setWalletToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};
export const hasServerWallet = () => Boolean(getWalletToken());
export const forgetServerWallet = () => {
  setWalletToken(null);
  try { localStorage.removeItem('altradits_yw_passkey'); } catch { /* private mode */ }
};

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = getWalletToken();
  const res = await fetch(`/api/yebente/wallet/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) setWalletToken(null);
  if (!res.ok || !data.success) throw new Error(data.error || 'Wallet service unavailable.');
  return data as T;
}

export async function createServerWallet(pin: string, handle: string, email = '') {
  const r = await api<{ wallet: ServerWallet; token: string; recovery: string }>('POST', 'create', { pin, handle, email: email || undefined });
  setWalletToken(r.token);
  return r;
}

export async function restoreServerWallet(recovery: string, pin: string) {
  const r = await api<{ wallet: ServerWallet; token: string }>('POST', 'restore', { recovery, pin });
  setWalletToken(r.token);
  return r;
}

export const fetchServerWallet = async () => (await api<{ wallet: ServerWallet }>('GET', 'me')).wallet;

export async function fetchServerHistory(): Promise<Transaction[]> {
  const { entries } = await api<{ entries: ServerEntry[] }>('GET', 'history');
  return entries.map(entryToTransaction);
}

// Approved with the PIN, or with the phone's fingerprint / face (a signed passkey approval).
export const sendFromServerWallet = (to: string, sats: number, pin: string, passkey?: unknown) =>
  api<{ wallet: ServerWallet; ref: string }>('POST', 'send', passkey ? { to, sats, passkey } : { to, sats, pin });

// A ledger entry in the shape the history list already shows.
function entryToTransaction(e: ServerEntry): Transaction {
  const incoming = e.sats > 0;
  return {
    id: e.id,
    type: incoming ? 'receive_btc' : 'send_btc',
    title: incoming ? 'Receive Lightning Sats' : 'Send Lightning Sats',
    timestamp: Date.parse(e.at),
    status: e.status,
    fromCurrency: 'SATS',
    fromAmount: Math.abs(e.sats),
    toCurrency: 'SATS',
    toAmount: Math.abs(e.sats),
    fee: e.fee || 0,
    feeCurrency: 'SATS',
    realFeeSats: e.fee || 0,
    recipient: e.counterparty,
    referenceNumber: e.ref,
    walletType: 'custodial',
    note: e.note,
    receiptUrl: e.receiptUrl,
  };
}

// ---- recovery by email
export const setRecoveryEmail = (email: string, pin: string) =>
  api<{ emailPending: string }>('POST', 'email', { email, pin });

export const requestEmailRecovery = (email: string) =>
  api<{ message: string }>('POST', 'recover-email', { email });

export async function finishEmailRecovery(token: string, pin: string) {
  const r = await api<{ wallet: ServerWallet; token: string }>('POST', 'recover-email/finish', { token, pin });
  setWalletToken(r.token);
  return r;
}
