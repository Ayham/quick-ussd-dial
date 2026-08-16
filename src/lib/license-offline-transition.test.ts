import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceBindingSignatureSync } from "./device";
import {
  clearLicenseCache,
  getCachedPolicy,
  getCachedValidation,
  getTransferGuard,
  validateDeviceSession,
  type ValidationPolicy,
  type ValidationResult,
} from "./license-cache";
import { setSigningPublicKeyOverride } from "./signed-cache";
import { __setTestMonotonicBaseline } from "./trusted-clock";
import {
  generateTestKeys,
  seedSignedVerdict,
  signedInvokeResponse,
  testPolicy,
  type TestKeys,
} from "./signed-cache.test-utils";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
  },
}));

function validVerdict(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: true,
    license_status: "active",
    account_status: "active",
    expiry_date: new Date(Date.now() + 86400000 * 30).toISOString(),
    ...overrides,
  };
}

describe("Offline -> Online license refresh (الترخيص يُحدَّث فور توفر الإنترنت)", () => {
  let keys: TestKeys;

  beforeAll(async () => {
    keys = await generateTestKeys();
  });

  beforeEach(() => {
    localStorage.clear();
    clearLicenseCache();
    setSigningPublicKeyOverride(keys.pub);
    localStorage.removeItem("app_device_binding_v1");
    vi.clearAllMocks();
  });

  function seedValidCache(): Promise<void> {
    return seedSignedVerdict(keys, validVerdict(), testPolicy(), { serverTimeMs: Date.now() });
  }

  function mockOnline(verdict: ValidationResult, policyOverrides: Partial<ValidationPolicy> = {}): void {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "validate-license") {
        return await signedInvokeResponse(keys, verdict, testPolicy(policyOverrides));
      }
      return { data: null, error: null };
    });
  }

  function mockOffline(): void {
    mocks.getUser.mockRejectedValue(new Error("network down"));
    mocks.invoke.mockRejectedValue(new Error("network down"));
    mocks.rpc.mockRejectedValue(new Error("network down"));
  }

  it("offline with a fresh cached license allows transfers (within server grace)", async () => {
    await seedValidCache();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("offline past the server-controlled fallback bound blocks undated licenses", async () => {
    // Undated license (server never communicated an expiry): the fallback
    // refresh bound (offline_grace_ms) caps how long it stays valid offline.
    await seedSignedVerdict(
      keys,
      { valid: true, license_status: "active", account_status: "active" },
      testPolicy(),
      { serverTimeMs: Date.now() - 1000 * 60 * 60 * 24 * 8 },
    );
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 24 * 8);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("offline_grace_expired");
  });

  it("offline with a dated license stays usable past the refresh interval (strict expiration, no artificial grace)", async () => {
    await seedValidCache();
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 24 * 8);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("offline after the actual expiration date blocks transfers immediately", async () => {
    await seedSignedVerdict(
      keys,
      { valid: false, license_status: "active", account_status: "active", expiry_date: new Date(Date.now() - 86400000).toISOString() },
      testPolicy(),
      { serverTimeMs: Date.now() },
    );
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("offline after the trial end blocks transfers immediately", async () => {
    await seedSignedVerdict(
      keys,
      { valid: false, license_status: "trial", account_status: "active", trial_end: new Date(Date.now() - 86400000).toISOString() },
      testPolicy(),
      { serverTimeMs: Date.now() },
    );
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("trial_ended");
  });

  it("reconnecting pulls the new verdict: revoked license becomes transfer-blocked immediately", async () => {
    await seedValidCache();
    expect(getTransferGuard().allowed).toBe(true);

    mockOnline(
      { valid: true, license_status: "revoked", account_status: "active" },
      { revoked: true, force_validation: true },
    );
    const result = await validateDeviceSession();

    expect(result.valid).toBe(true);
    expect(getCachedValidation()?.license_status).toBe("revoked");
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("revoked");
  });

  it("reconnecting pulls the new verdict: blocked account becomes blocked immediately", async () => {
    await seedValidCache();
    mockOnline({ valid: false, license_status: "active", account_status: "blocked" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("blocked");
  });

  it("reconnecting pulls the new verdict: inactive license becomes transfer-blocked immediately", async () => {
    await seedValidCache();
    mockOnline({ valid: true, license_status: "inactive", account_status: "active" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("inactive");
  });

  it("reconnecting with a still-valid verdict refreshes the cache and keeps access", async () => {
    await seedValidCache();
    mockOnline(validVerdict());
    const result = await validateDeviceSession();
    expect(result.valid).toBe(true);
    expect(getTransferGuard().allowed).toBe(true);
  });

  it("reconnecting with a device_banned verdict blocks transfers and keeps the session (no logout)", async () => {
    await seedValidCache();
    mockOnline({ valid: false, reason: "device_banned", license_status: "active", account_status: "active" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("device_banned");
  });

  it("reconnecting with a device_mismatch verdict blocks transfers until the device is rebound", async () => {
    await seedValidCache();
    mockOnline({ valid: false, reason: "device_mismatch", license_status: "active", account_status: "active" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("device_mismatch");
  });

  it("a suspended license verdict (license-level lock) blocks transfers without logout", async () => {
    await seedValidCache();
    mockOnline({ valid: false, reason: "suspended", license_status: "suspended", account_status: "active" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("suspended");
  });

  it("an account-suspended verdict blocks transfers and reports the account lock", async () => {
    await seedValidCache();
    mockOnline({ valid: false, reason: "account_suspended", license_status: "active", account_status: "suspended" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("suspended");
  });

  it("no_connection (never validated) reports a blocking offline failure without a cached verdict", async () => {
    localStorage.clear();
    mockOffline();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("reconnecting stores the server policy (grace + cadence) used afterwards", async () => {
    await seedValidCache();
    mockOnline(
      { valid: true, license_status: "active", account_status: "active" },
      {
        minimum_validation_interval_ms: 6 * 3600000,
        offline_grace_ms: 14 * 86400000,
        validation_policy: "expiring_soon",
      },
    );
    await validateDeviceSession();
    const p = getCachedPolicy();
    expect(p.minimum_validation_interval_ms).toBe(6 * 3600000);
    expect(p.offline_grace_ms).toBe(14 * 86400000);
    expect(p.validation_policy).toBe("expiring_soon");
  });

  it("a hanging validate-license request times out and keeps the cached expired verdict (fail-closed, no upgrade, no bypass)", async () => {
    // A black-hole network: the request never resolves. The 10s bound must
    // surface the SAME verdict the local guard already enforces — an expired
    // license stays expired. Timeout must never resurrect/upgrade a license.
    await seedSignedVerdict(
      keys,
      { valid: false, license_status: "active", account_status: "active", expiry_date: new Date(Date.now() - 86400000).toISOString() },
      testPolicy(),
      { serverTimeMs: Date.now() },
    );
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());

    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.invoke.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    try {
      const pending = validateDeviceSession();
      await vi.advanceTimersByTimeAsync(11_000);
      const result = await pending;

      // The timeout must keep the cached verdict as-is — never an upgrade.
      expect(result.valid).toBe(false);
      const guard = getTransferGuard();
      expect(guard.allowed).toBe(false);
      expect(guard.reasonCode).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a hanging validate-license request with a revoked cached verdict stays revoked (timeout never un-blocks)", async () => {
    await seedSignedVerdict(
      keys,
      { valid: true, license_status: "revoked", account_status: "active" },
      testPolicy({ revoked: true, force_validation: true }),
      { serverTimeMs: Date.now() },
    );
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
    expect(getTransferGuard().allowed).toBe(false);

    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.invoke.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    try {
      const pending = validateDeviceSession();
      await vi.advanceTimersByTimeAsync(11_000);
      await pending;

      const guard = getTransferGuard();
      expect(guard.allowed).toBe(false);
      expect(guard.reasonCode).toBe("revoked");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a hanging validate-license request with no cached verdict times out to no_connection (never fabricated)", async () => {
    localStorage.clear();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.invoke.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    try {
      const pending = validateDeviceSession();
      await vi.advanceTimersByTimeAsync(11_000);
      const result = await pending;

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("no_connection");
    } finally {
      vi.useRealTimers();
    }
  });
});
