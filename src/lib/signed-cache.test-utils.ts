import { webcrypto } from "node:crypto";
import { setSigningPublicKeyOverride, writeSignedCache, type SignedCacheRecord } from "./signed-cache";
import { __seedTrustedClockForTests } from "./trusted-clock";
import { initLicenseCache, type ValidationPolicy, type ValidationResult } from "./license-cache";

/**
 * Test-only helpers for the Ed25519-signed license cache (SB2).
 *
 * These build a real signed record using a generated keypair and install it as
 * the active verified state, mirroring what `validateDeviceSession()` does
 * against the edge function.
 */

export interface TestKeys {
  pub: string;
  priv: string;
  /** Native signing key. Node's OpenSSL WebCrypto refuses raw-seed imports,
   * so keep the generated CryptoKey for in-process signing. The `priv` seed
   * remains available for EF/Deno interop checks. */
  privKey: CryptoKey;
}

function b64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function generateTestKeys(): Promise<TestKeys> {
  const subtle = webcrypto.subtle;
  const pair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  // Node/OpenSSL cannot export Ed25519 private keys as "raw"; the seed is the
  // trailing 32 bytes of the PKCS#8 DER (RFC 8410: OCTET STRING of the seed).
  const privPkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const privSeed = privPkcs8.slice(privPkcs8.length - 32);
  return { pub: b64UrlEncode(pubRaw), priv: b64UrlEncode(privSeed), privKey: pair.privateKey };
}

export async function signBlobForTest(blob: string, key: CryptoKey | string): Promise<string> {
  const subtle = webcrypto.subtle;
  const signKey =
    typeof key === "string"
      ? await subtle.importKey("raw", b64UrlDecode(key), { name: "Ed25519" }, false, ["sign"])
      : key;
  const sig = await subtle.sign("Ed25519", signKey, new TextEncoder().encode(blob));
  return b64UrlEncode(new Uint8Array(sig));
}

export interface SeedOptions {
  /** Server wall-clock at sign time (default: now). */
  serverTimeMs?: number;
  /** Monotonic baseline at sign time (default: 1000). */
  monotonicMs?: number;
}

export async function buildSignedRecord(
  keys: TestKeys,
  verdict: ValidationResult,
  policy: ValidationPolicy,
  opts: SeedOptions = {},
): Promise<SignedCacheRecord> {
  const serverTimeMs = opts.serverTimeMs ?? Date.now();
  const monotonicMs = opts.monotonicMs ?? 1000;
  const blob = JSON.stringify({
    server_time: new Date(serverTimeMs).toISOString(),
    verdict,
    policy,
  });
  const signature = await signBlobForTest(blob, keys.privKey);
  return {
    blob,
    signature,
    server_time: new Date(serverTimeMs).toISOString(),
    monotonic_ms: monotonicMs,
  };
}

/**
 * Install a signed verdict/policy as the active verified state (offline path).
 * After this, the synchronous transfer guard reads it exactly as it would read
 * a signed cache produced by the edge function.
 */
export async function seedSignedVerdict(
  keys: TestKeys,
  verdict: ValidationResult,
  policy: ValidationPolicy,
  opts: SeedOptions = {},
): Promise<void> {
  const record = await buildSignedRecord(keys, verdict, policy, opts);
  writeSignedCache(record);
  setSigningPublicKeyOverride(keys.pub);
  await initLicenseCache();
  __seedTrustedClockForTests(
    new Date(record.server_time).getTime(),
    opts.monotonicMs ?? 1000,
  );
}

/** Server-shaped policy used by tests (mirrors the edge function defaults). */
export function testPolicy(overrides: Partial<ValidationPolicy> = {}): ValidationPolicy {
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

/** Shape of the mock `functions.invoke("validate-license")` response. */
export async function signedInvokeResponse(
  keys: TestKeys,
  verdict: ValidationResult,
  policy: ValidationPolicy,
  opts: SeedOptions = {},
): Promise<{ data: Record<string, unknown>; error: null }> {
  const record = await buildSignedRecord(keys, verdict, policy, opts);
  return {
    data: {
      valid: verdict.valid,
      reason: verdict.reason,
      trial_remaining_days: null,
      signed: {
        blob: record.blob,
        signature: record.signature,
        server_time: record.server_time,
      },
    },
    error: null,
  };
}
