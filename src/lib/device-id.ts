import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

const DEVICE_ID_KEY = 'app_device_id_v1';

let cachedId: string | null = null;

/**
 * Get native device identifier (ANDROID_ID / identifierForVendor).
 * Persists across app reinstalls.
 */
async function getNativeDeviceId(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const info = await Device.getId();
    // Returns { identifier: string } — stable hardware-based ID
    return info.identifier || null;
  } catch {
    return null;
  }
}

/**
 * Generate a fingerprint fallback for web (non-native).
 */
async function generateFingerprint(): Promise<string> {
  const components = [
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency || 0,
    // @ts-expect-error deviceMemory is not in all browsers
    navigator.deviceMemory || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
    navigator.maxTouchPoints || 0,
  ];

  const raw = components.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Initialize device ID — call once on app startup.
 * On native: uses ANDROID_ID / identifierForVendor (survives reinstall).
 * On web: uses fingerprint hash from device properties.
 */
export async function initDeviceId(): Promise<string> {
  // Try native ID first (most reliable, survives reinstall)
  const nativeId = await getNativeDeviceId();
  if (nativeId) {
    localStorage.setItem(DEVICE_ID_KEY, nativeId);
    cachedId = nativeId;
    return nativeId;
  }

  // Already stored? Keep it
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored && stored !== 'initializing...') {
    cachedId = stored;
    return stored;
  }

  // Web fallback: fingerprint
  const id = await generateFingerprint();
  localStorage.setItem(DEVICE_ID_KEY, id);
  cachedId = id;
  return id;
}

/**
 * Get device ID synchronously (must call initDeviceId first on startup).
 */
export function getDeviceId(): string {
  if (cachedId) return cachedId;

  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedId = stored;
    return stored;
  }

  return 'initializing...';
}
