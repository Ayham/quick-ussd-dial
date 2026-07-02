import { getAccessSnapshot, mapAccessSnapshot, type AppAccessStatus } from "./access-state";

const LEGACY_LICENSE_KEY = "_sys_v1_lk";

export interface LicensePayload {
  deviceId: string;
  expiryDate: string;
  version?: string;
}

export type AppLicenseStatus = AppAccessStatus;

/**
 * Compatibility-only storage helpers. Values stored here never grant access;
 * access is derived exclusively from the last successful server heartbeat.
 */
export function saveLicense(licenseKey: string) {
  localStorage.setItem(LEGACY_LICENSE_KEY, licenseKey);
}

export function getSavedLicense(): string | null {
  return localStorage.getItem(LEGACY_LICENSE_KEY);
}

export function clearLicense() {
  localStorage.removeItem(LEGACY_LICENSE_KEY);
}

export async function validateLicense(): Promise<{ valid: false; error: string }> {
  return { valid: false, error: "Legacy offline licenses are not supported" };
}

export async function getAppStatus(): Promise<AppLicenseStatus> {
  return mapAccessSnapshot(getAccessSnapshot());
}
