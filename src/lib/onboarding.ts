import { getCredentials, type OperatorCredentials } from "@/lib/ussd-profiles";

const BUSINESS_NAME_KEY = "business-name";
const BUSINESS_SKIP_KEY = "business-name-skipped";
const PROFILE_SKIP_KEY = "profile-skipped";
const SKIP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isSimConfigured(credentials?: OperatorCredentials): boolean {
  const c = credentials ?? getCredentials();
  return Boolean(
    (c.mtnSecret || "").trim() &&
      (c.syriatelSerial || "").trim() &&
      (c.syriatelDistributor || "").trim()
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

export function clearBusinessName(): void {
  try {
    localStorage.removeItem(BUSINESS_NAME_KEY);
    localStorage.removeItem(BUSINESS_SKIP_KEY);
  } catch {
    /* ignore */
  }
}

function isSkippedRecently(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    const ts = Number(stored);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SKIP_GRACE_MS;
  } catch {
    return false;
  }
}

export function shouldPromptBusinessName(): boolean {
  if (getBusinessName()) return false;
  return !isSkippedRecently(BUSINESS_SKIP_KEY);
}

export function skipBusinessName(): void {
  try {
    localStorage.setItem(BUSINESS_SKIP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function shouldPromptProfile(profileIncomplete: boolean): boolean {
  if (!profileIncomplete) return false;
  return !isSkippedRecently(PROFILE_SKIP_KEY);
}

export function skipProfile(): void {
  try {
    localStorage.setItem(PROFILE_SKIP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearProfileSkip(): void {
  try {
    localStorage.removeItem(PROFILE_SKIP_KEY);
  } catch {
    /* ignore */
  }
}
