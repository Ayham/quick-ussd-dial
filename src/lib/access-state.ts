export const ACCESS_SNAPSHOT_KEY = "_sys_access_snapshot_v1";
export const ACCESS_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface AccessSnapshot {
  ok: boolean;
  state: string;
  reason?: string | null;
  lifecycle_state?: string | null;
  device?: Record<string, unknown> | null;
  license?: {
    status?: string;
    expiry_date?: string | null;
    permanent?: boolean;
    [key: string]: unknown;
  } | null;
  trial?: {
    status?: string;
    expires_at?: string | null;
    [key: string]: unknown;
  } | null;
  force_update?: {
    enabled?: boolean;
    minimum_version?: string | null;
    latest_version?: string | null;
    maintenance?: boolean;
  } | null;
  server_checked_at: string;
}

export type AppAccessStatus =
  | { status: "trial"; daysLeft: number }
  | { status: "licensed"; expiryDate: string; daysLeft: number; permanent?: boolean }
  | { status: "trial_expired"; reason?: string }
  | { status: "license_expired"; reason?: string }
  | { status: "blocked"; reason?: string }
  | { status: "suspended"; reason?: string }
  | { status: "maintenance" }
  | { status: "force_update"; minimumVersion?: string; latestVersion?: string }
  | { status: "offline_expired" };

function daysUntil(value: string): number {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function saveAccessSnapshot(snapshot: Omit<AccessSnapshot, "server_checked_at">): AccessSnapshot {
  const stored: AccessSnapshot = {
    ...snapshot,
    server_checked_at: new Date().toISOString(),
  };
  localStorage.setItem(ACCESS_SNAPSHOT_KEY, JSON.stringify(stored));
  return stored;
}

export function getAccessSnapshot(): AccessSnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCESS_SNAPSHOT_KEY) || "null") as AccessSnapshot | null;
    if (!value?.server_checked_at || !value.state) return null;
    return value;
  } catch {
    return null;
  }
}

export function isAccessSnapshotFresh(snapshot: AccessSnapshot): boolean {
  const checkedAt = new Date(snapshot.server_checked_at).getTime();
  return Number.isFinite(checkedAt) && Date.now() - checkedAt <= ACCESS_CACHE_MAX_AGE_MS;
}

export function mapAccessSnapshot(snapshot: AccessSnapshot | null): AppAccessStatus {
  if (!snapshot || !isAccessSnapshotFresh(snapshot)) {
    return { status: "offline_expired" };
  }

  switch (snapshot.state) {
    case "license_active": {
      const permanent = snapshot.license?.permanent === true;
      const expiryDate = permanent ? "permanent" : snapshot.license?.expiry_date;
      if (!expiryDate) return { status: "license_expired" };
      return {
        status: "licensed",
        expiryDate,
        daysLeft: permanent ? Infinity : daysUntil(expiryDate),
        ...(permanent ? { permanent: true } : {}),
      };
    }
    case "trial_active":
      return {
        status: "trial",
        daysLeft: snapshot.trial?.expires_at ? daysUntil(snapshot.trial.expires_at) : 0,
      };
    case "suspended":
      return { status: "suspended", reason: snapshot.reason || undefined };
    case "blocked":
    case "device_mismatch":
    case "fingerprint_mismatch":
      return { status: "blocked", reason: snapshot.reason || snapshot.state };
    case "license_expired":
    case "revoked":
      return { status: "license_expired", reason: snapshot.reason || undefined };
    case "trial_expired":
      return { status: "trial_expired", reason: snapshot.reason || undefined };
    case "maintenance":
      return { status: "maintenance" };
    case "force_update":
      return {
        status: "force_update",
        minimumVersion: snapshot.force_update?.minimum_version || undefined,
        latestVersion: snapshot.force_update?.latest_version || undefined,
      };
    default:
      return { status: "trial_expired" };
  }
}
