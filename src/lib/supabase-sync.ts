import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "supabase_sync_queue_v1";
const LAST_KEY = "supabase_sync_last_v1";
const SYNC_IN_PROGRESS_KEY = "supabase_sync_in_progress";
const CLIENT_ID_KEY = "app_client_id_v1";
const SYNC_INTERVAL = 5 * 60 * 1000;
const FOREGROUND_SYNC_INTERVAL = 60 * 1000;

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

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function pushEvent(event: string, data: Record<string, unknown> = {}) {
  const q = getQueue();
  q.push({ id: crypto.randomUUID(), event, timestamp: new Date().toISOString(), data });
  saveQueue(q);
  if (navigator.onLine) flush().catch(() => {});
}

export function isSyncing(): boolean {
  return localStorage.getItem(SYNC_IN_PROGRESS_KEY) === 'true';
}

export async function flush(options: { force?: boolean } = {}): Promise<{ sent: number; errors: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { sent: 0, errors: 0 };

  if (!options.force && isSyncing()) return { sent: 0, errors: 0 };

  localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'true');

  try {
    const events = queue.slice(0, 100);

    const { data, error } = await supabase.functions.invoke("device-sync", {
      body: { client_id: getClientId(), events },
    });

    if (error) {
      localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
      return { sent: 0, errors: events.length };
    }

    const failedIds = new Set<string>(Array.isArray(data?.failed_event_ids) ? data.failed_event_ids : []);
    const remaining = [
      ...events.filter(event => failedIds.has(event.id)),
      ...queue.slice(events.length),
    ];
    saveQueue(remaining);
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
    return { sent: events.length - failedIds.size, errors: failedIds.size };
  } catch (e) {
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'false');
    return { sent: 0, errors: 1 };
  }
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_KEY);
}

export function getQueueSize(): number {
  return getQueue().length;
}

let started = false;
let syncIntervalId: number | null = null;

function startSyncLoop() {
  if (syncIntervalId) window.clearInterval(syncIntervalId);
  const intervalMs = document.visibilityState === "visible" ? FOREGROUND_SYNC_INTERVAL : SYNC_INTERVAL;
  syncIntervalId = window.setInterval(() => {
    if (navigator.onLine && !isSyncing()) flush().catch(() => {});
  }, intervalMs);
}

export function startSupabaseSync() {
  if (started) return;
  started = true;
  flush().catch(() => {});
  startSyncLoop();
  window.addEventListener("online", () => flush().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flush({ force: true }).catch(() => {});
    startSyncLoop();
  });
}
