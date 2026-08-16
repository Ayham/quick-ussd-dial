import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, initDeviceIdentity, getStoredDeviceBinding, getDeviceBindingSignatureSync, storeDeviceBinding, notifyDeviceMismatch } from "./device";
import { syncExpirationReminder } from "./expiration-reminder";
import { computeLicenseDecision } from "./license-decision";
import {
  readSignedCache,
  writeSignedCache,
  clearSignedCache,
  verifySignedCache,
  type SignedCacheRecord,
  type VerifiedPayload,
} from "./signed-cache";
import { initTrustedClock, setTrustedClock, getTrustedNowMs, clearTrustedClock } from "./trusted-clock";
import { getMonotonicMillis } from "./native-clock";
import i18n from "@/lib/i18n";

// Offline fallbacks — used ONLY until the first server policy is received.
// After the first validation the SERVER controls these values (via the signed
// verdict/policy blob; the client never hardcodes cadence / grace / force).
const DEFAULT_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_OFFLINE_GRACE_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_FORCE_VALIDATION = false;

// Upper bound for a single validate-license round-trip. A black-hole / hanging
// network must never leave the transfer flow (or the background validator)
// awaiting forever. On timeout the request is abandoned and the existing
// fail-closed offline behavior takes over — the cached verified verdict is
// kept, nothing is upgraded, nothing is bypassed, and the user is never logged
// out.
const VALIDATE_LICENSE_TIMEOUT_MS = 10_000;

function withInvokeTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("validate_license_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  error?: string;
  user_id?: string;
  license_status?: string;
  account_status?: string;
  current_device?: string;
  expiry_date?: string;
  trial_end?: string;
  is_locked?: boolean;
}

export interface TransferGuardResult {
  allowed: boolean;
  reason?: string;
  reasonCode?: string;
}

/**
 * Server-controlled offline validation policy (from the signed blob).
 * See the edge function `validate-license` for the authoritative semantics.
 */
export interface ValidationPolicy {
  valid: boolean;
  reason?: string;
  minimum_validation_interval_ms: number;
  offline_grace_ms: number;
  next_required_validation: string | null;
  force_validation: boolean;
  license_expiration: string | null;
  revoked: boolean;
  validation_policy: "normal" | "expiring_soon" | "force";
  remind_days_license?: number | null;
  remind_days_trial?: number | null;
}

export interface ValidationReminder {
  show: boolean;
  blocked: boolean;
  days: number | null;
}

function defaultPolicy(): ValidationPolicy {
  return {
    valid: true,
    minimum_validation_interval_ms: DEFAULT_REFRESH_INTERVAL_MS,
    offline_grace_ms: DEFAULT_OFFLINE_GRACE_MS,
    next_required_validation: null,
    force_validation: DEFAULT_FORCE_VALIDATION,
    license_expiration: null,
    revoked: false,
    validation_policy: "normal",
  };
}

/**
 * In-memory verified payload. Set only by initLicenseCache() or after an
 * online validation whose Ed25519 signature was verified. getTransferGuard()
 * and getCachedPolicy() read this synchronously.
 */
let verifiedState: VerifiedPayload | null = null;

/**
 * Verify the locally cached signed verdict + policy at startup and feed the
 * in-memory state used by the synchronous guard. Never throws. This does NOT
 * reset the trusted-clock snapshot, so offline elapsed time is preserved.
 */
export async function initLicenseCache(): Promise<void> {
  try {
    const record = readSignedCache();
    if (!record) {
      verifiedState = null;
      return;
    }
    const payload = await verifySignedCache(record);
    if (!payload) {
      // Tampered or unverifiable cache -> discard it (fail closed).
      clearSignedCache();
      verifiedState = null;
      return;
    }
    verifiedState = payload;
    await initTrustedClock();
  } catch {
    verifiedState = null;
  }
}

/**
 * Consume a `validate-license` edge-function response: verify the signature,
 * persist the signed blob, re-anchor the trusted clock to the SERVER time, and
 * update the in-memory state. Returns null on any failure (never throws).
 */
export async function consumeSignedPayload(
  data: unknown,
): Promise<{ valid: boolean; reason?: string; trial_remaining_days?: number | null } | null> {
  const payload = (data ?? {}) as {
    signed?: { blob?: string; signature?: string; server_time?: string };
  };
  if (!payload.signed?.blob || !payload.signed?.signature || !payload.signed?.server_time) {
    return null;
  }
  const record: SignedCacheRecord = {
    blob: payload.signed.blob,
    signature: payload.signed.signature,
    server_time: payload.signed.server_time,
    monotonic_ms: await getMonotonicMillis(),
  };
  const verified = await verifySignedCache(record);
  if (!verified) return null;
  verifiedState = verified;
  writeSignedCache(record);
  await setTrustedClock(verified.server_time);
  return {
    valid: verified.verdict.valid,
    reason: verified.verdict.reason,
    trial_remaining_days: trialDaysFromPayload(data),
  };
}

function trialDaysFromPayload(data: unknown): number | null {
  const rec = (data ?? {}) as { trial_remaining_days?: number | null };
  return typeof rec.trial_remaining_days === "number" ? rec.trial_remaining_days : null;
}

function needsRefresh(): boolean {
  const nowMs = getTrustedNowMs();
  if (nowMs === null) return true;
  const payload = verifiedState;
  if (!payload) return true;
  const serverTimeMs = new Date(payload.server_time).getTime();
  if (Number.isNaN(serverTimeMs)) return true;
  const age = nowMs - serverTimeMs;
  const policy = payload.policy;
  if (policy.next_required_validation) {
    const next = new Date(policy.next_required_validation).getTime();
    if (!Number.isNaN(next) && nowMs < next) return false;
    return true;
  }
  return age > policy.minimum_validation_interval_ms;
}

export async function validateDeviceSession(): Promise<ValidationResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { valid: false, reason: "not_authenticated", error: i18n.t("auth.notAuthenticated") };
    }

    await initDeviceIdentity();
    const deviceId = getDeviceId();
    const { data, error } = await withInvokeTimeout(
      supabase.functions.invoke("validate-license", { body: { device_id: deviceId } }),
      VALIDATE_LICENSE_TIMEOUT_MS,
    );
    if (error) throw error;
    const consumed = await consumeSignedPayload(data);
    if (!consumed) throw new Error("missing_or_invalid_signature");
    if (!verifiedState) throw new Error("verification_failed");

    const result: ValidationResult = { ...verifiedState.verdict, user_id: user.id };
    // Record the local device binding signature for offline tamper detection.
    // Only recorded when the server accepted the device (no device_mismatch).
    if (result.valid && result.reason !== "device_mismatch") {
      storeDeviceBinding();
    }
    // Surface device takeover so the UI can offer to take the account over.
    if (result.reason === "device_mismatch") {
      notifyDeviceMismatch(result.current_device ?? null);
    }
    // Fire-and-forget expiration reminder (deduplicated; never extends the license).
    syncExpirationReminder(result, verifiedState.policy).catch(() => {});
    return result;
  } catch {
    // Offline / network failure / signature failure. Offline mode provides
    // continuity, not license extension: keep the last VERIFIED verdict (the
    // local guard still enforces expiration, revocation and staleness via the
    // trusted clock). A user that was NEVER validated has no verified verdict
    // -> no_connection.
    if (verifiedState) return verifiedState.verdict;
    return { valid: false, reason: "no_connection", error: i18n.t("errors.noConnection") };
  }
}

/**
 * Server-controlled validation policy — from the verified signed blob only.
 * Kept async for API compatibility; never hits the network.
 */
export async function refreshValidationPolicy(): Promise<ValidationPolicy | null> {
  return verifiedState?.policy ?? getCachedPolicy();
}

export function getCachedPolicy(): ValidationPolicy {
  return verifiedState?.policy ?? defaultPolicy();
}

export function getCachedValidation(): ValidationResult | null {
  return verifiedState?.verdict ?? null;
}

export async function refreshLicenseCacheIfNeeded(): Promise<ValidationResult | null> {
  if (!needsRefresh()) return verifiedState?.verdict ?? null;
  return validateDeviceSession();
}

/**
 * Synchronous, LOCAL-ONLY transfer guard. Never performs any network call.
 *
 * Trust model (SB1/SB2):
 *  - All cached verdicts/policies are Ed25519-signed by the edge function and
 *    verified here with the embedded public key. Anything unverifiable is
 *    discarded -> unverified.
 *  - All offline time decisions use the trusted monotonic clock
 *    (`getTrustedNowMs()`), never `Date.now()`. If elapsed time cannot be
 *    proven (never synced, device rebooted without revalidation) the guard
 *    fails closed.
 *  - EXPIRATION is strict and locally enforceable: an active paid license is
 *    usable offline until its exact expiry_date, a trial until trial_end, and a
 *    permanent license per its permanent status. The client NEVER extends a
 *    license beyond the server-provided expiration date.
 *  - REVOCATION is server-authoritative: enforced as soon as the client has the
 *    verified verdict (fresh validation or reconnect).
 *  - offline_grace_ms only bounds records that have NO expiration boundary at
 *    all (malformed/legacy undated profiles).
 */
export function getTransferGuard(): TransferGuardResult {
  const nowMs = getTrustedNowMs();
  if (nowMs === null) {
    // Elapsed time cannot be proven (never synced, reboot/restart without
    // revalidation, tampered clock) -> fail closed.
    return { allowed: false, reason: i18n.t("errors.timeUnavailable"), reasonCode: "unverified" };
  }
  const payload = verifiedState;
  if (!payload) return { allowed: false, reason: "unverified", reasonCode: "unverified" };

  const data = payload.verdict;
  const policy = payload.policy;
  const serverTimeMs = new Date(payload.server_time).getTime();

  const isPermanent = data.license_status === "permanent";
  const isTrial = data.license_status === "trial";
  const trialEndMs = isTrial ? parseBoundaryMs(data.trial_end) : null;
  const paidExpiryMs = !isPermanent && !isTrial ? parseBoundaryMs(data.expiry_date) : null;
  const boundaryMs = trialEndMs ?? paidExpiryMs;

  // 1. Strict local expiration. The actual expiration date is the offline
  //    boundary — once reached (per the trusted clock), protected transfers are
  //    blocked immediately, with or without a connection, regardless of cache age.
  if (boundaryMs !== null && nowMs >= boundaryMs) {
    return trialEndMs !== null
      ? { allowed: false, reason: i18n.t("errors.trialEnded"), reasonCode: "trial_ended" }
      : { allowed: false, reason: i18n.t("errors.licenseExpired"), reasonCode: "expired" };
  }

  // 2. Staleness fallback ONLY for records with no expiration boundary and not
  //    permanent (e.g. an undated active profile). Not a license extension:
  //    a license whose expiration the server never communicated cannot be used
  //    offline indefinitely. Permanent licenses are exempt.
  const cacheAgeMs = nowMs - serverTimeMs;
  if (boundaryMs === null && !isPermanent && cacheAgeMs > policy.offline_grace_ms) {
    return { allowed: false, reason: "offline_grace_expired", reasonCode: "offline_grace_expired" };
  }

  const expectedBinding = getStoredDeviceBinding();
  if (expectedBinding && expectedBinding !== getDeviceBindingSignatureSync()) {
    return { allowed: false, reason: i18n.t("errors.deviceMismatch"), reasonCode: "device_mismatch" };
  }

  // Device-level verdicts take precedence so a banned/mismatched device is never
  // masked by a generic license state. Server-authoritative (signed verdict).
  if (data.reason === "device_banned") {
    return { allowed: false, reason: i18n.t("errors.deviceBanned"), reasonCode: "device_banned" };
  }
  if (data.reason === "device_mismatch") {
    return { allowed: false, reason: i18n.t("errors.deviceMismatch"), reasonCode: "device_mismatch" };
  }

  // 3. Delegated license/account decision (single source of truth), evaluated
  //    against the trusted clock.
  const decision = computeLicenseDecision(
    { authenticated: true, userId: data.user_id ?? null },
    data,
    { revoked: policy.revoked, now: nowMs },
  );
  if (decision.canTransfer) return { allowed: true };

  return {
    allowed: false,
    reason: guardReasonMessage(decision.reasonCode),
    reasonCode: decision.reasonCode ?? "unknown",
  };
}

function guardReasonMessage(reasonCode: string | null): string {
  switch (reasonCode) {
    case "trial_ended":
      return i18n.t("errors.trialEnded");
    case "expired":
      return i18n.t("errors.licenseExpired");
    case "revoked":
    case "license_blocked":
      return i18n.t("errors.licenseBlocked");
    case "suspended":
      return i18n.t("errors.accountSuspended");
    case "blocked":
      return i18n.t("errors.accountBlocked");
    case "activation_rejected":
      return i18n.t("errors.activationRejected");
    case "inactive":
      return i18n.t("errors.licenseInactive");
    default:
      return reasonCode ?? "unknown";
  }
}

function parseBoundaryMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Transfer guard that re-validates against the server when the local cached
 * verdict would block. A stale device_mismatch / unverified / expired-grace
 * verdict must not permanently lock transfers: the account may have been
 * rebound server-side (force takeover, admin device reset, WebView update)
 * since the last check. Revalidating on a blocked attempt makes the guard
 * self-heal instead of leaving the user stuck behind a stale cache.
 */
export async function ensureTransferAllowed(): Promise<TransferGuardResult> {
  const local = getTransferGuard();
  if (local.allowed) return local;
  try {
    await validateDeviceSession();
  } catch {
    // Offline / network failure — keep the local (blocking) verdict.
  }
  return getTransferGuard();
}

/**
 * Friendly, NON-BLOCKING reminder shown in the final window before expiration
 * when the app is offline or validation is due. Never gates the UI. "blocked"
 * mirrors the local transfer guard.
 */
export function getValidationReminder(): ValidationReminder {
  const payload = verifiedState;
  const nowMs = getTrustedNowMs();
  if (!payload || nowMs === null) return { show: false, blocked: nowMs === null, days: null };
  const cached = payload.verdict;
  // Permanent licenses can never expire — never surface a near-expiry reminder.
  if (cached.license_status === "permanent") return { show: false, blocked: false, days: null };

  const policy = payload.policy;
  const guard = getTransferGuard();
  const blocked = !guard.allowed;

  const serverTimeMs = new Date(payload.server_time).getTime();
  const expiry = policy.license_expiration || cached.expiry_date || cached.trial_end || null;
  let days: number | null = null;
  if (expiry) {
    days = Math.max(0, Math.floor((new Date(expiry).getTime() - nowMs) / (1000 * 60 * 60 * 24)));
  }
  const expiringSoon = policy.validation_policy === "expiring_soon" || (days !== null && days <= 45);
  const cacheAgeMs = nowMs - serverTimeMs;
  const stale = cacheAgeMs > policy.minimum_validation_interval_ms;
  if (!blocked && !expiringSoon && !(policy.force_validation && stale)) {
    return { show: false, blocked: false, days };
  }

  const offline = typeof navigator === "undefined" || !navigator.onLine;
  if (blocked) return { show: true, blocked: true, days };
  if (offline || stale) return { show: true, blocked: false, days };
  return { show: false, blocked: false, days };
}

export function clearLicenseCache(): void {
  try {
    clearSignedCache();
    clearTrustedClock();
  } catch {}
  verifiedState = null;
}

export function getCacheAgeMs(): number {
  const nowMs = getTrustedNowMs();
  const payload = verifiedState;
  if (nowMs === null || !payload) return Infinity;
  return nowMs - new Date(payload.server_time).getTime();
}
