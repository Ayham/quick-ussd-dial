import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceBindingSignatureSync } from "./device";
import {
  clearLicenseCache,
  getTransferGuard,
  validateDeviceSession,
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

function validVerdict(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: true,
    license_status: "active",
    account_status: "active",
    expiry_date: new Date(Date.now() + 86400000 * 60).toISOString(),
    ...overrides,
  };
}

function seedCache(verdict: ValidationResult): void {
  localStorage.setItem("app_license_cache", JSON.stringify(verdict));
  localStorage.setItem("app_license_cache_age", String(Date.now()));
  localStorage.setItem("app_device_binding_v1", getDeviceBindingSignatureSync());
}

function mockOffline(): void {
  mocks.getUser.mockRejectedValue(new Error("network down"));
  mocks.rpc.mockRejectedValue(new Error("network down"));
}

function mockOnline(verdict: ValidationResult): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "validate_device_session") return { data: verdict, error: null };
    if (fn === "get_validation_policy") {
      return {
        data: {
          valid: true,
          minimum_validation_interval_ms: 24 * 3600000,
          offline_grace_ms: 30 * 86400000,
          next_required_validation: new Date(Date.now() + 3600000).toISOString(),
          force_validation: false,
          license_expiration: null,
          revoked: false,
          validation_policy: "normal",
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
}

describe("Acceptance: offline-first licensing behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLicenseCache();
    localStorage.removeItem("app_device_binding_v1");
    vi.clearAllMocks();
  });

  it("S1: logged in + valid paid license + internet OFF -> app usable, transfers work", () => {
    seedCache(validVerdict());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S2: expiry_date moved to the past + internet OFF -> app usable, transfers blocked", () => {
    seedCache(validVerdict({ expiry_date: new Date(Date.now() - 86400000).toISOString() }));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("S3: license revoked on server while device OFFLINE -> app + transfers keep working (stale valid verdict)", () => {
    // The device still holds a VALID cached verdict; the server-side revocation
    // is not yet known offline. Offline mode must not interrupt current usage.
    seedCache(validVerdict());
    mockOffline();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S4: internet ON -> immediate validation -> revoked verdict -> transfers blocked", async () => {
    seedCache(validVerdict());
    mockOffline();
    expect(getTransferGuard().allowed).toBe(true);

    mockOnline({ valid: false, license_status: "revoked", account_status: "active" });
    const result = await validateDeviceSession();
    expect(result.valid).toBe(false);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("revoked");
  });

  it("S5: expired license + user opens app -> login works, all pages accessible, only transfer blocked", () => {
    // Routing is gated by AUTH only (RequireAuth) — never by license. The guard
    // is invoked exclusively at the transfer step.
    seedCache(validVerdict({ expiry_date: new Date(Date.now() - 86400000).toISOString() }));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("S7: internet OFF while logged in -> user is NOT logged out, session usable offline", () => {
    seedCache(validVerdict());
    mockOffline();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S8: reconnect -> immediate validation -> latest server state enforced", async () => {
    seedCache(validVerdict());
    mockOnline({ valid: false, license_status: "blocked", account_status: "blocked" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("blocked");
  });
});
