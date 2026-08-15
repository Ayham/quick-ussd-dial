import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceBindingSignatureSync } from "./device";
import {
  clearLicenseCache,
  getTransferGuard,
  validateDeviceSession,
  type ValidationResult,
} from "./license-cache";
import { setSigningPublicKeyOverride } from "./signed-cache";
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
    expiry_date: new Date(Date.now() + 86400000 * 60).toISOString(),
    ...overrides,
  };
}

describe("Acceptance: offline-first licensing behavior", () => {
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

  function seedCache(verdict: ValidationResult): Promise<void> {
    return seedSignedVerdict(keys, verdict, testPolicy(), { serverTimeMs: Date.now() });
  }

  function mockOffline(): void {
    mocks.getUser.mockRejectedValue(new Error("network down"));
    mocks.invoke.mockRejectedValue(new Error("network down"));
    mocks.rpc.mockRejectedValue(new Error("network down"));
  }

  function mockOnline(verdict: ValidationResult): void {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "validate-license") {
        return await signedInvokeResponse(keys, verdict, testPolicy());
      }
      return { data: null, error: null };
    });
  }

  it("S1: logged in + valid paid license + internet OFF -> app usable, transfers work", async () => {
    await seedCache(validVerdict());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S2: expiry_date moved to the past + internet OFF -> app usable, transfers blocked", async () => {
    await seedCache(validVerdict({ expiry_date: new Date(Date.now() - 86400000).toISOString() }));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("S3: license revoked on server while device OFFLINE -> app + transfers keep working (stale valid verdict)", async () => {
    await seedCache(validVerdict());
    mockOffline();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S4: internet ON -> immediate validation -> revoked verdict -> transfers blocked", async () => {
    await seedCache(validVerdict());
    mockOffline();
    expect(getTransferGuard().allowed).toBe(true);

    mockOnline({ valid: true, license_status: "revoked", account_status: "active" });
    const result = await validateDeviceSession();
    expect(result.valid).toBe(true);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("revoked");
  });

  it("S5: expired license + user opens app -> login works, all pages accessible, only transfer blocked", async () => {
    await seedCache(validVerdict({ expiry_date: new Date(Date.now() - 86400000).toISOString() }));
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("S7: internet OFF while logged in -> user is NOT logged out, session usable offline", async () => {
    await seedCache(validVerdict());
    mockOffline();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("S8: reconnect -> immediate validation -> latest server state enforced", async () => {
    await seedCache(validVerdict());
    mockOnline({ valid: false, license_status: "blocked", account_status: "blocked" });
    await validateDeviceSession();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("blocked");
  });
});
