const DEVICE_ID_KEY = 'app_device_id_v1';

/**
 * Generate a stable device fingerprint from hardware/browser properties.
 * This produces the same ID on the same device even after app reinstall.
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
  
  // SHA-256 hash → hex → take first 32 chars as a UUID-like ID
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Format as UUID-like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

let cachedId: string | null = null;

/**
 * Get a stable device ID. Uses fingerprint-based generation.
 * The ID persists across reinstalls because it's derived from device hardware.
 * Falls back to localStorage cache for sync access.
 */
export function getDeviceId(): string {
  // Return cached value for sync access
  if (cachedId) return cachedId;
  
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedId = stored;
    return stored;
  }
  
  // Fallback for first sync call before async init
  return 'initializing...';
}

/**
 * Initialize device ID — call once on app startup.
 * Generates fingerprint and saves to localStorage.
 */
export async function initDeviceId(): Promise<string> {
  // If already stored, use it (preserves existing licenses for old users)
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored && stored !== 'initializing...') {
    cachedId = stored;
    return stored;
  }
  
  // Generate new fingerprint-based ID
  const id = await generateFingerprint();
  localStorage.setItem(DEVICE_ID_KEY, id);
  cachedId = id;
  return id;
}
