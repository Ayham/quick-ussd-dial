import { registerPlugin } from "@capacitor/core";

export interface SystemClockPluginDef {
  /** Elapsed realtime in milliseconds since the last device boot. */
  elapsedRealtimeMillis(): Promise<{ milliseconds: number }>;
}

/**
 * Web fallback mirrors the native semantics with `performance.now()` so the
 * same code path works in the browser / preview builds.
 */
export const SystemClockPlugin = registerPlugin<SystemClockPluginDef>("SystemClock", {
  web: () => ({
    async elapsedRealtimeMillis() {
      return { milliseconds: Math.round(performance.now()) };
    },
  }),
});
