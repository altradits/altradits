import { Transaction } from '../types';

import { devicePublicKey, signWithDevice, forgetDeviceKey } from './deviceKey';

// The Ye₿ente wallet kept by Altradits (custodial, on the Altradits node). The
// balance and history live on the server. This phone keeps:
//  - its device key (deviceKey.ts) and the id the server knows it by (localStorage):
//    the phone stays trusted after closing or locking the app;
//  - a short session (sessionStorage: 15 minutes of use, gone when the tab closes).
// Opening the app again ("unlocking") takes the PIN or fingerprint, signed by the
// device key. Nothing here ever deletes access because of an error: a refused
// session only locks the app.
const SESSION_KEY = 'yw_session';
const DEVICE_ID_KEY = 'yw_device';
const LEGACY_TOKEN_KEY = 'altradits_yw_token'; // apps from before device keys

const read = (store: Storage, k: string) => { try { return store.getItem(k); } catch { return null; } };
const write = (store: Storage, k: string, v: string | null) => { try { if (v) store.setItem(k, v); else store.removeItem(k); } catch { /* private mode */ } };
const session = () => read(sessionStorage, SESSION_KEY);
export const deviceId = () => read(localStorage, DEVICE_ID_KEY);
const legacyToken = () => read(localStorage, LEGACY_TOKEN_KEY);

// open: a session; locked: this phone is trusted (or has an old token) but needs the PIN; none: no wallet here.
export type Access = 'open' | 'locked' | 'none';
export const access = (): Access => (session() ? 'open' : deviceId() || legacyToken() ? 'locked' : 'none');
export const hasServerWallet = () => access() === 'open';
export const needsMove = () => !deviceId() && Boolean(legacyToken()); // an old token: one PIN moves it to a device key
// The bearer for requests: the session, else (only while moving) the old token.
export const getWalletToken = (): string | null => session() || legacyToken();

function opened(r: { session?: string; deviceId?: string; token?: string }) {
  if (r.session && r.deviceId) {
    write(sessionStorage, SESSION_KEY, r.session);
    write(localStorage, DEVICE_ID_KEY, r.deviceId);
    write(localStorage, LEGACY_TOKEN_KEY, null);
  } else if (r.token) write(localStorage, LEGACY_TOKEN_KEY, r.token);
  window.dispatchEvent(new Event('yebente:access'));
}
// Locked: the session goes, the phone stays trusted.
export function lockLocally() {
  write(sessionStorage, SESSION_KEY, null);
  window.dispatchEvent(new Event('yebente:access'));
}
// "Remove this phone": everything this phone kept about the wallet.
export async function forgetServerWallet() {
  write(sessionStorage, SESSION_KEY, null);
  write(localStorage, DEVICE_ID_KEY, null);
  write(localStorage, LEGACY_TOKEN_KEY, null);
  try { localStorage.removeItem('altradits_yw_passkey'); } catch { /* private mode */ }
  await forgetDeviceKey();
  window.dispatchEvent(new Event('yebente:access'));
}

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
  frozen?: boolean;
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

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = getWalletToken();
  const res = await fetch(`/api/yebente/wallet/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session()) lockLocally(); // the session ended: lock, never forget the wallet
  if (!res.ok || !data.success) throw new Error(data.error || 'Wallet service unavailable.');
  return data as T;
}

export async function createServerWallet(pin: string, handle: string, email = '') {
  const r = await api<{ wallet: ServerWallet; session?: string; deviceId?: string; token?: string; recovery: string }>('POST', 'create', { pin, handle, email: email || undefined, device: await devicePublicKey() });
  opened(r);
  return r;
}

// Lost phone, no email: the recovery words and a NEW PIN (a reset: 24-hour hold, other phones signed out).
export async function restoreServerWallet(recovery: string, pin: string) {
  const r = await api<{ wallet: ServerWallet; session?: string; deviceId?: string; token?: string }>('POST', 'restore', { recovery, pin, device: await devicePublicKey() });
  opened(r);
  return r;
}

// Back into a wallet on a phone it already trusts: PIN (or fingerprint) + the device key's signature.
export async function unlockServerWallet(secret: { pin: string } | { passkey: (challenge: string, rpId: string, credentials: string[]) => Promise<unknown> }) {
  const id = deviceId();
  if (!id) throw new Error('Log in on this phone first.');
  const o = await api<{ challenge: string; rpId: string; credentials: string[] }>('POST', 'unlock/options', { deviceId: id });
  const signature = await signWithDevice(`yebente-unlock:${id}:${o.challenge}`);
  const body = 'pin' in secret ? { pin: secret.pin } : { passkey: await secret.passkey(o.challenge, o.rpId, o.credentials) };
  const r = await api<{ wallet: ServerWallet; session: string }>('POST', 'unlock', { deviceId: id, signature, ...body });
  opened({ session: r.session, deviceId: id });
  return r;
}
// An app from before device keys: the PIN moves this phone to a device key.
export async function moveToDeviceKey(pin: string) {
  const r = await api<{ wallet: ServerWallet; session: string; deviceId: string }>('POST', 'device/register', { pin, device: await devicePublicKey() });
  opened(r);
  return r;
}

// A new phone: a one-time code by email first, then the PIN you already have (nothing is reset).
export const startLogin = (email: string) => api<{ message: string }>('POST', 'login/start', { email });
export async function finishLogin(email: string, code: string, pin: string) {
  const r = await api<{ wallet: ServerWallet; session: string; deviceId: string }>('POST', 'login/finish', { email, code, pin, device: await devicePublicKey() });
  opened(r);
  return r;
}

export async function lockServerWallet() {
  try { await api('POST', 'lock', {}); } catch { /* locked locally either way */ }
  lockLocally();
}

export interface SecurityInfo { devices: { id: string; at: string; lastSeen: string; current: boolean }[]; olderDevices: number; log: { at: string; kind: string; text: string }[] }
export const fetchSecurity = () => api<SecurityInfo & { success: boolean }>('GET', 'security');
export async function removeDevice(id: string, pin: string) {
  await api('POST', 'device/remove', { deviceId: id, pin });
  if (id === deviceId()) await forgetServerWallet();
}

export const fetchServerWallet = async () => {
  return (await api<{ wallet: ServerWallet }>('GET', 'me')).wallet;
};

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
  const r = await api<{ wallet: ServerWallet; session?: string; deviceId?: string; token?: string }>('POST', 'recover-email/finish', { token, pin, device: await devicePublicKey() });
  opened(r);
  return r;
}
