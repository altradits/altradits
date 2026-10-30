import { api } from './altraditsWallet';

// Fingerprint / face approval with a passkey (WebAuthn) kept on this phone. The
// phone checks the finger or face and signs a one-time challenge; the server checks
// the signature. Nothing biometric leaves the phone. Turned on with the PIN.
const KEY = 'altradits_yw_passkey'; // this phone's passkey id

const b64u = (buf: ArrayBuffer) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

interface Options { challenge: string; rpId: string; userId: string; userName: string; credentials: string[] }

export const biometricId = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const biometricOn = () => Boolean(biometricId());
export const forgetBiometric = () => {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
};

// A fingerprint or face reader built into this phone or laptop.
export async function biometricSupported(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enableBiometric(pin: string) {
  const o = await api<Options>('POST', 'passkey/options', {});
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: fromB64u(o.challenge),
      rp: { id: o.rpId, name: 'Ye₿ente' },
      user: { id: fromB64u(o.userId), name: o.userName, displayName: o.userName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      excludeCredentials: o.credentials.map((id) => ({ type: 'public-key' as const, id: fromB64u(id) })),
      attestation: 'none',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Fingerprint was not set up.');
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error("This phone's fingerprint key isn't supported.");
  await api('POST', 'passkey/add', {
    pin,
    id: cred.id,
    alg: res.getPublicKeyAlgorithm(),
    publicKey: b64u(spki),
    clientDataJSON: b64u(res.clientDataJSON),
  });
  try { localStorage.setItem(KEY, cred.id); } catch { /* private mode */ }
}

export async function disableBiometric(pin: string) {
  await api('POST', 'passkey/off', { pin });
  forgetBiometric();
}

// Asks for the fingerprint / face; returns the signed approval to send with the payment.
export async function approveWithBiometric() {
  const id = biometricId();
  if (!id) throw new Error('Fingerprint is not on for this phone.');
  const o = await api<Options>('POST', 'passkey/options', {});
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: fromB64u(o.challenge),
        rpId: o.rpId,
        allowCredentials: [{ type: 'public-key', id: fromB64u(id) }],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    cred = null;
  }
  if (!cred) throw new Error('Fingerprint not confirmed. Try again, or use the PIN.');
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    clientDataJSON: b64u(res.clientDataJSON),
    authenticatorData: b64u(res.authenticatorData),
    signature: b64u(res.signature),
  };
}
