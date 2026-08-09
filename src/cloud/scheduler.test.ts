import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCloudServices } from "./scheduler";

const mocks = vi.hoisted(() => ({
  validateDeviceSession: vi.fn(),
  getCachedPolicy: vi.fn(),
  refreshLicenseCacheIfNeeded: vi.fn(),
  trackAppOpen: vi.fn(),
  startSupabaseSync: vi.fn(),
  flushPendingOps: vi.fn(),
}));

vi.mock("@/lib/license-cache", () => ({
  validateDeviceSession: mocks.validateDeviceSession,
  getCachedPolicy: mocks.getCachedPolicy,
  refreshLicenseCacheIfNeeded: mocks.refreshLicenseCacheIfNeeded,
}));

vi.mock("@/lib/cloud-sync", () => ({ trackAppOpen: mocks.trackAppOpen }));
vi.mock("@/lib/supabase-sync", () => ({ startSupabaseSync: mocks.startSupabaseSync }));
vi.mock("@/lib/notifications/offline", () => ({ flushPendingOps: mocks.flushPendingOps }));

describe("scheduler: immediate server validation on reconnect", () => {
  beforeEach(() => {
    mocks.getCachedPolicy.mockReturnValue({ minimum_validation_interval_ms: 24 * 3600000 });
    mocks.validateDeviceSession.mockResolvedValue({ valid: true, license_status: "active" });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not validate while offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    startCloudServices();
    window.dispatchEvent(new Event("online"));
    expect(mocks.validateDeviceSession).not.toHaveBeenCalled();
  });

  it("runs a server validation immediately when connectivity is restored", () => {
    startCloudServices();
    window.dispatchEvent(new Event("online"));
    expect(mocks.validateDeviceSession).toHaveBeenCalledTimes(1);
  });

  it("validates on every restored-connectivity event (fire-and-forget, never blocks)", () => {
    startCloudServices();
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(mocks.validateDeviceSession).toHaveBeenCalledTimes(3);
  });
});
