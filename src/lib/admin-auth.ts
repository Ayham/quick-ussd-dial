// Obfuscated storage keys — no "admin", "password", or "credentials" terms
const _SYS_CREDS_KEY = '_internal_v1_sys_dat';
const _SYS_ATTEMPTS_KEY = '_sys_rt_ct_v1';
const _SYS_LOCKOUT_KEY = '_sys_rt_lk_v1';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

// System salt for PBKDF2 — long, unique, hidden
const SYSTEM_SALT = 'xK9#mP$2vL!qR7@nF4&jW8*bT3^hY6+dC1';

export interface AdminCredentials {
  username: string;
  passwordHash: string; // PBKDF2 hash, not plaintext
  salt: string;
}

// ============ PBKDF2 Hashing via Web Crypto ============

async function derivePBKDF2Key(password: string, salt: string, iterations: number = 12000): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const combinedSalt = encoder.encode(SYSTEM_SALT + salt);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: combinedSalt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Convert to hex string
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ Credential Storage ============

// Default credentials — hashed on first use
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'Password@5@164';
let _defaultHashCache: { hash: string; salt: string } | null = null;

async function getDefaultHash(): Promise<{ hash: string; salt: string }> {
  if (_defaultHashCache) return _defaultHashCache;
  const salt = 'default_salt_v1_fixed';
  const hash = await derivePBKDF2Key(DEFAULT_PASSWORD, salt);
  _defaultHashCache = { hash, salt };
  return _defaultHashCache;
}

export async function getAdminCredentials(): Promise<AdminCredentials> {
  try {
    const stored = localStorage.getItem(_SYS_CREDS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.username && parsed.passwordHash && parsed.salt) return parsed;
    }
  } catch {}
  // Return default hashed credentials
  const def = await getDefaultHash();
  return {
    username: DEFAULT_USERNAME,
    passwordHash: def.hash,
    salt: def.salt,
  };
}

export async function saveAdminCredentials(creds: { username: string; password: string }) {
  const salt = generateSalt();
  const passwordHash = await derivePBKDF2Key(creds.password, salt);
  const stored: AdminCredentials = {
    username: creds.username,
    passwordHash,
    salt,
  };
  localStorage.setItem(_SYS_CREDS_KEY, JSON.stringify(stored));
}

// ============ Lockout System ============

function getFailedAttempts(): number {
  return Number(localStorage.getItem(_SYS_ATTEMPTS_KEY) || '0');
}

function setFailedAttempts(count: number) {
  localStorage.setItem(_SYS_ATTEMPTS_KEY, String(count));
}

function setLockoutUntil(time: number) {
  localStorage.setItem(_SYS_LOCKOUT_KEY, String(time));
}

function getLockoutUntil(): number {
  return Number(localStorage.getItem(_SYS_LOCKOUT_KEY) || '0');
}

export function getLockoutInfo(): { locked: boolean; remainingSeconds: number; attempts: number } {
  const until = getLockoutUntil();
  const now = Date.now();
  if (until > now) {
    return { locked: true, remainingSeconds: Math.ceil((until - now) / 1000), attempts: getFailedAttempts() };
  }
  if (until > 0) {
    setFailedAttempts(0);
    setLockoutUntil(0);
  }
  return { locked: false, remainingSeconds: 0, attempts: getFailedAttempts() };
}

export async function verifyAdmin(username: string, password: string): Promise<'success' | 'invalid' | 'locked'> {
  const lockout = getLockoutInfo();
  if (lockout.locked) return 'locked';

  const creds = await getAdminCredentials();
  const hash = await derivePBKDF2Key(password, creds.salt);

  if (username === creds.username && hash === creds.passwordHash) {
    setFailedAttempts(0);
    setLockoutUntil(0);
    return 'success';
  }

  const attempts = getFailedAttempts() + 1;
  setFailedAttempts(attempts);

  if (attempts >= MAX_ATTEMPTS) {
    setLockoutUntil(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }

  return 'invalid';
}

export function getRemainingAttempts(): number {
  return Math.max(0, MAX_ATTEMPTS - getFailedAttempts());
}

// ============ AES Encryption for Private Key ============

async function deriveAESKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password + SYSTEM_SALT),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SYSTEM_SALT),
      iterations: 12000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: string, password: string): Promise<string> {
  const aesKey = await deriveAESKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(data)
  );

  // Combine IV + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptData(encryptedB64: string, password: string): Promise<string | null> {
  try {
    const aesKey = await deriveAESKey(password);
    const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// Session — in-memory flag (resets on reload)
let adminAuthenticated = false;
// Session key — kept in memory only, never persisted
let _sessionKey: string | null = null;

export function isAdminAuthenticated(): boolean {
  return adminAuthenticated;
}

export function setAdminAuthenticated(val: boolean) {
  adminAuthenticated = val;
  if (!val) _sessionKey = null;
}

export function setSessionKey(key: string) {
  _sessionKey = key;
}

export function getSessionKey(): string | null {
  return _sessionKey;
}
