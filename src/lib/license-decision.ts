import type { ValidationResult } from "./license-cache";
import type { LicenseInfo } from "./license";

/**
 * Single source of truth for license/account decisions on the client.
 *
 * This module mirrors the server-side `computeLicenseDecision()` used by the
 * `validate-license` / `validate-session` edge functions so the client and the
 * server always agree on what a license state means. It is PURE (no network,
 * no storage writes) and synchronous: components can call it during render.
 *
 * Decision matrix (must stay in sync with the edge functions):
 *  - account suspended / blocked          → app fully locked + local sign-out
 *  - trial active                         → app usable, transfers allowed
 *  - trial ended                          → app stays usable, transfers blocked
 *  - license active / permanent           → fully usable
 *  - license expired                      → app usable, transfers blocked
 *  - license revoked / blocked            → app usable, transfers blocked
 *  - license pending / inactive / rejected→ app usable, transfers blocked
 *
 * @param auth Authenticated context of the current user.
 * @param data The license snapshot (server verdict or cached verdict).
 * @param context Optional extra signals (e.g. the cached policy's `revoked`
 *                flag used by the local transfer guard).
 */
export type DecisionInput =
  | Pick<LicenseInfo, "license_status" | "account_status" | "trial_end" | "expiry_date">
  | Pick<ValidationResult, "license_status" | "account_status" | "trial_end" | "expiry_date">;

export type LicenseStatus =
  | "trial"
  | "active"
  | "expired"
  | "pending"
  | "rejected"
  | "permanent"
  | "suspended"
  | "blocked"
  | "revoked"
  | "inactive"
  | "unknown";

export type AccountStatus = "active" | "suspended" | "blocked" | "unknown";

export interface AuthContextState {
  authenticated: boolean;
  userId: string | null;
}

export interface LicenseDecisionContext {
  /** Server-side revocation flag from the cached validation policy. */
  revoked?: boolean;
  /**
   * Trusted "now" (ms) supplied by the caller (e.g. the trusted clock in the
   * transfer guard). Defaults to `Date.now()` for UI-only computations.
   */
  now?: number;
}

export interface LicenseDecision {
  licenseStatus: LicenseStatus;
  accountStatus: AccountStatus;
  /** Whole days remaining until the effective boundary (null when permanent / undated). */
  daysRemaining: number | null;
  /** Whether the app shell may be opened. */
  canOpenApp: boolean;
  /** Whether protected features (transfers) are usable. */
  canTransfer: boolean;
  /** Whether the local session must be cleared (account-level lock). */
  requiresLogout: boolean;
  /** Human-readable / machine-readable reason (matches the edge functions). */
  reason: string | null;
  /** Coarse reason code used for gating logic and UI mapping. */
  reasonCode: string | null;
}

function normalizeStatus(value: string | null | undefined, fallback: LicenseStatus): LicenseStatus {
  if (!value) return fallback;
  const v = value.toLowerCase();
  return v === "trial" || v === "active" || v === "expired" || v === "pending" || v === "rejected" ||
    v === "permanent" || v === "suspended" || v === "blocked" || v === "revoked" || v === "inactive"
    ? (v as LicenseStatus)
    : "unknown";
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function computeDaysRemaining(licenseStatus: LicenseStatus, nowMs: number, trialEnd?: string | null, expiryDate?: string | null): number | null {
  if (licenseStatus === "permanent") return null;
  const boundary = licenseStatus === "trial" ? trialEnd : expiryDate;
  const ms = toMs(boundary);
  if (ms === null) return null;
  return Math.max(0, Math.floor((ms - nowMs) / (1000 * 60 * 60 * 24)));
}

function decision(partial: Omit<LicenseDecision, "licenseStatus" | "accountStatus" | "daysRemaining"> & { licenseStatus: LicenseStatus; accountStatus: AccountStatus; daysRemaining: number | null }): LicenseDecision {
  return partial;
}

export function computeLicenseDecision(
  _auth: AuthContextState,
  data: DecisionInput | null | undefined,
  context: LicenseDecisionContext = {},
): LicenseDecision {
  if (!data) {
    return decision({
      licenseStatus: "unknown",
      accountStatus: "unknown",
      daysRemaining: null,
      canOpenApp: false,
      canTransfer: false,
      requiresLogout: false,
      reason: "unverified",
      reasonCode: "unverified",
    });
  }

  const accountStatus: AccountStatus =
    data.account_status === "suspended" || data.account_status === "blocked" ? data.account_status : "active";
  const licenseStatus = normalizeStatus(data.license_status, "inactive");
  const nowMs = typeof context.now === "number" && Number.isFinite(context.now) ? context.now : Date.now();
  const daysRemaining = computeDaysRemaining(licenseStatus, nowMs, data.trial_end, data.expiry_date);

  const base = {
    licenseStatus,
    accountStatus,
    daysRemaining,
  };

  // Account-level status is the highest priority (mirrors the edge functions).
  if (accountStatus === "suspended") {
    return decision({
      ...base,
      canOpenApp: false,
      canTransfer: false,
      requiresLogout: true,
      reason: "account_suspended",
      reasonCode: "suspended",
    });
  }
  if (accountStatus === "blocked") {
    return decision({
      ...base,
      canOpenApp: false,
      canTransfer: false,
      requiresLogout: true,
      reason: "account_blocked",
      reasonCode: "blocked",
    });
  }

  // Server-side revocation flag (from the cached validation policy). A revoked
  // license keeps the app usable but always blocks protected transfers. Only
  // reached when the account itself is not suspended/blocked and the license is
  // not suspended — those more-severe states must never be masked by a stale
  // (or concurrent) revocation flag.
  if (context.revoked && licenseStatus !== "suspended") {
    return decision({
      ...base,
      canOpenApp: true,
      canTransfer: false,
      requiresLogout: false,
      reason: "license_revoked",
      reasonCode: "revoked",
    });
  }

  switch (licenseStatus) {
    case "trial": {
      const trialEndMs = toMs(data.trial_end);
      if (trialEndMs !== null && nowMs >= trialEndMs) {
        return decision({
          ...base,
          canOpenApp: true,
          canTransfer: false,
          requiresLogout: false,
          reason: "trial_ended",
          reasonCode: "trial_ended",
        });
      }
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: true,
        requiresLogout: false,
        reason: "ok",
        reasonCode: null,
      });
    }
    case "active": {
      const expiryMs = toMs(data.expiry_date);
      if (expiryMs !== null && nowMs >= expiryMs) {
        return decision({
          ...base,
          canOpenApp: true,
          canTransfer: false,
          requiresLogout: false,
          reason: "expired",
          reasonCode: "expired",
        });
      }
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: true,
        requiresLogout: false,
        reason: "ok",
        reasonCode: null,
      });
    }
    case "permanent":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: true,
        requiresLogout: false,
        reason: "ok",
        reasonCode: null,
      });
    case "expired":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "expired",
        reasonCode: "expired",
      });
    case "rejected":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "activation_rejected",
        reasonCode: "activation_rejected",
      });
    case "pending":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "activation_pending",
        reasonCode: "inactive",
      });
    case "inactive":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "inactive",
        reasonCode: "inactive",
      });
    case "revoked":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "license_revoked",
        reasonCode: "revoked",
      });
    case "blocked":
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "license_blocked",
        reasonCode: "license_blocked",
      });
    case "suspended":
      return decision({
        ...base,
        canOpenApp: false,
        canTransfer: false,
        requiresLogout: true,
        reason: "suspended",
        reasonCode: "suspended",
      });
    default:
      return decision({
        ...base,
        canOpenApp: true,
        canTransfer: false,
        requiresLogout: false,
        reason: "unknown_status",
        reasonCode: "unknown_status",
      });
  }
}
