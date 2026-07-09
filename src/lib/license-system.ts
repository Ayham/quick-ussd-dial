import { supabase } from "@/integrations/supabase/client";
import { adminRpc } from "./admin-rpc";

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

type LicensePatch = {
  device_id?: string | null;
  status?: string;
  level?: string;
  expiry_date?: string | null;
  permanent?: boolean;
};

function rpcResult(data: unknown, error: { message: string } | null) {
  if (error) return { success: false, error: error.message };
  const result = data as { ok?: boolean; reason?: string } | null;
  return result?.ok
    ? { success: true }
    : { success: false, error: result?.reason || "Admin operation failed" };
}

export async function adminUpdateLicense(
  licenseId: string,
  patch: LicensePatch,
  action: AdminLicenseAction,
): Promise<{ success: boolean; error?: string }> {
  if (patch.device_id !== undefined) {
    if (!patch.device_id) return { success: false, error: "A target device is required" };
    const { data, error } = await supabase.rpc("admin_transfer_license", {
      _license_id: licenseId,
      _new_device_id: patch.device_id,
      _reason: action,
    });
    return rpcResult(data, error);
  }

  if (patch.permanent !== undefined) {
    const { data, error } = await supabase.rpc("admin_convert_license", {
      _license_id: licenseId,
      _permanent: patch.permanent,
      _expiry: patch.permanent ? null : patch.expiry_date || null,
    });
    return rpcResult(data, error);
  }

  if (patch.expiry_date !== undefined) {
    if (!patch.expiry_date) return { success: false, error: "Expiry date is required" };
    const { data, error } = await supabase.rpc("admin_extend_license", {
      _license_id: licenseId,
      _new_expiry: patch.expiry_date,
    });
    return rpcResult(data, error);
  }

  if (patch.status !== undefined) {
    const status = patch.status === "inactive" ? "expired" : patch.status;
    const { data, error } = await supabase.rpc("admin_set_license_status", {
      _license_id: licenseId,
      _status: status,
      _reason: action,
    });
    return rpcResult(data, error);
  }

  return { success: false, error: "No supported change was supplied" };
}

export async function adminGenerateLicenses(
  count: number,
  expiryDate: string | null,
  permanent: boolean,
  ussdNumbers: string[] = [],
  deviceId: string,
): Promise<{ success: boolean; keys: string[]; error?: string }> {
  const targetDevice = deviceId.trim();
  if (!targetDevice) return { success: false, keys: [], error: "A device ID is required" };
  if (count !== 1) {
    return { success: false, keys: [], error: "Device-bound licenses must be created one at a time" };
  }

  const { data, error } = await supabase.functions.invoke("admin-create-license", {
    body: {
      device_id: targetDevice,
      expiry_date: permanent ? null : expiryDate,
      permanent,
      ussd_numbers: ussdNumbers,
    },
  });
  if (error || !data?.ok || !data?.license?.license_key) {
    return { success: false, keys: [], error: data?.error || error?.message || "Failed to generate license" };
  }
  return { success: true, keys: [data.formatted || data.license.license_key] };
}

export function isValidLicenseFormat(key: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase());
}
