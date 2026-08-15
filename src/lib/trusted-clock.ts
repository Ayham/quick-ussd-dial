import { getMonotonicMillis } from "./native-clock";

/**
 * Trusted clock (SB1): a tamper-resistant "now" for offline license / expiry
 * decisions.
 *
 * Model:
 *   trustedNow = snapshot.serverTimeMs + (currentMonotonic - snapshot.monotonicMs)
 *
 * The snapshot is written at the moment a signed server verdict is cached:
 * serverTimeMs is the SERVER's wall time (cryptographically signed, cannot be
 * forged by the device) and monotonicMs is the device's boot-based monotonic
 * clock at that instant. All subsequent offline time is derived from the
 * monotonic clock, which the user cannot rewind.
 *
 * Fail-closed rules:
 *  - No snapshot yet (never synced)                         -> null
 *  - Monotonic baseline not captured                        -> null
 *  - Monotonic regression (process restart on web, device
 *    reboot on native) since the snapshot                   -> null
 *  Returning null means "elapsed time cannot be proven" and the caller blocks
 *  protected transfers until the next ONLINE validation re-anchors the clock.
 *
 * On native, `SystemClock.elapsedRealtime()` survives app process restarts, so
 * normal reopen / force-stop continuity still works offline. A device reboot is
 * the only event that forces a revalidation — exactly the time-travel attack
 * surface we are closing.
 *
 * Web / preview limitation: `performance.now()` resets on a navigation or
 * process restart, so preview builds fail closed after a reload until the next
 * online validation. The shipped Android artifact is unaffected.
 */

const SNAPSHOT_KEY = "app_trusted_clock_v2";

interface ClockSnapshot {
  serverTimeMs: number;
  monotonicMs: number;
}

let lastMonotonicMs: number | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let testMonotonicSource: (() => Promise<number>) | null = null;

/** Test hook: override the monotonic source. Pass null to restore. */
export function __setTestMonotonicSource(fn: (() => Promise<number>) | null): void {
  testMonotonicSource = fn;
}

async function currentMonotonic(): Promise<number> {
  if (testMonotonicSource) return testMonotonicSource();
  return getMonotonicMillis();
}

function readSnapshot(): ClockSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClockSnapshot>;
    if (typeof parsed.serverTimeMs !== "number" || typeof parsed.monotonicMs !== "number") return null;
    return { serverTimeMs: parsed.serverTimeMs, monotonicMs: parsed.monotonicMs };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: ClockSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {}
}

function clearSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}
}

/**
 * Capture the current monotonic baseline. Call at app startup AFTER the signed
 * cache was verified. This does NOT reset the snapshot, so offline elapsed time
 * is preserved across process restarts on native.
 */
export async function initTrustedClock(): Promise<void> {
  const m = await currentMonotonic();
  if (Number.isFinite(m)) lastMonotonicMs = m;
}

/**
 * Start the background monotonic baseline refresher + reboot/restart detector.
 * Kept separate from initTrustedClock so tests can control the baseline.
 */
export function startTrustedClockMonitor(): void {
  if (refreshTimer || typeof window === "undefined") return;
  refreshTimer = window.setInterval(() => {
    void (async () => {
      const mm = await currentMonotonic();
      if (!Number.isFinite(mm)) return;
      // Monotonic regression -> the device rebooted (native) or the process
      // restarted (web) since the snapshot was written. Elapsed time is no
      // longer provable -> clear the snapshot so the guard fails closed.
      const snapshot = readSnapshot();
      if (snapshot && mm < snapshot.monotonicMs - 5_000) {
        lastMonotonicMs = null;
        clearSnapshot();
        return;
      }
      lastMonotonicMs = mm;
    })();
  }, 30_000);
}

/** Test helper: seed the trusted clock directly. */
export function __seedTrustedClockForTests(serverTimeMs: number, monotonicMs: number): void {
  lastMonotonicMs = monotonicMs;
  writeSnapshot({ serverTimeMs, monotonicMs });
}

/** Test helper: advance the monotonic baseline (simulates elapsed time). */
export function __setTestMonotonicBaseline(ms: number): void {
  lastMonotonicMs = ms;
}

/**
 * Re-anchor the trusted clock to a freshly verified SERVER time. Called only
 * after an online validation whose signature was verified.
 */
export async function setTrustedClock(serverTimeIso: string | Date | number): Promise<void> {
  const serverTimeMs = new Date(serverTimeIso).getTime();
  if (!Number.isFinite(serverTimeMs)) return;
  const m = await currentMonotonic();
  if (!Number.isFinite(m)) return;
  lastMonotonicMs = m;
  writeSnapshot({ serverTimeMs, monotonicMs: m });
}

/**
 * Synchronous trusted "now". Returns null when elapsed time cannot be proven
 * (fail closed) — see the rules above.
 */
export function getTrustedNowMs(): number | null {
  const snapshot = readSnapshot();
  if (!snapshot) return null;
  if (lastMonotonicMs === null) return null;
  const delta = lastMonotonicMs - snapshot.monotonicMs;
  if (!Number.isFinite(delta) || delta < 0) return null;
  return snapshot.serverTimeMs + delta;
}

/** Invalidate the trusted clock (logout, cache wipe). */
export function clearTrustedClock(): void {
  lastMonotonicMs = null;
  clearSnapshot();
  if (refreshTimer && typeof window !== "undefined") {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
