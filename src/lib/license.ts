import { getDeviceId } from './device-id';

const TRIAL_START_KEY = 'app_trial_start_v1';
const LICENSE_KEY = 'app_license_v1';
const LAST_DATE_KEY = 'app_last_date_v1';
const TRIAL_DAYS_KEY = 'app_trial_days_v1';
const DEFAULT_TRIAL_DAYS = 30;

// Obfuscated DB names — must match Admin.tsx
const DB_NAME = '.sys_cache_ext';
const STORE_NAME = '_d';

async function loadPublicKeyFromDB(): Promise<JsonWebKey | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const getReq = tx.objectStore(STORE_NAME).get('_pub');
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface LicensePayload {
  deviceId: string;
  expiryDate: string; // "YYYY-MM-DD" or "permanent"
  version?: string;
}

export type AppLicenseStatus =
  | { status: 'trial'; daysLeft: number }
  | { status: 'licensed'; expiryDate: string; daysLeft: number; permanent?: boolean }
  | { status: 'trial_expired' }
  | { status: 'license_expired' }
  | { status: 'clock_tampered' };

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// Anti-tampering: detect if user rolled back the clock
function checkClockTamper(): boolean {
  const lastDate = localStorage.getItem(LAST_DATE_KEY);
  const today = getToday();
  if (lastDate && today < lastDate) {
    return true;
  }
  localStorage.setItem(LAST_DATE_KEY, today);
  return false;
}

function getTrialStart(): string | null {
  return localStorage.getItem(TRIAL_START_KEY);
}

function initTrial(): string {
  const today = getToday();
  localStorage.setItem(TRIAL_START_KEY, today);
  localStorage.setItem(LAST_DATE_KEY, today);
  return today;
}

// Trial days management
export function getTrialDays(): number {
  try {
    const stored = localStorage.getItem(TRIAL_DAYS_KEY);
    if (stored) return Number(stored);
  } catch {}
  return DEFAULT_TRIAL_DAYS;
}

export function saveTrialDays(days: number) {
  localStorage.setItem(TRIAL_DAYS_KEY, String(days));
}

// Verify RSA signature using Web Crypto — loads public key from IndexedDB
async function verifySignature(data: string, signatureB64: string): Promise<boolean> {
  try {
    const pubKeyJwk = await loadPublicKeyFromDB();
    
    if (!pubKeyJwk || !pubKeyJwk.n) {
      // No public key set up — allow in dev mode (admin hasn't logged in yet)
      console.warn("⚠️ No public key found. Admin must login first to generate keys.");
      return true;
    }
    
    const key = await crypto.subtle.importKey(
      'jwk',
      pubKeyJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const sigBuffer = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBuffer, dataBuffer);
  } catch (e) {
    console.error('License verification error:', e);
    return false;
  }
}

export async function validateLicense(licenseKey: string): Promise<{ valid: boolean; payload?: LicensePayload; error?: string }> {
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'صيغة الترخيص غير صحيحة' };
  }

  const [dataB64, sigB64] = parts;

  let payload: LicensePayload;
  try {
    const json = atob(dataB64);
    payload = JSON.parse(json);
  } catch {
    return { valid: false, error: 'بيانات الترخيص غير صالحة' };
  }

  // Verify device ID
  const deviceId = getDeviceId();
  if (payload.deviceId !== deviceId) {
    return { valid: false, error: 'الترخيص مخصص لجهاز آخر' };
  }

  // Verify signature
  const sigValid = await verifySignature(dataB64, sigB64);
  if (!sigValid) {
    return { valid: false, error: 'توقيع الترخيص غير صالح' };
  }

  // Verify expiry (skip for permanent licenses)
  if (payload.expiryDate !== 'permanent') {
    const today = getToday();
    if (today > payload.expiryDate) {
      return { valid: false, error: 'انتهت صلاحية الترخيص' };
    }
  }

  return { valid: true, payload };
}

export function saveLicense(licenseKey: string) {
  localStorage.setItem(LICENSE_KEY, licenseKey);
}

export function getSavedLicense(): string | null {
  return localStorage.getItem(LICENSE_KEY);
}

export function clearLicense() {
  localStorage.removeItem(LICENSE_KEY);
}

export async function getAppStatus(): Promise<AppLicenseStatus> {
  if (checkClockTamper()) {
    return { status: 'clock_tampered' };
  }

  const today = getToday();

  // Check saved license first
  const savedLicense = getSavedLicense();
  if (savedLicense) {
    const result = await validateLicense(savedLicense);
    if (result.valid && result.payload) {
      if (result.payload.expiryDate === 'permanent') {
        return { status: 'licensed', expiryDate: 'permanent', daysLeft: Infinity, permanent: true };
      }
      const daysLeft = daysBetween(today, result.payload.expiryDate);
      if (daysLeft >= 0) {
        return { status: 'licensed', expiryDate: result.payload.expiryDate, daysLeft };
      }
      return { status: 'license_expired' };
    }
    if (result.error === 'انتهت صلاحية الترخيص') {
      return { status: 'license_expired' };
    }
  }

  // Check trial
  let trialStart = getTrialStart();
  if (!trialStart) {
    trialStart = initTrial();
  }

  const trialDays = getTrialDays();
  const trialDaysUsed = daysBetween(trialStart, today);
  const daysLeft = trialDays - trialDaysUsed;

  if (daysLeft > 0) {
    return { status: 'trial', daysLeft };
  }

  return { status: 'trial_expired' };
}
