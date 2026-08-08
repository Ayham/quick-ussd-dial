import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import i18n from "./i18n";
import { getCachedPolicy } from "./license-cache";

export type LicenseStatus = "trial" | "active" | "expired" | "pending" | "rejected" | "permanent" | "suspended" | "blocked";
export type LicenseType = "trial" | "year_1" | "year_2" | "year_3" | "custom_date" | "lifetime";
export type AccountStatus = "active" | "suspended" | "blocked";

export interface LicenseInfo {
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  trial_start: string | null;
  trial_end: string | null;
  license_status: LicenseStatus;
  license_type: LicenseType;
  expiry_date: string | null;
  current_device: string | null;
  last_login: string | null;
  last_sync: string | null;
  account_status: AccountStatus;
  trial_remaining_days: number | null;
  is_locked: boolean;
}

export async function getLicenseStatus(): Promise<LicenseInfo | null> {
  try {
    const { data, error } = await supabase.rpc("get_user_license_status");
    if (error) throw error;
    return data as unknown as LicenseInfo;
  } catch {
    return null;
  }
}

export async function requestActivation(deviceId: string, contactName?: string, contactPhone?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("request_activation", {
      _device_id: deviceId,
      _contact_name: contactName || null,
      _contact_phone: contactPhone || null,
      _ussd_numbers: [],
    });
    if (error) throw error;
    const result = data as unknown as { success: boolean; error?: string; request_token?: string };
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { success: false, error: msg };
  }
}

export async function checkPendingActivation(): Promise<{ has_pending: boolean; id?: string; status?: string }> {
  try {
    const { data, error } = await supabase.rpc("get_pending_activation_request");
    if (error) throw error;
    return data as unknown as { has_pending: boolean; id?: string; status?: string };
  } catch {
    return { has_pending: false };
  }
}

export async function validateLicense(): Promise<{ valid: boolean; reason?: string; trial_remaining_days?: number | null }> {
  const { data, error } = await supabase.functions.invoke("validate-license", {});
  if (error || !data) return { valid: false, reason: "validation_failed" };
  // Persist the server-controlled validation policy returned by the edge function.
  const result = data as Record<string, unknown> & {
    validation_policy?: Record<string, unknown> | null;
  };
  if (result.validation_policy && typeof result.validation_policy === "object") {
    storeValidationPolicy(result.validation_policy as Record<string, unknown>);
  }
  return data as { valid: boolean; reason?: string; trial_remaining_days?: number | null };
}

// Store the validation policy obtained through the validate-license edge
// function. Reuses license-cache storage so the rest of the client is policy-aware
// even before the background scheduler has run a get_validation_policy() RPC.
function storeValidationPolicy(policy: Record<string, unknown>): void {
  try {
    localStorage.setItem("app_validation_policy", JSON.stringify({
      ...getCachedPolicy(),
      ...policy,
      minimum_validation_interval_ms:
        typeof policy.minimum_validation_interval_ms === "number" ? policy.minimum_validation_interval_ms : getCachedPolicy().minimum_validation_interval_ms,
      offline_grace_ms:
        typeof policy.offline_grace_ms === "number" ? policy.offline_grace_ms : getCachedPolicy().offline_grace_ms,
    }));
  } catch {}
}

export function getTrialRemainingDays(trialEnd: string | null): number {
  if (!trialEnd) return 0;
  const end = new Date(trialEnd);
  const now = new Date();
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function calculateExpiryDate(licenseType: LicenseType, customDate?: string | null): string | null {
  switch (licenseType) {
    case "lifetime":
      return null;
    case "custom_date":
      return customDate || null;
    case "year_1": {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split("T")[0];
    }
    case "year_2": {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 2);
      return d.toISOString().split("T")[0];
    }
    case "year_3": {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 3);
      return d.toISOString().split("T")[0];
    }
    default:
      return null;
  }
}

export function formatLicenseTypeLabel(type: LicenseType, t: any): string {
  const map: Record<string, string> = {
    trial: t("activation.trialType"),
    year_1: t("activation.year1"),
    year_2: t("activation.year2"),
    year_3: t("activation.year3"),
    custom_date: t("activation.customDate"),
    lifetime: t("activation.lifetime"),
  };
  return map[type] || type;
}

export function shouldShowTrialWarning(licenseInfo: LicenseInfo | null): { show: boolean; days: number } | null {
  if (!licenseInfo) return null;
  if (licenseInfo.license_status !== "trial") return null;
  if (licenseInfo.account_status === "suspended" || licenseInfo.account_status === "blocked") return null;
  const days = getTrialRemainingDays(licenseInfo.trial_end);
  if (days > 0 && days <= 3) return { show: true, days };
  return null;
}
