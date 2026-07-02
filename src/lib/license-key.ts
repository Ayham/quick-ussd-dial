/**
 * License key (new short format AB12-CD34-EF56).
 * - 12 chars (A-Z, 2-9, no confusing chars)
 * - Validated server-side via check-license edge function
 * - Cached locally for offline use
 * - No local or legacy key can grant access
 */
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device-id";

const KEY_STORE = "_sys_v2_lk";
const META_STORE = "_sys_v2_lk_meta";

export interface LicenseMeta {
  license_key: string;
  status: string;
  level: string;
  expiry_date: string | null;
  permanent: boolean;
  ussd_numbers: string[];
  cached_at: string;
}

export function normalizeLicenseKey(k: string): string {
  return k.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function formatLicenseKey(k: string): string {
  const n = normalizeLicenseKey(k);
  if (n.length !== 12) return k;
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}

export function isShortFormat(k: string): boolean {
  return normalizeLicenseKey(k).length === 12;
}

export function getSavedShortLicense(): LicenseMeta | null {
  try { return JSON.parse(localStorage.getItem(META_STORE) || "null"); } catch { return null; }
}

export function clearShortLicense() {
  localStorage.removeItem(KEY_STORE);
  localStorage.removeItem(META_STORE);
}

export async function activateLicenseKey(rawKey: string): Promise<{ ok: boolean; reason?: string; meta?: LicenseMeta }> {
  const trimmed = rawKey.trim();
  if (!isShortFormat(trimmed)) {
    return { ok: false, reason: "format" };
  }

  const normalized = normalizeLicenseKey(trimmed);
  const deviceId = getDeviceId();

  try {
    const { data, error } = await supabase.functions.invoke("check-license", {
      body: { license_key: normalized, device_id: deviceId, fingerprint: deviceId },
    });
    if (error) return { ok: false, reason: "network" };
    if (!data?.valid) return { ok: false, reason: data?.reason || "invalid" };

    const meta: LicenseMeta = {
      ...data.license,
      cached_at: new Date().toISOString(),
    };
    localStorage.setItem(KEY_STORE, normalized);
    localStorage.setItem(META_STORE, JSON.stringify(meta));
    return { ok: true, meta };
  } catch {
    return { ok: false, reason: "network" };
  }
}
