import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSignedCache,
  readSignedCache,
  setSigningPublicKeyOverride,
  verifySignedCache,
  writeSignedCache,
  type SignedCacheRecord,
} from "./signed-cache";
import {
  buildSignedRecord,
  generateTestKeys,
  testPolicy,
  type TestKeys,
} from "./signed-cache.test-utils";

const VALID_VERDICT = { valid: true, license_status: "active", account_status: "active" };

describe("Signed License Cache (Ed25519)", () => {
  let keys: TestKeys;

  beforeAll(async () => {
    keys = await generateTestKeys();
  });

  beforeEach(() => {
    localStorage.clear();
    clearSignedCache();
    setSigningPublicKeyOverride(keys.pub);
  });

  function signedRecord(overrides: Partial<SignedCacheRecord> = {}): Promise<SignedCacheRecord> {
    return buildSignedRecord(keys, VALID_VERDICT, testPolicy(), {}).then((r) => ({ ...r, ...overrides }));
  }

  it("accepts a correctly signed record", async () => {
    const rec = await signedRecord();
    const payload = await verifySignedCache(rec);
    expect(payload).not.toBeNull();
    expect(payload?.verdict.license_status).toBe("active");
    expect(payload?.policy.minimum_validation_interval_ms).toBe(24 * 3600000);
  });

  it("rejects a tampered blob", async () => {
    const rec = await signedRecord();
    const tamperedBlob = rec.blob.replace('"license_status":"active"', '"license_status":"permanent"');
    const payload = await verifySignedCache({ ...rec, blob: tamperedBlob });
    expect(payload).toBeNull();
  });

  it("rejects a record signed with a different key (forgery attempt)", async () => {
    const attackerKeys = await generateTestKeys();
    const forged = await buildSignedRecord(attackerKeys, VALID_VERDICT, testPolicy());
    // Blob from the attacker key, signature kept from the attacker key.
    const payload = await verifySignedCache(forged);
    expect(payload).toBeNull();
  });

  it("returns null for malformed content", async () => {
    const rec: SignedCacheRecord = {
      blob: "{not json",
      signature: "AAAA",
      server_time: new Date().toISOString(),
      monotonic_ms: 0,
    };
    expect(await verifySignedCache(rec)).toBeNull();
  });

  it("readSignedCache / writeSignedCache round-trips", async () => {
    const rec = await signedRecord();
    writeSignedCache(rec);
    const read = readSignedCache();
    expect(read).not.toBeNull();
    expect(read?.blob).toBe(rec.blob);
    clearSignedCache();
    expect(readSignedCache()).toBeNull();
  });

  it("verifySignedCache never throws (returns null on missing WebCrypto)", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: { ...original, subtle: undefined }, configurable: true });
    try {
      const rec = await signedRecord();
      const result = await verifySignedCache(rec);
      expect(result).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
