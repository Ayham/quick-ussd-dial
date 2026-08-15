import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceBindingSignatureSync, storeDeviceBinding } from "./device";
import {
  clearLicenseCache,
  getCachedPolicy,
  getTransferGuard,
  getValidationReminder,
  initLicenseCache,
  type ValidationPolicy,
  type ValidationResult,
} from "./license-cache";
import { setSigningPublicKeyOverride } from "./signed-cache";
import { __setTestMonotonicBaseline } from "./trusted-clock";
import {
  generateTestKeys,
  seedSignedVerdict,
  testPolicy,
  type TestKeys,
} from "./signed-cache.test-utils";

describe("License Cache & Offline Validation Policy", () => {
  let keys: TestKeys;

  beforeAll(async () => {
    keys = await generateTestKeys();
  });

  beforeEach(() => {
    localStorage.clear();
    clearLicenseCache();
    setSigningPublicKeyOverride(keys.pub);
    localStorage.removeItem("app_device_binding_v1");
  });

  function validVerdict(overrides: Partial<ValidationResult> = {}): ValidationResult {
    return {
      valid: true,
      license_status: "active",
      account_status: "active",
      ...overrides,
    };
  }

  it("returns unverified guard when no cache exists", () => {
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("allows transfer when cached validation is valid and within grace period", async () => {
    await seedSignedVerdict(keys, validVerdict({ expiry_date: new Date(Date.now() + 86400000 * 30).toISOString() }), testPolicy());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });

  it("allows transfer on the same device after storeDeviceBinding records the binding", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy());
    storeDeviceBinding();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
    expect(guard.reasonCode).toBeUndefined();
  });

  it("blocks transfer when the stored binding is from a different device", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy());
    localStorage.setItem("app_device_binding_v1", "bind_some_other_device");
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("device_mismatch");
  });

  it("blocks transfer when account is suspended in cache", async () => {
    await seedSignedVerdict(keys, validVerdict({ valid: false, account_status: "suspended" }), testPolicy());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
  });

  it("blocks transfer when offline grace period expires (undated record)", async () => {
    // Undated active record, signed 8 days ago, 8 days of monotonic elapsed.
    await seedSignedVerdict(keys, validVerdict(), testPolicy(), { serverTimeMs: Date.now() - 1000 * 60 * 60 * 24 * 8 });
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 24 * 8);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("offline_grace_expired");
  });

  it("respects server-controlled policy values stored in cache", async () => {
    const customPolicy: ValidationPolicy = {
      ...testPolicy(),
      minimum_validation_interval_ms: 1000 * 60 * 60 * 6, // 6h
      offline_grace_ms: 1000 * 60 * 60 * 24 * 14, // 14d grace
    };
    await seedSignedVerdict(keys, validVerdict({ expiry_date: new Date(Date.now() + 86400000 * 60).toISOString() }), customPolicy);
    const policy = getCachedPolicy();
    expect(policy.minimum_validation_interval_ms).toBe(1000 * 60 * 60 * 6);
    expect(policy.offline_grace_ms).toBe(1000 * 60 * 60 * 24 * 14);
  });

  it("surfaces a non-blocking reminder when expiring soon and validation is due", async () => {
    const expiringPolicy: ValidationPolicy = {
      ...testPolicy(),
      validation_policy: "expiring_soon",
      next_required_validation: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // due
    };
    // Signed 25h ago with 25h elapsed -> stale (past the 24h interval).
    await seedSignedVerdict(
      keys,
      validVerdict({ expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString() }),
      expiringPolicy,
      { serverTimeMs: Date.now() - 1000 * 60 * 60 * 25 },
    );
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 25);
    const reminder = getValidationReminder();
    expect(reminder.show).toBe(true);
    expect(reminder.blocked).toBe(false);
  });

  it("never surfaces a near-expiry reminder for a permanent license even with stale cached dates", async () => {
    const stalePolicy: ValidationPolicy = {
      ...testPolicy(),
      validation_policy: "expiring_soon",
      next_required_validation: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // due
    };
    await seedSignedVerdict(
      keys,
      validVerdict({
        license_status: "permanent",
        expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
        trial_end: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
      }),
      stalePolicy,
    );
    const reminder = getValidationReminder();
    expect(reminder.show).toBe(false);
  });
});

describe("Commercial Offline Security (attack scenarios)", () => {
  let keys: TestKeys;

  beforeAll(async () => {
    keys = await generateTestKeys();
  });

  beforeEach(() => {
    localStorage.clear();
    clearLicenseCache();
    setSigningPublicKeyOverride(keys.pub);
    localStorage.removeItem("app_device_binding_v1");
  });

  function validVerdict(overrides: Partial<ValidationResult> = {}): ValidationResult {
    return {
      valid: true,
      license_status: "active",
      account_status: "active",
      ...overrides,
    };
  }

  it("blocks expired license offline and reports reasonCode", async () => {
    await seedSignedVerdict(keys, validVerdict({ valid: false, license_status: "expired" }), testPolicy());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("expired");
  });

  it("blocks revoked license offline and reports reasonCode", async () => {
    await seedSignedVerdict(keys, validVerdict({ valid: false, license_status: "revoked" }), testPolicy());
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("revoked");
  });

  it("blocks transfer when app data is copied to another device (device mismatch)", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy());
    localStorage.setItem("app_device_binding_v1", "bind_copied_to_other_device");
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("device_mismatch");
  });

  it("unverified (requires reactivation) after app data is cleared", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy());
    localStorage.clear();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("no new trial can be generated offline — cache is the sole source of truth", () => {
    localStorage.clear();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
  });

  it("blocks after offline grace exceeds server-controlled grace period", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy(), { serverTimeMs: Date.now() - 1000 * 60 * 60 * 24 * 8 });
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 24 * 8);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("offline_grace_expired");
  });

  it("SB2: a tampered signed cache is discarded at startup (fail closed)", async () => {
    await seedSignedVerdict(keys, validVerdict({ expiry_date: new Date(Date.now() + 86400000 * 30).toISOString() }), testPolicy());
    // Flip a byte in the persisted blob.
    const raw = JSON.parse(localStorage.getItem("app_license_cache_v2") as string);
    raw.blob = raw.blob.replace("active", "Active");
    localStorage.setItem("app_license_cache_v2", JSON.stringify(raw));
    // Simulate a cold start: re-verify from storage.
    await initLicenseCache();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("SB2: a cache signed with a different key is rejected (fail closed)", async () => {
    await seedSignedVerdict(keys, validVerdict(), testPolicy());
    const attackerKeys = await generateTestKeys();
    setSigningPublicKeyOverride(attackerKeys.pub);
    await initLicenseCache();
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("SB1: a monotonic regression (process restart / reboot) fails closed even with a valid signed cache", async () => {
    await seedSignedVerdict(keys, validVerdict({ expiry_date: new Date(Date.now() + 86400000 * 30).toISOString() }), testPolicy());
    // Fresh process starts its monotonic clock below the snapshot baseline.
    __setTestMonotonicBaseline(0);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe("unverified");
  });

  it("SB1: clock rollback while online is ignored (monotonic-driven), transfer still allowed", async () => {
    await seedSignedVerdict(keys, validVerdict({ expiry_date: new Date(Date.now() + 86400000 * 30).toISOString() }), testPolicy());
    // Even if the device wall clock is wound backward, the trusted clock keeps
    // advancing on the monotonic baseline.
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60);
    const guard = getTransferGuard();
    expect(guard.allowed).toBe(true);
  });
});
