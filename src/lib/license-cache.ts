import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device";
import type { LicenseInfo } from "./license";

const CACHE_KEY = "app_license_cache";
const CACHE_AGE_KEY = "app_license_cache_age";
const REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_OFFLINE_GRACE_MS = 1000 * 60 * 60 * 24; // 7 days

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

function needsRefresh(): boolean {
  const ageStr = localStorage.getItem(CACHE_AGE_KEY);
  if (!ageStr) return true;
  const age = parseInt(ageStr, 10);
  return Date.now() - age > REFRESH_INTERVAL_MS;
}

export async function validateDeviceSession(): Promise<ValidationResult> {
  try {
    const deviceId = getDeviceId();
    const { data, error } = await supabase.rpc("validate_device_session", { _device_id: deviceId });
    if (error) throw error;
    const result = data as unknown as ValidationResult;
    setCachedRaw(result);
    return result;
  } catch {
    const cached = getCachedRaw();
    if (cached.data && cached.age <= MAX_OFFLINE_GRACE_MS) return cached.data;
    return { valid: false, reason: "no_connection", error: "تعذر التحقق / Unable to verify" };
  }
}

export function getCachedValidation(): ValidationResult | null {
  return getCachedRaw().data;
}

export async function refreshLicenseCacheIfNeeded(): Promise<ValidationResult | null> {
  if (!needsRefresh()) return getCachedRaw().data;
  return validateDeviceSession();
}

export function getTransferGuard(): TransferGuardResult {
  const cached = getCachedRaw();
  if (!cached.data) return { allowed: false, reason: "unverified" };
  if (cached.age > MAX_OFFLINE_GRACE_MS) return { allowed: false, reason: "offline_grace_expired" };

  if (cached.account_status === "suspended") {
    return { allowed: false, reason: "حسابك موقوف / Account suspended" };
  }
  if (cached.account_status === "blocked") {
    return { allowed: false, reason: "حسابك محظور / Account blocked" };
  }
  if (cached.license_status === "expired") {
    return { allowed: false, reason: "انتهت صلاحية الترخيص / License expired" };
  }
  if (cached.license_status === "rejected") {
    return { allowed: false, reason: "تم رفض طلب التفعيل / Activation rejected" };
  }
  if (cached.license_status === "blocked") {
    return { allowed: false, reason: "الترخيص محظور / License blocked" };
  }
  if (cached.license_status === "trial" && cached.trial_end) {
    const trialEnd = new Date(cached.trial_end);
    if (trialEnd < new Date()) {
      return { allowed: false, reason: "انتهت الفترة التجريبية / Trial ended" };
    }
  }
  if (cached.license_status === "inactive" || cached.license_status === "pending") {
    return { allowed: false, reason: "الترخيص غير نشط / License inactive" };
  }

  if (cached.reason === "device_mismatch") {
    return { allowed: false, reason: "هذا الحساب مسجل على جهاز آخر / Another device registered" };
  }

  return { allowed: true };
}

export function clearLicenseCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_AGE_KEY);
  } catch {}
}

export function getCacheAgeMs(): number {
  const ageStr = localStorage.getItem(CACHE_AGE_KEY);
  if (!ageStr) return Infinity;
  return Date.now() - parseInt(ageStr, 10);
}
