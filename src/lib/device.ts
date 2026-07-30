import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./platform";

let cachedDeviceId: string | null = null;

function generateDeviceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "device_";
  for (let i = 0; i < 16; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const key = "app_device_id_v2";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(key, deviceId);
  }
  cachedDeviceId = deviceId;
  return deviceId;
}

export function getDeviceInfo() {
  return {
    device_id: getDeviceId(),
    device_name: isNativeApp() ? "Android Device" : "Web Browser",
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

export async function registerDeviceLogin(): Promise<boolean> {
  try {
    const info = getDeviceInfo();
    const { data, error } = await supabase.functions.invoke("device-login", { body: info });
    return !error && data?.success === true;
  } catch {
    return false;
  }
}

export async function registerDeviceLogout(): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    const { data, error } = await supabase.functions.invoke("device-logout", { body: { device_id: deviceId } });
    return !error && data?.success === true;
  } catch {
    return false;
  }
}
