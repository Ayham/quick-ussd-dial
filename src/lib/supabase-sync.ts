/**
 * Offline-First Supabase Sync
 * ✅ Works completely offline - all data is stored locally
 * ✅ Automatically syncs to Supabase when online
 * Supabase is the only remote synchronization authority.
 */
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device-id";
import { Capacitor } from "@capacitor/core";
import { APP_VERSION } from "@/config/version";
import { saveAccessSnapshot, type AccessSnapshot } from "./access-state";

const QUEUE_KEY = "supabase_sync_queue_v1";
const LAST_KEY = "supabase_sync_last_v1";
const REMOTE_LICENSE_KEY = "_sys_remote_license_v1";
const REMOTE_TRIAL_KEY = "_sys_remote_trial_v1";
const DEVICE_BLOCKED_KEY = "_sys_device_blocked_v1";
const SYNC_IN_PROGRESS_KEY = "supabase_sync_in_progress";
const APP_INSTANCE_KEY = "app_instance_id_v1";
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

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
  let appInstanceId = localStorage.getItem(APP_INSTANCE_KEY);
  if (!appInstanceId) {
    appInstanceId = crypto.randomUUID();
    localStorage.setItem(APP_INSTANCE_KEY, appInstanceId);
  }
  const deviceId = getDeviceId();
  return {
    device_id: deviceId,
    device_fingerprint: deviceId,
    app_instance_id: appInstanceId,
    name: navigator.userAgent.slice(0, 64),
    model: navigator.platform,
    platform: Capacitor.getPlatform(),
    app_version: APP_VERSION,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function isSyncing(): boolean {
  return localStorage.getItem(SYNC_IN_PROGRESS_KEY) === 'true';
}

export async function flush(options: { force?: boolean } = {}): Promise<{ sent: number; errors: number; snapshot?: AccessSnapshot }> {
  const queue = getQueue();
  const device = await getDeviceMeta();
  if (!device.device_id || device.device_id === "initializing...") return { sent: 0, errors: 0 };

  // Prevent concurrent syncs
  if (!options.force && isSyncing()) return { sent: 0, errors: 0 };
  
  localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'true');

  try {
    // Always sync device meta even if no events
    const events = queue.slice(0, 100);

    const { data, error } = await supabase.functions.invoke("device-sync", {
      body: { device, events },
    });
    
    if (error) {
      console.error('Device sync error:', error);
      localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
      return { sent: 0, errors: events.length };
    }

    if (!data?.ok || !data?.state) {
      localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
      return { sent: 0, errors: Math.max(1, events.length) };
    }

    const snapshot = saveAccessSnapshot({
      ok: true,
      state: data.state,
      reason: data.reason ?? null,
      lifecycle_state: data.lifecycle_state ?? null,
      device: data.device ?? null,
      license: data.license ?? null,
      trial: data.trial ?? null,
      force_update: data.force_update ?? null,
    });

    if (data.license) {
      const previousLicense = localStorage.getItem(REMOTE_LICENSE_KEY);
      const nextLicense = JSON.stringify(data.license);
      localStorage.setItem(REMOTE_LICENSE_KEY, nextLicense);
      if (previousLicense !== nextLicense) {
        window.dispatchEvent(new CustomEvent("app-license-sync", { detail: data.license }));
      }
    } else {
      localStorage.removeItem(REMOTE_LICENSE_KEY);
    }
    if (data.trial) {
      const previousTrial = localStorage.getItem(REMOTE_TRIAL_KEY);
      const nextTrial = JSON.stringify(data.trial);
      localStorage.setItem(REMOTE_TRIAL_KEY, nextTrial);
      if (previousTrial !== nextTrial) {
        window.dispatchEvent(new CustomEvent("app-license-sync", { detail: { trial: data.trial } }));
      }
    } else {
      localStorage.removeItem(REMOTE_TRIAL_KEY);
    }
    const wasBlocked = localStorage.getItem(DEVICE_BLOCKED_KEY) === "1";
    if (data?.device?.is_blocked) {
      localStorage.setItem(DEVICE_BLOCKED_KEY, "1");
    } else {
      localStorage.removeItem(DEVICE_BLOCKED_KEY);
    }
    const isBlocked = localStorage.getItem(DEVICE_BLOCKED_KEY) === "1";
    if (wasBlocked !== isBlocked) {
      window.dispatchEvent(new CustomEvent("app-license-sync", { detail: { device_blocked: isBlocked } }));
    }

    const failedIds = new Set<string>(Array.isArray(data.failed_event_ids) ? data.failed_event_ids : []);
    const remaining = [
      ...events.filter(event => failedIds.has(event.id)),
      ...queue.slice(events.length),
    ];
    saveQueue(remaining);
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
    return { sent: events.length - failedIds.size, errors: failedIds.size, snapshot };
  } catch (e) {
    console.error('Sync error:', e);
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
    return { sent: 0, errors: 1 };
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
  setInterval(() => { if (navigator.onLine && !isSyncing()) flush().catch(() => {}); }, SYNC_INTERVAL);
  // Connectivity-aware
  window.addEventListener("online", () => flush().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine && !isSyncing()) flush().catch(() => {});
  });
}
