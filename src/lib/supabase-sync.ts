import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/config/version";

const QUEUE_KEY = "supabase_sync_queue_v1";
const LAST_KEY = "supabase_sync_last_v1";
const SYNC_IN_PROGRESS_KEY = "supabase_sync_in_progress";
const CLIENT_ID_KEY = "app_client_id_v1";
const SYNC_INTERVAL = 5 * 60 * 1000;
const FOREGROUND_SYNC_INTERVAL = 60 * 1000;
const QUEUE_MAX = 500;
const BATCH_MAX = 100;
const BACKOFF_BASE_MS = 15 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const PRIORITY_EVENTS = new Set(["transfer"]);

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
  let queue = q;
  // The queue has a hard cap, but business data (transfers) must never be
  // dropped because of it. Only non-critical analytics events are trimmed,
  // and they are trimmed AFTER all transfers have been preserved.
  if (queue.length > QUEUE_MAX) {
    const priority = queue.filter((e) => PRIORITY_EVENTS.has(e.event));
    const others = queue.filter((e) => !PRIORITY_EVENTS.has(e.event));
    const keepOthers = Math.max(0, QUEUE_MAX - priority.length);
    queue = [...priority, ...others.slice(others.length - keepOthers)];
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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
  // A fresh event still honours a short backoff: events are safe in the queue
  // and will be flushed by the periodic loop / the next "online" event.
  if (typeof navigator !== "undefined" && navigator.onLine && !isInBackoff()) {
    flush().catch(() => {});
  }
}

// Lease-based guard: the flag stores the flush START TIME and expires after
// SYNC_LEASE_MS. A crash / app kill mid-flush can no longer wedge syncing
// forever (the legacy "true" value from old builds also reads as expired).
const SYNC_LEASE_MS = 2 * 60 * 1000;

export function isSyncing(): boolean {
  const startedAt = Number(localStorage.getItem(SYNC_IN_PROGRESS_KEY));
  return Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < SYNC_LEASE_MS;
}

// Simple retry backoff: after repeated failures we stop hammering the server.
// Successful flushes reset it, so it never delays a working device.
let consecutiveFailures = 0;
let backoffUntil = 0;

function markSyncSuccess() {
  consecutiveFailures = 0;
  backoffUntil = 0;
}

function markSyncFailure() {
  consecutiveFailures += 1;
  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1), BACKOFF_MAX_MS);
  backoffUntil = Date.now() + delay;
}

export function isInBackoff(): boolean {
  return Date.now() < backoffUntil;
}

export async function flush(options: { force?: boolean } = {}): Promise<{ sent: number; errors: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { sent: 0, errors: 0 };

  if (!options.force && isSyncing()) return { sent: 0, errors: 0 };

  localStorage.setItem(SYNC_IN_PROGRESS_KEY, String(Date.now()));

  try {
    const events = queue.slice(0, BATCH_MAX);

    const { data, error } = await supabase.functions.invoke("device-sync", {
      body: {
        client_id: getClientId(),
        events,
        app_version: APP_VERSION,
        // Remaining events AFTER this batch — reported so the Admin Sync
        // Monitor can show the real per-device pending queue size.
        pending_count: queue.length - events.length,
      },
    });

    if (error) {
      markSyncFailure();
      localStorage.removeItem(SYNC_IN_PROGRESS_KEY);
      return { sent: 0, errors: events.length };
    }

    const failedIds = new Set<string>(Array.isArray(data?.failed_event_ids) ? data.failed_event_ids : []);
    const remaining = [
      ...events.filter(event => failedIds.has(event.id)),
      ...queue.slice(events.length),
    ];
    saveQueue(remaining);
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    localStorage.removeItem(SYNC_IN_PROGRESS_KEY);
    markSyncSuccess();
    return { sent: events.length - failedIds.size, errors: failedIds.size };
  } catch (e) {
    markSyncFailure();
    localStorage.removeItem(SYNC_IN_PROGRESS_KEY);
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
    if (navigator.onLine && !isSyncing() && !isInBackoff()) flush().catch(() => {});
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
