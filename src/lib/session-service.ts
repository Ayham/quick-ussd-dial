import { supabase } from "@/integrations/supabase/client";
import { getLicenseStatus, type LicenseInfo } from "./license";
import { getCachedPolicy } from "./license-cache";
import { computeLicenseDecision } from "./license-decision";
import { getTrustedNowMs } from "./trusted-clock";
import i18n from "@/lib/i18n";

const SESSION_CHECK_KEY = "app_session_last_check";
// Local defaults until the first server policy is received.
const DEFAULT_SESSION_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export interface SessionValidationResult {
  valid: boolean;
  license: LicenseInfo | null;
  reason?: string;
  /**
   * True only for account-level locks (suspended/blocked). The caller clears
   * the local session so the user is forced back to the login screen. License
   * level states (expired, revoked, trial-ended…) keep the session so the user
   * sees the in-app banners / activation screen instead.
   */
  requiresLogout: boolean;
}

export async function validateSession(): Promise<SessionValidationResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { valid: false, license: null, reason: i18n.t("auth.notAuthenticated"), requiresLogout: false };

    const license = await getLicenseStatus();
    if (!license) return { valid: false, license: null, reason: i18n.t("license.unavailable"), requiresLogout: false };

    // Single source of truth: the license/account decision is computed by the
    // same module the UI and the local transfer guard use.
    const decision = computeLicenseDecision({ authenticated: true, userId: license.user_id }, license);
    return {
      valid: decision.canOpenApp,
      license,
      reason: decision.reason ?? undefined,
      requiresLogout: decision.requiresLogout,
    };
  } catch {
    return { valid: false, license: null, reason: i18n.t("license.validationError"), requiresLogout: false };
  }
}

export function shouldRefreshSession(): boolean {
  const lastCheck = localStorage.getItem(SESSION_CHECK_KEY);
  if (!lastCheck) return true;
  // Prefer the trusted monotonic clock when available (fall back to Date.now()
  // for this non-security cadence decision only).
  const nowMs = getTrustedNowMs() ?? Date.now();
  const elapsed = nowMs - parseInt(lastCheck, 10);
  const interval = getCachedPolicy().minimum_validation_interval_ms || DEFAULT_SESSION_CHECK_INTERVAL_MS;
  return elapsed > interval;
}

export async function refreshSessionIfNeeded(): Promise<boolean> {
  if (!shouldRefreshSession()) return true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const lastSignIn = session.user.last_sign_in_at ?? session.user.created_at;
    const sessionAge = (getTrustedNowMs() ?? Date.now()) - new Date(lastSignIn).getTime();
    if (sessionAge > DEFAULT_SESSION_MAX_AGE_MS) {
      const { error } = await supabase.auth.refreshSession();
      if (error) return false;
    }

    localStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export async function validateAndRefreshSession(): Promise<SessionValidationResult> {
  await refreshSessionIfNeeded();
  return validateSession();
}

export function clearSessionCheck() {
  localStorage.removeItem(SESSION_CHECK_KEY);
}
