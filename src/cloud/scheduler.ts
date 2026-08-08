import { refreshLicenseCacheIfNeeded, getCachedPolicy } from "@/lib/license-cache";
import { trackAppOpen } from "@/lib/cloud-sync";
import { startSupabaseSync } from "@/lib/supabase-sync";
import { flushPendingOps } from "@/lib/notifications/offline";

const FALLBACK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

let started = false;
let timerId: number | null = null;

function nextDelayMs(): number {
  const interval = getCachedPolicy().minimum_validation_interval_ms;
  const raw = typeof interval === "number" && interval > 0 ? interval : FALLBACK_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.min(raw, MAX_INTERVAL_MS));
}

async function validateBackground(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await refreshLicenseCacheIfNeeded();
    }
  } catch {}
}

function runLoop(): void {
  if (timerId) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    void validateBackground();
    runLoop();
  }, nextDelayMs());
}

/**
 * Cloud Module entry point. Starts all optional, background cloud services.
 *
 * It NEVER blocks the UI and NEVER runs synchronously. Every task is
 * fire-and-forget and independently guarded, so any cloud outage (offline,
 * revoked project, invalid env, network error) can never interrupt the
 * offline core.
 */
export function startCloudServices(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // One-shot background tasks.
  try {
    trackAppOpen();
  } catch {}
  try {
    void flushPendingOps();
  } catch {}
  try {
    startSupabaseSync();
  } catch {}

  // Opportunistic silent license validation (driven by the server policy).
  void validateBackground();

  // Policy-driven validation loop: cadence comes from the server, not the client.
  window.addEventListener("online", () => {
    void validateBackground();
  });
  runLoop();
}
