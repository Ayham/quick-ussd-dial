import { getCredentials, type OperatorCredentials } from "@/lib/ussd-profiles";
import i18n from "@/lib/i18n";

const BUSINESS_NAME_KEY = "business-name";
const BUSINESS_SKIP_KEY = "business-name-skipped";

export function isSimConfigured(credentials: OperatorCredentials): boolean {
  return Boolean(
    (credentials.mtnSecret || "").trim() &&
      (credentials.syriatelSerial || "").trim() &&
      (credentials.syriatelDistributor || "").trim()
  );
}

export function getBusinessName(): string {
  try {
    return (localStorage.getItem(BUSINESS_NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function saveBusinessName(name: string): void {
  try {
    localStorage.setItem(BUSINESS_NAME_KEY, (name || "").trim());
    localStorage.removeItem(BUSINESS_SKIP_KEY);
  } catch {
    /* ignore */
  }
}
