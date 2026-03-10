/**
 * License Sync via Google Sheets
 * مزامنة الترخيص عبر Google Sheets — يجلب بيانات الترخيص بناءً على معرف الجهاز
 * يعمل أوفلاين أولاً ويزامن عند توفر الإنترنت
 */

import { getDeviceId } from './device-id';
import { getSyncEndpoint } from './cloud-sync';
import { saveLicense, getAppStatus } from './license';

const LICENSE_CACHE_KEY = '_sys_lic_cache_v1';
const LICENSE_LAST_CHECK_KEY = '_sys_lic_last_check_v1';
const UNAUTHORIZED_KEY = '_sys_device_unauth_v1';

export interface RemoteLicenseData {
  device_id: string;
  license_key?: string;
  license_level?: string;
  expiry_date?: string;
  is_authorized: boolean;
  updated_at?: string;
  user_id?: string;
}

/** Cache remote license data locally */
function cacheLicenseData(data: RemoteLicenseData) {
  localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(data));
  localStorage.setItem(LICENSE_LAST_CHECK_KEY, new Date().toISOString());
}

/** Get cached remote license data */
export function getCachedLicenseData(): RemoteLicenseData | null {
  try {
    const stored = localStorage.getItem(LICENSE_CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

export function getLastLicenseCheck(): string | null {
  return localStorage.getItem(LICENSE_LAST_CHECK_KEY);
}

/** Check if device is marked as unauthorized */
export function isDeviceUnauthorized(): boolean {
  return localStorage.getItem(UNAUTHORIZED_KEY) === 'true';
}

/** Mark device as unauthorized */
function setDeviceUnauthorized(value: boolean) {
  if (value) {
    localStorage.setItem(UNAUTHORIZED_KEY, 'true');
  } else {
    localStorage.removeItem(UNAUTHORIZED_KEY);
  }
}

/**
 * Fetch license data from Google Sheets via Apps Script
 * Returns null if offline or endpoint not configured
 */
export async function fetchRemoteLicense(): Promise<RemoteLicenseData | null> {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return null;

  const deviceId = getDeviceId();
  if (!deviceId || deviceId === 'initializing...') return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const url = `${endpoint}?action=getDeviceLicense&deviceId=${encodeURIComponent(deviceId)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (data.success && data.license) {
      const remoteLicense: RemoteLicenseData = data.license;
      cacheLicenseData(remoteLicense);

      // Handle authorization
      if (remoteLicense.is_authorized === false) {
        setDeviceUnauthorized(true);
      } else {
        setDeviceUnauthorized(false);

        // If we got a license key from remote, save it locally
        if (remoteLicense.license_key) {
          saveLicense(remoteLicense.license_key);
        }
      }

      return remoteLicense;
    }
  } catch {
    // Offline or network error — continue with cached data
  }

  return null;
}

/**
 * Sync license on app start / resume / connectivity change
 * Returns true if sync was successful
 */
export async function syncLicense(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const result = await fetchRemoteLicense();
  return result !== null;
}

/**
 * Start background license sync
 * Monitors connectivity and app visibility
 */
export function startLicenseSyncListeners() {
  // Sync when coming online
  window.addEventListener('online', () => {
    syncLicense().catch(() => {});
  });

  // Sync when app returns to foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      syncLicense().catch(() => {});
    }
  });
}
