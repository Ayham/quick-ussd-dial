/**
 * Monotonic clock source for the trusted clock (SB1).
 *
 * Native (Android): reads `SystemClock.elapsedRealtime()` from a tiny
 * Capacitor plugin. It is elapsed time since boot — independent of the user's
 * wall-clock settings and continues advancing while the app process is
 * suspended. It resets ONLY on a device reboot.
 *
 * Web / preview: `performance.now()`. Monotonic within a page, unaffected by
 * wall-clock changes, but resets on a navigation / process restart.
 *
 * Callers must never trust `Date.now()` for offline age/expiry decisions.
 */
export async function getMonotonicMillis(): Promise<number> {
  const w = globalThis as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) {
    try {
      const { SystemClockPlugin } = await import("./system-clock");
      const result = await SystemClockPlugin.elapsedRealtimeMillis();
      if (result && typeof result.milliseconds === "number" && Number.isFinite(result.milliseconds)) {
        return result.milliseconds;
      }
    } catch {
      // Native plugin unavailable (dev build without reinstall) -> web clock.
    }
  }
  return Math.round(typeof performance !== "undefined" ? performance.now() : Date.now());
}
