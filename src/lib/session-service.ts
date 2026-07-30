import { supabase } from "@/integrations/supabase/client";
import { getLicenseStatus, type LicenseInfo } from "./license";

const SESSION_CHECK_KEY = "app_session_last_check";
const SESSION_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface SessionValidationResult {
  valid: boolean;
  license: LicenseInfo | null;
  reason?: string;
}

export async function validateSession(): Promise<SessionValidationResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { valid: false, license: null, reason: "not_authenticated" };

    const license = await getLicenseStatus();
    if (!license) return { valid: false, license: null, reason: "license_unavailable" };

    if (license.account_status === "suspended") return { valid: false, license, reason: "account_suspended" };
    if (license.account_status === "blocked") return { valid: false, license, reason: "account_blocked" };
    if (license.license_status === "expired") return { valid: false, license, reason: "license_expired" };
    if (license.license_status === "rejected") return { valid: false, license, reason: "activation_rejected" };
    if (license.license_status === "blocked") return { valid: false, license, reason: "license_blocked" };

    if (license.license_status === "trial" && license.trial_end) {
      const trialEnd = new Date(license.trial_end);
      if (trialEnd < new Date()) return { valid: false, license, reason: "trial_expired" };
    }

    if (license.expiry_date && license.license_status !== "permanent") {
      const expiry = new Date(license.expiry_date);
      if (expiry < new Date()) return { valid: false, license, reason: "license_expired" };
    }

    return { valid: true, license };
  } catch {
    return { valid: false, license: null, reason: "validation_error" };
  }
}

export function shouldRefreshSession(): boolean {
  const lastCheck = localStorage.getItem(SESSION_CHECK_KEY);
  if (!lastCheck) return true;
  const elapsed = Date.now() - parseInt(lastCheck, 10);
  return elapsed > SESSION_CHECK_INTERVAL_MS;
}

export async function refreshSessionIfNeeded(): Promise<boolean> {
  if (!shouldRefreshSession()) return true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > SESSION_MAX_AGE_MS) {
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
