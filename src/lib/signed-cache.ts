import type { ValidationPolicy, ValidationResult } from "./license-cache";

/**
 * Signed, server-authoritative license cache (SB2).
 *
 * The edge function `validate-license` returns `signed: { blob, signature,
 * server_time }` where
 *   blob      = JSON.stringify({ server_time, verdict, policy })
 *   signature = Ed25519 over the exact blob bytes
 *
 * The client verifies the signature with the embedded public key before
 * trusting ANY cached verdict/policy. A blob that fails verification (tampered
 * storage, forged cache, copied data from another install) is discarded and
 * transfers fail closed.
 *
 * The private key lives ONLY in a Supabase secret
 * (`LICENSE_SIGNING_PRIVATE_KEY`) inside the edge function. It is never in the
 * app, so a modified APK cannot mint valid verdicts.
 */

const CACHE_KEY = "app_license_cache_v2";

export const SIGNING_PUBLIC_KEY_B64URL =
  "C6CZz7BMR_AMeg9LtuXP24YHjtY_LVfvHIVRnbXi4k0";

export interface SignedCacheRecord {
  blob: string;
  signature: string;
  server_time: string;
  monotonic_ms: number;
}

export interface VerifiedPayload {
  server_time: string;
  verdict: ValidationResult;
  policy: ValidationPolicy;
}

let publicKeyOverride: string | null = null;

/** Test hook: substitute the public key (and clear verified state on change). */
export function setSigningPublicKeyOverride(pub: string | null): void {
  publicKeyOverride = pub;
}

function getSubtle(): SubtleCrypto | null {
  return (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle ?? null;
}

function b64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVerifyKey(): Promise<CryptoKey | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  const pub = publicKeyOverride ?? SIGNING_PUBLIC_KEY_B64URL;
  try {
    return await subtle.importKey("raw", b64UrlDecode(pub), { name: "Ed25519" }, false, ["verify"]);
  } catch {
    return null;
  }
}

export function readSignedCache(): SignedCacheRecord | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SignedCacheRecord>;
    if (!parsed.blob || !parsed.signature || typeof parsed.server_time !== "string") return null;
    return {
      blob: parsed.blob,
      signature: parsed.signature,
      server_time: parsed.server_time,
      monotonic_ms: typeof parsed.monotonic_ms === "number" ? parsed.monotonic_ms : 0,
    };
  } catch {
    return null;
  }
}

export function writeSignedCache(record: SignedCacheRecord): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {}
}

export function clearSignedCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

/**
 * Verify a signed cache record and, on success, return the parsed payload.
 * Returns null for any tampering, signature failure, missing WebCrypto, or
 * malformed content — never throws.
 */
export async function verifySignedCache(record: SignedCacheRecord): Promise<VerifiedPayload | null> {
  const subtle = getSubtle();
  const key = await importVerifyKey();
  if (!subtle || !key) return null;

  const encoder = new TextEncoder();
  let valid = false;
  try {
    valid = await subtle.verify({ name: "Ed25519" }, key, b64UrlDecode(record.signature), encoder.encode(record.blob));
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const parsed = JSON.parse(record.blob) as {
      server_time?: string;
      verdict?: ValidationResult;
      policy?: ValidationPolicy;
    };
    if (!parsed.server_time || !parsed.verdict || typeof parsed.verdict !== "object") return null;
    if (!parsed.policy || typeof parsed.policy !== "object") return null;
    return { server_time: parsed.server_time, verdict: parsed.verdict, policy: parsed.policy };
  } catch {
    return null;
  }
}

/** base64url helpers exposed for test tooling. */
export function encodeBase64Url(bytes: Uint8Array): string {
  return b64UrlEncode(bytes);
}
