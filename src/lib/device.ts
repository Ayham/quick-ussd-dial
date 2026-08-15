import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./platform";
import i18n from "@/lib/i18n";

let cachedDeviceId: string | null = null;
const DEVICE_BINDING_KEY = "app_device_binding_v1";
const DEVICE_ID_KEY = "app_device_id_v2";
let identityPromise: Promise<string> | null = null;

function generateDeviceId(): string {
  return "device_" + crypto.randomUUID();
}

/**
 * Native, reinstall-stable device identity (SB3 + SB5).
 *
 * Android: `Device.getId()` returns the SSAID-based identifier, which is
 * stable per device + app-signing-key across reinstalls and app-data wipes.
 * This both fixes lost bindings on legitimate reinstalls AND closes the
 * trial-abuse "fresh id after reinstall" vector server-side (the fingerprint
 * stays identical, so `fn_trial_abuse_check` can link the new account to the
 * previous trial).
 *
 * Migration: an existing stored id is kept, so already-bound installs are
 * unaffected. Fresh/wiped installs get the native stable id.
 */
export function initDeviceIdentity(): Promise<string> {
  if (identityPromise) return identityPromise;
  identityPromise = (async () => {
    try {
      const stored = localStorage.getItem(DEVICE_ID_KEY);
      if (stored) {
        cachedDeviceId = stored;
        return stored;
      }
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Device } = await import("@capacitor/device");
        const { identifier } = await Device.getId();
        if (identifier) {
          const id = "device_" + identifier;
          cachedDeviceId = id;
          try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
          return id;
        }
      }
    } catch {}
    // Fallback: random per-install id (web / preview / native without the plugin).
    if (cachedDeviceId) return cachedDeviceId;
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const id = generateDeviceId();
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
    cachedDeviceId = id;
    return id;
  })();
  return identityPromise;
}

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  // No persisted id yet (initDeviceIdentity still in flight or never called).
  // Generate + persist a placeholder; initDeviceIdentity() will reconcile to
  // the native stable id when it completes. Await initDeviceIdentity() before
  // relying on the id (e.g. before server validation / device login).
  const id = generateDeviceId();
  try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
  cachedDeviceId = id;
  return id;
}

/**
 * Rotation-safe, user-preference-safe hardware binding signature.
 * Intentionally EXCLUDES screen dimensions (rotation) and language/timezone
 * (user preferences that the app lets the user change) so the signature is
 * stable on the same device while still differing across distinct physical
 * devices. Used to detect cold copies of the app data to another device.
 * Synchronous so it can be used by getTransferGuard() at transfer time,
 * and the stored binding must be produced by this exact function so the
 * offline comparison matches.
 */
export function getDeviceBindingSignatureSync(): string {
  const components = [
    navigator.userAgent || "unknown",
    navigator.platform || "unknown",
    String(navigator.hardwareConcurrency || "unknown"),
  ];
  const raw = components.join("|||");
  // Original simple hash (same as before) for consistency in test environments
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit signed integer
  }
  return "bind_" + Math.abs(hash).toString(36);
}

export function getStoredDeviceBinding(): string | null {
  try {
    return localStorage.getItem(DEVICE_BINDING_KEY);
  } catch {
    return null;
  }
}

export function storeDeviceBinding(): string {
  const sig = getDeviceBindingSignatureSync();
  try {
    localStorage.setItem(DEVICE_BINDING_KEY, sig);
  } catch {}
  return sig;
}

export function clearDeviceBinding(): void {
  try {
    localStorage.removeItem(DEVICE_BINDING_KEY);
  } catch {}
}

export function getDeviceInfo() {
  return {
    device_id: getDeviceId(),
    device_name: isNativeApp() ? i18n.t("device.androidDevice") : i18n.t("device.webBrowser"),
    device_model: navigator.platform || "unknown",
    platform: isNativeApp() ? "android" : "web",
    app_version: __APP_VERSION__ || "0.0.0",
    fingerprint: getDeviceFingerprint(),
  };
}

function getDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency,
  ];
  const raw = components.join("|||");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "fp_" + Math.abs(hash).toString(36);
}

export interface DeviceLoginResult {
  success: boolean;
  error?: string;
  currentDevice?: string | null;
}

type DeviceMismatchListener = (info: { currentDevice: string | null }) => void;
const mismatchListeners = new Set<DeviceMismatchListener>();

export function onDeviceMismatch(listener: DeviceMismatchListener): () => void {
  mismatchListeners.add(listener);
  return () => {
    mismatchListeners.delete(listener);
  };
}

export function notifyDeviceMismatch(currentDevice: string | null): void {
  for (const listener of mismatchListeners) listener({ currentDevice });
}

type DeviceBannedListener = () => void;
const bannedListeners = new Set<DeviceBannedListener>();

export function onDeviceBanned(listener: DeviceBannedListener): () => void {
  bannedListeners.add(listener);
  return () => {
    bannedListeners.delete(listener);
  };
}

export function notifyDeviceBanned(): void {
  for (const listener of bannedListeners) listener();
}

export async function registerDeviceLogin(force = false): Promise<DeviceLoginResult> {
  if (!isNativeApp()) return { success: true };
  try {
    await initDeviceIdentity();
    const info = getDeviceInfo();
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("device-login", {
      body: { ...info, force, refresh_token: session?.refresh_token ?? null },
    });
    const payload = (data ?? {}) as { success?: boolean; error?: string; current_device?: string | null };
    if (!error && payload?.success === true) return { success: true };
    if (payload?.error === "device_mismatch") {
      const currentDevice = payload.current_device ?? null;
      notifyDeviceMismatch(currentDevice);
      return { success: false, error: "device_mismatch", currentDevice };
    }
    if (payload?.error === "device_banned") {
      notifyDeviceBanned();
      return { success: false, error: "device_banned", currentDevice: null };
    }
    return { success: false, error: payload?.error ?? (error?.message ?? "unknown") };
  } catch {
    return { success: false, error: "unknown" };
  }
}

export async function registerDeviceLogout(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const deviceId = getDeviceId();
    const { data, error } = await supabase.functions.invoke("device-logout", { body: { device_id: deviceId, platform: isNativeApp() ? "android" : "web" } });
    return !error && data?.success === true;
  } catch {
    return false;
  }
}
