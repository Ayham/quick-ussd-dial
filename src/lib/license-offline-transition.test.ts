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

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  },
}));

function serverPolicy(overrides: Partial<ValidationPolicy> = {}): ValidationPolicy {
  return {
    valid: true,
    minimum_validation_interval_ms: 24 * 3600000,
    offline_grace_ms: 7 * 86400000,
    next_required_validation: new Date(Date.now() + 3600000).toISOString(),
    force_validation: false,
    license_expiration: null,
    revoked: false,
    validation_policy: "normal",
    ...overrides,
  };
}

function seedValidCache(): void {
  const valid: ValidationResult = {
    valid: true,
    license_status: "active",
    account_status: "active",
    expiry_date: new Date(Date.now() + 86400000 * 30).toISOString(),
  };
  localStorage.setItem("app_license_cache", JSON.stringify(valid));
  localStorage.setItem("app_license_cache_age", String(Date.now()));
  localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
}

function mockOnline(verdict: ValidationResult, policyOverrides: Partial<ValidationPolicy> = {}): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "validate_device_session") return { data: verdict, error: null };
    if (fn === "get_validation_policy") return { data: serverPolicy(policyOverrides), error: null };
    return { data: null, error: null };
  });
}

function mockOffline(): void {
  mocks.getUser.mockRejectedValue(new Error("network down"));
  mocks.rpc.mockRejectedValue(new Error("network down"));
}

describe("Offline -> Online license refresh (الترخيص يُحدَّث فور توفر الإنترنت)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLicenseCache();
    localStorage.removeItem("app_device_binding_v1");
    vi.clearAllMocks();
  });

  it("offline with a fresh cached license allows transfers (within server grace)", () => {
    seedValidCache();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("offline past the server-controlled fallback bound blocks undated licenses", () => {
    // Undated license (server never communicated an expiry): the fallback
    // refresh bound (offline_grace_ms) caps how long it stays valid offline.
    const undated: ValidationResult = {
      valid: true,
      license_status: "active",
      account_status: "active",
    };
    localStorage.setItem("app_license_cache", JSON.stringify(undated));
    const eightDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 8;
    localStorage.setItem("app_license_cache_age", String(eightDaysAgo));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("offline_grace_expired");
  });

  it("offline with a dated license stays usable past the refresh interval (strict expiration, no artificial grace)", () => {
    // An active license with a real expiry is usable offline until that exact
    // date — even if it has not revalidated recently. offline_grace_ms does
    // NOT extend or shorten a dated license.
    seedValidCache();
    const eightDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 8;
    localStorage.setItem("app_license_cache_age", String(eightDaysAgo));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("offline after the actual expiration date blocks transfers immediately", () => {
    const expired: ValidationResult = {
      valid: false,
      license_status: "active",
      account_status: "active",
      expiry_date: new Date(Date.now() - 86400000).toISOString(),
    };
    localStorage.setItem("app_license_cache", JSON.stringify(expired));
    localStorage.setItem("app_license_cache_age", String(Date.now()));
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("offline after the trial end blocks transfers immediately", () => {
    const trialEnded: ValidationResult = {
      valid: false,
      license_status: "trial",
      account_status: "active",
      trial_end: new Date(Date.now() - 86400000).toISOString(),
    };
    localStorage.setItem("app_license_cache", JSON.stringify(trialEnded));
    localStorage.setItem("app_license_cache_age", String(Date.now()));
    localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("trial_ended");
  });

  it("reconnecting pulls the new verdict: revoked account becomes blocked immediately", async () => {
    seedValidCache();
    expect(getTransferGuard().allowed).toBe(true);

    mockOnline(
      { valid: false, license_status: "revoked", account_status: "active" },
      { revoked: true, force_validation: true },
    );
    const result = await validateDeviceSession();

    expect(result.valid).toBe(false);
    expect(getCachedValidation()?.license_status).toBe("revoked");
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("revoked");
  });

  it("reconnecting pulls the new verdict: blocked account becomes blocked immediately", async () => {
    seedValidCache();
    mockOnline({ valid: false, license_status: "active", account_status: "blocked" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("blocked");
  });

  it("reconnecting pulls the new verdict: inactive license becomes blocked immediately", async () => {
    seedValidCache();
    mockOnline({ valid: false, license_status: "inactive", account_status: "active" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("inactive");
  });

  it("reconnecting with a still-valid verdict refreshes the cache and keeps access", async () => {
    seedValidCache();
    mockOnline({
      valid: true,
      license_status: "active",
      account_status: "active",
      expiry_date: new Date(Date.now() + 86400000 * 30).toISOString(),
    });
    const result = await validateDeviceSession();
    expect(result.valid).toBe(true);
    expect(getTransferGuard().allowed).toBe(true);
  });

  it("reconnecting stores the server policy (grace + cadence) used afterwards", async () => {
    seedValidCache();
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
});
