import { supabase } from "@/integrations/supabase/client";
import { getAccessSnapshot, saveAccessSnapshot, mapAccessSnapshot, type AppAccessStatus, type AccessSnapshot } from "./access-state";
import { getDeviceId } from "./device-id";
import { pushEvent } from "./supabase-sync";

export type AdminLicenseAction =
  | "license_activated"
  | "license_deactivated"
  | "license_suspended"
  | "license_reactivated"
  | "license_revoked"
  | "license_extended"
  | "license_expiry_changed"
  | "license_converted_to_permanent"
  | "license_converted_to_temporary"
  | "license_type_changed"
  | "license_reassigned";

export type AppLicenseStatus = AppAccessStatus;

export interface LicenseInfo {
  licenseKey: string;
  status: string;
  level: string;
  expiresAt: string | null;
  permanent: boolean;
  ussdNumbers: string[];
  deviceId: string;
  userId: string | null;
}

export interface TrialInfo {
  deviceId: string;
  startedAt: string;
  expiresAt: string;
  daysTotal: number;
  status: string;
  extendedByAdmin: boolean;
}

export interface ActivationRequest {
  requestToken: string;
  deviceId: string;
  contactName?: string;
  contactPhone?: string;
  ussdNumbers: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export async function getLicenseStatus(): Promise<AppLicenseStatus> {
  const snapshot = getAccessSnapshot();
  if (!snapshot) {
    await refreshLicenseState();
    return mapAccessSnapshot(getAccessSnapshot());
  }
  return mapAccessSnapshot(snapshot);
}

export async function refreshLicenseState(): Promise<AccessSnapshot | null> {
  const deviceId = getDeviceId();
  if (!deviceId || deviceId === "initializing...") return null;

  const { data, error } = await supabase.functions.invoke("device-sync", {
    body: {
      device: {
        device_id: deviceId,
        device_fingerprint: deviceId,
      },
      events: [],
    },
  });

  if (error || !data?.ok || !data?.state) return null;

  const snapshot: AccessSnapshot = {
    ok: true,
    state: data.state,
    reason: data.reason ?? null,
    lifecycle_state: data.lifecycle_state ?? null,
    device: data.device ?? null,
    license: data.license ?? null,
    trial: data.trial ?? null,
    force_update: data.force_update ?? null,
    server_checked_at: new Date().toISOString(),
  };

  saveAccessSnapshot(snapshot);
  return snapshot;
}

export async function getAppStatus(): Promise<AppLicenseStatus> {
  const snapshot = await refreshLicenseState();
  return mapAccessSnapshot(snapshot ?? getAccessSnapshot());
}

export async function activateWithLicenseKey(licenseKey: string): Promise<{ ok: boolean; reason?: string; license?: LicenseInfo }> {
  const trimmed = licenseKey.trim().replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (trimmed.length !== 12) {
    return { ok: false, reason: "format" };
  }

  const deviceId = getDeviceId();
  if (!deviceId || deviceId === "initializing...") {
    return { ok: false, reason: "device_id_pending" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("check-license", {
      body: { license_key: trimmed, device_id: deviceId, fingerprint: deviceId },
    });

    if (error) return { ok: false, reason: "network" };
    if (!data?.valid) return { ok: false, reason: data?.reason || "invalid" };

    await refreshLicenseState();
    pushEvent("license_activated", { license_key: trimmed });

    return { ok: true, license: data.license as LicenseInfo };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function requestActivation(
  contactName?: string,
  contactPhone?: string,
  ussdNumbers: string[] = []
): Promise<ActivationRequest | null> {
  const deviceId = getDeviceId();
  if (!deviceId || deviceId === "initializing...") return null;

  const token = crypto.randomUUID();
  const request: ActivationRequest = {
    requestToken: token,
    deviceId,
    contactName,
    contactPhone,
    ussdNumbers,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.functions.invoke("request-activation", {
      body: {
        device_id: deviceId,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        ussd_numbers: ussdNumbers,
      },
    });

    if (error || !data?.ok) {
      pushEvent("activation_request", { request_token: token, contact_name: contactName, contact_phone: contactPhone, ussd_numbers: ussdNumbers });
    } else {
      request.requestToken = data.token || token;
    }
  } catch {
    pushEvent("activation_request", { request_token: token, contact_name: contactName, contact_phone: contactPhone, ussd_numbers: ussdNumbers });
  }

  localStorage.setItem(`activation_request_${deviceId}`, JSON.stringify(request));
  return request;
}

export async function checkActivationStatus(requestToken: string): Promise<"pending" | "approved" | "rejected" | "error"> {
  try {
    const { data, error } = await supabase
      .from("activations")
      .select("status, license_id")
      .eq("request_token", requestToken)
      .maybeSingle();

    if (error || !data) return "error";

    if (data.status === "approved" && data.license_id) {
      await refreshLicenseState();
    }

    return data.status as "pending" | "approved" | "rejected";
  } catch {
    return "error";
  }
}

export async function approveActivation(requestToken: string, expiryDate: string | null, ussdNumbers: string[] = [], permanent = false): Promise<{ success: boolean; licenseKey?: string; error?: string }> {
  try {
    const { data: activation, error: fetchError } = await supabase
      .from("activations")
      .select("*")
      .eq("request_token", requestToken)
      .maybeSingle();

    if (fetchError || !activation) return { success: false, error: "Activation request not found" };

    const { data: licData, error: licErr } = await supabase.functions.invoke("admin-create-license", {
      body: {
        device_id: activation.device_id,
        expiry_date: permanent ? null : expiryDate,
        permanent,
        user_id: activation.user_id,
        ussd_numbers: ussdNumbers.length > 0 ? ussdNumbers : activation.ussd_numbers,
        notes: `From activation ${requestToken}`,
      },
    });

    if (licErr || !licData?.ok || !licData?.license) {
      return { success: false, error: licData?.error || licErr?.message || "license creation failed" };
    }

    await refreshLicenseState();
    return { success: true, licenseKey: licData.formatted || licData.license.license_key };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function rejectActivation(requestToken: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: activation, error: fetchError } = await supabase
      .from("activations")
      .select("id")
      .eq("request_token", requestToken)
      .maybeSingle();

    if (fetchError || !activation) return { success: false, error: "Activation not found" };

    const { data, error } = await supabase.rpc("admin_decide_activation", {
      _request_id: activation.id,
      _decision: "rejected",
      _license_id: null,
      _notes: reason ?? null,
    });

    if (error || !data?.ok) return { success: false, error: error?.message || data?.reason || "Reject failed" };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export function getLocalActivationRequest(deviceId?: string): ActivationRequest | null {
  const id = deviceId || getDeviceId();
  try {
    const stored = localStorage.getItem(`activation_request_${id}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

export function getCachedLicense(): LicenseInfo | null {
  const snapshot = getAccessSnapshot();
  if (!snapshot?.license) return null;
  return snapshot.license as LicenseInfo;
}

export function getCachedTrial(): TrialInfo | null {
  const snapshot = getAccessSnapshot();
  if (!snapshot?.trial) return null;
  return snapshot.trial as TrialInfo;
}

export async function extendLicense(licenseId: string, newExpiry: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_extend_license", {
      _license_id: licenseId,
      _new_expiry: newExpiry,
    });
    if (error) return { success: false, error: error.message };
    await refreshLicenseState();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function convertLicenseToPermanent(licenseId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_convert_license", {
      _license_id: licenseId,
      _permanent: true,
      _expiry: null,
    });
    if (error) return { success: false, error: error.message };
    await refreshLicenseState();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function setLicenseStatus(licenseId: string, status: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_set_license_status", {
      _license_id: licenseId,
      _status: status,
      _reason: `admin_set_status:${status}`,
    });
    if (error) return { success: false, error: error.message };
    await refreshLicenseState();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function blockDevice(deviceId: string, reason: string = "Blocked by administrator"): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_block_device", {
      _device_id: deviceId,
      _reason: reason,
    });
    if (error) return { success: false, error: error.message };
    await refreshLicenseState();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function unblockDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_unblock_device", {
      _device_id: deviceId,
    });
    if (error) return { success: false, error: error.message };
    await refreshLicenseState();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function isValidLicenseFormat(key: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase());
}

export function normalizeLicenseKey(key: string): string {
  return key.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function formatLicenseKey(key: string): string {
  const n = normalizeLicenseKey(key);
  if (n.length !== 12) return key;
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}