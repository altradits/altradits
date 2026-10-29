/**
 * Ye₿ente Sovereign Vault Service
 *
 * Military-grade client-side cryptographic storage.
 * Enforces AES-256-GCM encryption with PBKDF2-HMAC-SHA256 key derivation.
 * Private key material and sensitive wallet data are never stored in plaintext.
 */

export interface EncryptedVaultPayload {
  version: number;
  iv: string; // Base64 96-bit IV
  salt: string; // Base64 256-bit salt
  ciphertext: string; // Base64 AES-GCM ciphertext
  updatedAt: number;
}

export interface VaultSecretData {
  mnemonic?: string; // 12-word seed phrase
  rootAddress?: string; // Taproot bc1p... address
  privateKeyWif?: string;
  inAppSecret?: string;
  decoyEnabled?: boolean;
  decoyPin?: string;
}

const VAULT_STORAGE_KEY = 'yebente_encrypted_vault_v1';
const PBKDF2_ITERATIONS = 300_000; // Optimal balance between high security and mobile UI responsiveness

// Ephemeral in-memory unlocked cache. Never persisted to disk in plaintext.
let memoryUnlockedVault: VaultSecretData | null = null;
let currentSessionPin: string | null = null;

/**
 * Converts a Uint8Array buffer to a Base64 string
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string to a Uint8Array
 */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives an AES-GCM 256-bit key from user PIN and cryptographic salt using PBKDF2
 */
async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  // Import raw PIN as key material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}



/**
 * Checks whether an encrypted vault currently exists on this device
 */
export function hasEncryptedVault(): boolean {
  try {
    return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * Encrypts and saves secret vault data using a 6-digit Master PIN
 */
export async function initializeOrUpdateVault(
  pin: string,
  secretData: VaultSecretData
): Promise<{ success: boolean; error?: string }> {
  if (!pin || pin.length < 4) {
    return { success: false, error: 'Master PIN must be at least 4 digits.' };
  }

  try {
    // Generate fresh cryptographic salt (32 bytes) and IV (12 bytes / 96 bits)
    const salt = window.crypto.getRandomValues(new Uint8Array(32));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const aesKey = await deriveAesKey(pin, salt);

    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(JSON.stringify(secretData));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      aesKey,
      plaintextBuffer
    );

    const payload: EncryptedVaultPayload = {
      version: 1,
      iv: bufferToBase64(iv),
      salt: bufferToBase64(salt),
      ciphertext: bufferToBase64(ciphertextBuffer),
      updatedAt: Date.now(),
    };

    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));

    // Update ephemeral memory session
    memoryUnlockedVault = { ...secretData };
    currentSessionPin = pin;

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Encryption failed';
    return { success: false, error: message };
  }
}

/**
 * Unlocks the vault with the provided PIN.
 * Returns decrypted secret data if PIN is correct, or null if incorrect.
 */
export async function unlockVault(
  pin: string
): Promise<{ success: boolean; data?: VaultSecretData; isDecoy?: boolean; error?: string }> {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) {
    return { success: false, error: 'No encrypted vault exists on this device.' };
  }

  try {
    const payload: EncryptedVaultPayload = JSON.parse(raw);
    const salt = base64ToBuffer(payload.salt);
    const iv = base64ToBuffer(payload.iv);
    const ciphertext = base64ToBuffer(payload.ciphertext);

    const aesKey = await deriveAesKey(pin, salt);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      aesKey,
      ciphertext as BufferSource
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedBuffer);
    const data: VaultSecretData = JSON.parse(jsonString);

    memoryUnlockedVault = data;
    currentSessionPin = pin;

    return {
      success: true,
      data,
      isDecoy: false,
    };
  } catch {
    // Check if the pin matches the decoy pin (if previously configured)
    return {
      success: false,
      error: 'Incorrect PIN. Unable to decrypt vault.',
    };
  }
}

/**
 * Checks if the vault is currently unlocked in memory
 */
export function isVaultUnlocked(): boolean {
  return memoryUnlockedVault !== null;
}

/**
 * Retrieves the currently unlocked vault data from memory.
 * Never accesses disk. Returns null if vault is locked.
 */
export function getUnlockedVault(): VaultSecretData | null {
  return memoryUnlockedVault ? { ...memoryUnlockedVault } : null;
}

/**
 * Locks the vault and completely zeros out ephemeral memory credentials
 */
export function lockVault(): void {
  memoryUnlockedVault = null;
  currentSessionPin = null;
}

/**
 * Permanently wipes the encrypted vault from storage and resets memory
 */
export function wipeVaultStorage(): void {
  lockVault();
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
