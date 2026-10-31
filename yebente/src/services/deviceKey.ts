// This phone's device key: an ECDSA P-256 key pair made by the browser with the
// private half marked non-extractable, so no script (ours or anyone's) can read it
// out or copy it to another device. It is kept in IndexedDB and only ever used to
// sign the server's one-time unlock challenges. The server keeps the public half.
// If the browser clears site data, the key is gone: the app then shows "Log in".
const DB = 'yebente';
const STORE = 'keys';
const ID = 'device';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const b64u = (buf: ArrayBuffer) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function stored(): Promise<CryptoKeyPair | undefined> {
  try { return await tx<CryptoKeyPair | undefined>('readonly', (s) => s.get(ID)); } catch { return undefined; }
}

// The key pair, made on first use. Asks the browser to keep this site's storage
// (Safari otherwise clears it after a week without visits).
export async function ensureDeviceKey(): Promise<CryptoKeyPair> {
  const have = await stored();
  if (have) return have;
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  await tx('readwrite', (s) => s.put(pair, ID));
  return pair;
}

export const hasDeviceKey = async () => Boolean(await stored());

// The public half, as the server stores it (SPKI, base64url).
export async function devicePublicKey(): Promise<string> {
  const pair = await ensureDeviceKey();
  return b64u(await crypto.subtle.exportKey('spki', pair.publicKey));
}

// Signs one unlock challenge (raw r||s, which the server checks as IEEE P1363).
export async function signWithDevice(message: string): Promise<string> {
  const pair = await stored();
  if (!pair) throw new Error("This phone's key is gone. Log in again.");
  return b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message)));
}

export async function forgetDeviceKey() {
  try { await tx('readwrite', (s) => s.delete(ID)); } catch { /* nothing stored */ }
}
