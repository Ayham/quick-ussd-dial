import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getStoredDeviceBinding, getDeviceBindingSignatureSync, storeDeviceBinding, notifyDeviceMismatch } from "./device";
import { syncExpirationReminder } from "./expiration-reminder";
import i18n from "@/lib/i18n";

const CACHE_KEY = "app_license_cache";
const CACHE_AGE_KEY = "app_license_cache_age";
const POLICY_KEY = "app_validation_policy";

// Offline fallbacks — used ONLY until the first server policy is received.
// After the first validation the SERVER controls these values.
//
// NOTE ON GRACE: the app does NOT grant an artificial offline grace period.
// The authoritative offline boundary is the actual license expiration date
// (expiry_date for paid licenses, trial_end for trials). offline_grace_ms is
// only consulted for records that carry NO expiration boundary at all (a
// malformed/legacy profile the server never dated) so their validity cannot
// be stretched indefinitely offline.
const DEFAULT_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_OFFLINE_GRACE_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_FORCE_VALIDATION = false;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  error?: string;
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
 * Server-controlled offline validation policy.
 *
 * The SERVER decides:
 *  - minimum_validation_interval_ms: how often the client must silently validate
 *  - offline_grace_ms: remaining offline validity derived from the ACTUAL
 *    expiration date (0 for revoked/blocked/expired, remaining time for
 *    active/trial, effectively indefinite for permanent). It is NEVER a flat
 *    grace period that extends a license beyond its expiration.
 *  - next_required_validation: when the next silent validation is due
 *  - force_validation: server demands a fresh validation before transfers
 *  - license_expiration: the real expiration (blocking applies when reached)
 *  - revoked: license revoked server-side
 *  - validation_policy: "normal" | "expiring_soon" | "force"
 *  - remind_days_license / remind_days_trial: expiration reminder windows
 *
 * The client NEVER hardcodes any of these values. The license expiration date
 * remains the authoritative offline boundary — the client never extends a
 * license beyond the server-provided expiration date.
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

function getCachedRaw(): { data: ValidationResult | null; age: number } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ageStr = localStorage.getItem(CACHE_AGE_KEY);
    const data = raw ? (JSON.parse(raw) as ValidationResult) : null;
    const age = ageStr ? parseInt(ageStr, 10) : 0;
    return { data, age };
  } catch {
    return { data: null, age: 0 };
  }
}

function setCachedRaw(result: ValidationResult): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    localStorage.setItem(CACHE_AGE_KEY, String(Date.now()));
  } catch {}
}

export function getCachedPolicy(): ValidationPolicy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return defaultPolicy();
    const parsed = JSON.parse(raw) as Partial<ValidationPolicy>;
    return {
      ...defaultPolicy(),
      ...parsed,
      minimum_validation_interval_ms:
        typeof parsed.minimum_validation_interval_ms === "number" && parsed.minimum_validation_interval_ms > 0
          ? parsed.minimum_validation_interval_ms
          : DEFAULT_REFRESH_INTERVAL_MS,
      // A server-sent 0 (revoked/blocked/expired → no offline validity) is honored.
      offline_grace_ms:
        typeof parsed.offline_grace_ms === "number" && parsed.offline_grace_ms >= 0
          ? parsed.offline_grace_ms
          : DEFAULT_OFFLINE_GRACE_MS,
    };
  } catch {
    return defaultPolicy();
  }
}

function storeCachedPolicy(policy: ValidationPolicy): void {
  try {
    localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
  } catch {}
}

function needsRefresh(): boolean {
  const ageStr = localStorage.getItem(CACHE_AGE_KEY);
  if (!ageStr) return true;
  const age = parseInt(ageStr, 10);
  const policy = getCachedPolicy();
  if (policy.next_required_validation) {
    const next = new Date(policy.next_required_validation).getTime();
    if (!Number.isNaN(next) && Date.now() < next) return false;
    return true;
  }
  return Date.now() - age > policy.minimum_validation_interval_ms;
}

export async function validateDeviceSession(): Promise<ValidationResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { valid: false, reason: "not_authenticated", error: i18n.t("auth.notAuthenticated") };
    }

    const deviceId = getDeviceId();
    const { data, error } = await supabase.rpc("validate_device_session", { _device_id: deviceId });
    if (error) throw error;
    const result = data as unknown as ValidationResult;
    setCachedRaw(result);
    // Fetch the server-controlled policy and store it with the cache.
    await refreshValidationPolicy();
    // Record the local device binding signature for offline tamper detection.
    // Only recorded when the server accepted the device (no device_mismatch).
    if (result.valid && result.reason !== "device_mismatch") {
      storeDeviceBinding();
    }
    // Surface device takeover (e.g. the account was logged in on another device)
    // so the UI can offer to log that device out and take over.
    if (result.reason === "device_mismatch") {
      notifyDeviceMismatch(result.current_device ?? null);
    }
    // Fire-and-forget: schedule the deduplicated expiration reminder (if any).
    // It never blocks validation and never extends the license.
    syncExpirationReminder(result, getCachedPolicy()).catch(() => {});
    return result;
  } catch {
    // Offline / network failure. Offline mode provides continuity, not license
    // extension: keep the last known verdict (the local guard still enforces
    // expiration, revocation and staleness for undated licenses). A user that
    // was NEVER validated has no cached verdict → no_connection.
    const cached = getCachedRaw();
    if (cached.data) return cached.data;
    return { valid: false, reason: "no_connection", error: i18n.t("errors.noConnection") };
  }
}

/**
 * Server-controlled validation policy — the client never decides cadence,
 * grace or force requirements itself.
 */
export async function refreshValidationPolicy(): Promise<ValidationPolicy | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return getCachedPolicy();

    const { data, error } = await supabase.rpc("get_validation_policy");
    if (error) throw error;
    const policy = data as unknown as ValidationPolicy;
    if (policy && typeof policy === "object") {
      storeCachedPolicy(policy);
      return policy;
    }
    return null;
  } catch {
    return getCachedPolicy();
  }
}

export function getCachedValidation(): ValidationResult | null {
  return getCachedRaw().data;
}

export async function refreshLicenseCacheIfNeeded(): Promise<ValidationResult | null> {
  if (!needsRefresh()) return getCachedRaw().data;
  return validateDeviceSession();
}

/**
 * Synchronous, LOCAL-ONLY transfer guard. Never performs any network call.
 *
 * Business policy (enforced here and mirrored server-side):
 *  - EXPIRATION is strict and locally enforceable: an active paid license is
 *    usable offline until its exact expiry_date, a trial until trial_end, and
 *    a permanent license stays valid per its permanent status. The client
 *    NEVER extends a license beyond the server-provided expiration date.
 *  - REVOCATION is server-authoritative: a revoked/blocked/suspended verdict is
 *    enforced as soon as the client has it (fresh validation or reconnect).
 *    While offline with a stale valid verdict, the license keeps working.
 *  - No artificial offline grace: offline_grace_ms only bounds records that
 *    have NO expiration boundary at all (malformed/legacy undated profiles).
 */
export function getTransferGuard(): TransferGuardResult {
  const cached = getCachedRaw();
  const policy = getCachedPolicy();
  if (!cached.data) return { allowed: false, reason: "unverified", reasonCode: "unverified" };

  const data = cached.data;
  const isPermanent = data.license_status === "permanent";
  const isTrial = data.license_status === "trial";
  const trialEndMs = isTrial ? parseBoundaryMs(data.trial_end) : null;
  const paidExpiryMs = !isPermanent && !isTrial ? parseBoundaryMs(data.expiry_date) : null;
  const boundaryMs = trialEndMs ?? paidExpiryMs;

  // 1. Strict local expiration. The actual expiration date is the offline
  //    boundary — once reached, protected transfers are blocked immediately,
  //    with or without a connection, regardless of cache age.
  if (boundaryMs !== null && Date.now() >= boundaryMs) {
    return trialEndMs !== null
      ? { allowed: false, reason: i18n.t("errors.trialEnded"), reasonCode: "trial_ended" }
      : { allowed: false, reason: i18n.t("errors.licenseExpired"), reasonCode: "expired" };
  }

  // 2. Staleness fallback ONLY for records with no expiration boundary and not
  //    permanent (e.g. an undated active profile). This is not a license
  //    extension: a license whose expiration the server never communicated
  //    cannot be used offline indefinitely. Permanent licenses are exempt.
  if (boundaryMs === null && !isPermanent && getCacheAgeMs() > policy.offline_grace_ms) {
    return { allowed: false, reason: "offline_grace_expired", reasonCode: "offline_grace_expired" };
  }

  const expectedBinding = getStoredDeviceBinding();
  if (expectedBinding && expectedBinding !== getDeviceBindingSignatureSync()) {
    return { allowed: false, reason: i18n.t("errors.deviceMismatch"), reasonCode: "device_mismatch" };
  }

  if (policy.revoked) {
    return { allowed: false, reason: i18n.t("errors.licenseBlocked"), reasonCode: "revoked" };
  }
  if (data.account_status === "suspended") {
    return { allowed: false, reason: i18n.t("errors.accountSuspended"), reasonCode: "suspended" };
  }
  if (data.account_status === "blocked") {
    return { allowed: false, reason: i18n.t("errors.accountBlocked"), reasonCode: "blocked" };
  }
  if (data.license_status === "expired") {
    return { allowed: false, reason: i18n.t("errors.licenseExpired"), reasonCode: "expired" };
  }
  if (data.license_status === "rejected") {
    return { allowed: false, reason: i18n.t("errors.activationRejected"), reasonCode: "activation_rejected" };
  }
  if (data.license_status === "blocked") {
    return { allowed: false, reason: i18n.t("errors.licenseBlocked"), reasonCode: "license_blocked" };
  }
  if (data.license_status === "revoked") {
    return { allowed: false, reason: i18n.t("errors.licenseBlocked"), reasonCode: "revoked" };
  }
  if (data.license_status === "trial" && data.trial_end) {
    const trialEnd = new Date(data.trial_end);
    if (trialEnd < new Date()) {
      return { allowed: false, reason: i18n.t("errors.trialEnded"), reasonCode: "trial_ended" };
    }
  }
  if (data.license_status === "pending") {
    return { allowed: false, reason: i18n.t("errors.licenseInactive"), reasonCode: "inactive" };
  }
  if (data.license_status === "inactive") {
    return { allowed: false, reason: i18n.t("errors.licenseInactive"), reasonCode: "inactive" };
  }

  if (data.reason === "device_mismatch") {
    return { allowed: false, reason: i18n.t("errors.deviceMismatch"), reasonCode: "device_mismatch" };
  }
  if (data.reason === "device_banned") {
    return { allowed: false, reason: i18n.t("errors.deviceBanned"), reasonCode: "device_banned" };
  }

  return { allowed: true };
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
 * Friendly, NON-BLOCKING reminder shown in the final window before
 * expiration when the app is offline or validation is due. Never gates the UI.
 * "blocked" mirrors the local transfer guard, so an expired/trial-ended
 * license surfaces immediately.
 */
export function getValidationReminder(): ValidationReminder {
  const cached = getCachedRaw();
  if (!cached.data) return { show: false, blocked: false, days: null };
  // Permanent licenses can never expire — never surface a near-expiry reminder,
  // even if a stale cache still carries old expiry/trial dates.
  if (cached.data.license_status === "permanent") return { show: false, blocked: false, days: null };

  const policy = getCachedPolicy();
  const guard = getTransferGuard();
  const blocked = !guard.allowed;

  const expiry = policy.license_expiration || cached.data.expiry_date || cached.data.trial_end || null;
  let days: number | null = null;
  if (expiry) {
    days = Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }
  const expiringSoon = policy.validation_policy === "expiring_soon" || (days !== null && days <= 45);
  if (!blocked && !expiringSoon && !(policy.force_validation && needsRefresh())) {
    return { show: false, blocked: false, days };
  }

  const offline = typeof navigator === "undefined" || !navigator.onLine;
  if (blocked) return { show: true, blocked: true, days };
  if (offline || needsRefresh()) return { show: true, blocked: false, days };
  return { show: false, blocked: false, days };
}

export function clearLicenseCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_AGE_KEY);
    localStorage.removeItem(POLICY_KEY);
  } catch {}
}

export function getCacheAgeMs(): number {
  const ageStr = localStorage.getItem(CACHE_AGE_KEY);
  if (!ageStr) return Infinity;
  return Date.now() - parseInt(ageStr, 10);
}
