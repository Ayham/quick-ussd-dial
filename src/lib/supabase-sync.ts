/**
 * Supabase Sync — pushes the local cloud-sync queue to the device-sync edge
 * function. Runs alongside (not replacing) the existing Google Sheets sync.
 */
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device-id";
import { Capacitor } from "@capacitor/core";

const QUEUE_KEY = "supabase_sync_queue_v1";
const LAST_KEY = "supabase_sync_last_v1";
const REMOTE_LICENSE_KEY = "_sys_remote_license_v1";
const DEVICE_BLOCKED_KEY = "_sys_device_blocked_v1";

export interface SbSyncEvent {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function getQueue(): SbSyncEvent[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q: SbSyncEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 500)));
}

export function pushEvent(event: string, data: Record<string, unknown> = {}) {
  const q = getQueue();
  q.push({
    id: crypto.randomUUID(),
    event,
    timestamp: new Date().toISOString(),
    data,
  });
  saveQueue(q);
  if (navigator.onLine) flush().catch(() => {});
}

async function getDeviceMeta() {
  return {
    device_id: getDeviceId(),
    name: navigator.userAgent.slice(0, 64),
    model: navigator.platform,
    platform: Capacitor.getPlatform(),
    app_version: (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ || "1.0",
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function flush(): Promise<{ sent: number; errors: number }> {
  const queue = getQueue();
  const device = await getDeviceMeta();
  if (!device.device_id || device.device_id === "initializing...") return { sent: 0, errors: 0 };

  // Always sync device meta even if no events
  const events = queue.slice(0, 100);

  try {
    const { data, error } = await supabase.functions.invoke("device-sync", {
      body: { device, events },
    });
    if (error) return { sent: 0, errors: events.length };

    // Save remote license if present
    if (data?.license) {
      localStorage.setItem(REMOTE_LICENSE_KEY, JSON.stringify(data.license));
    }
    if (data?.device?.is_blocked) {
      localStorage.setItem(DEVICE_BLOCKED_KEY, "1");
    } else {
      localStorage.removeItem(DEVICE_BLOCKED_KEY);
    }

    // Drop sent events
    const remaining = queue.slice(events.length);
    saveQueue(remaining);
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    return { sent: events.length, errors: 0 };
  } catch {
    return { sent: 0, errors: events.length };
  }
}

export function getCachedRemoteLicense(): {
  license_key: string;
  status: string;
  expiry_date: string | null;
  permanent: boolean;
  ussd_numbers: string[];
} | null {
  try { return JSON.parse(localStorage.getItem(REMOTE_LICENSE_KEY) || "null"); } catch { return null; }
}

export function isDeviceBlocked(): boolean {
  return localStorage.getItem(DEVICE_BLOCKED_KEY) === "1";
}

export function getLastSupabaseSync(): string | null {
  return localStorage.getItem(LAST_KEY);
}

export function getSupabaseQueueSize(): number {
  return getQueue().length;
}

let started = false;
export function startSupabaseSync() {
  if (started) return;
  started = true;
  // Initial push
  flush().catch(() => {});
  // Periodic
  setInterval(() => { if (navigator.onLine) flush().catch(() => {}); }, 5 * 60 * 1000);
  // Connectivity-aware
  window.addEventListener("online", () => flush().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) flush().catch(() => {});
  });
}
