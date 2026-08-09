/**
 * Update Checker — التحقق من وجود تحديثات
 * يقرأ سياسة التحديث الإجباري من قاعدة البيانات (RPC get_update_policy)
 * ثم يقارن أحدث إصدار من GitHub Releases مع النسخة الحالية.
 */

import { getLatestGitHubRelease } from './github-releases';
import { APP_VERSION as CONFIG_VERSION } from '../config/version';
import { supabase } from '@/integrations/supabase/client';
import i18n from "@/lib/i18n";
import { isNewerVersion, compareVersions, isValidVersion } from "./version";

const UPDATE_CHECK_KEY = 'app_update_check_v1';
const POLICY_CACHE_KEY = 'app_update_policy_cache_v1';
const POLICY_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export interface UpdatePolicy {
  /** Minimum version the server accepts. Below this the app is forcibly updated. */
  minimumVersion: string;
  /** APK download URL that overrides the GitHub release asset (optional). */
  downloadUrl: string;
  /** Latest known version per the server (optional, authoritative for "latest"). */
  latestVersion: string;
  /** Free-form notes shown to the user (optional). */
  notes: string;
}

export const DEFAULT_UPDATE_POLICY: UpdatePolicy = {
  minimumVersion: '',
  downloadUrl: '',
  latestVersion: '',
  notes: '',
};

// Forced-update dismiss (optional "remind me in 24h" for the blocking gate).
export const FORCED_DISMISS_KEY = 'app_forced_update_dismissed_at';
export const FORCED_DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when the user recently dismissed the forced-update gate. */
export function isForcedDismissed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(FORCED_DISMISS_KEY);
    if (!raw) return false;
    return now - Number(raw) < FORCED_DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Persist a forced-update dismissal (used by the 24h "remind me later" option). */
export function dismissForcedUpdate(): void {
  try {
    localStorage.setItem(FORCED_DISMISS_KEY, String(Date.now()));
  } catch {}
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  /** True when a newer version exists (advisory). */
  updateAvailable: boolean;
  /** True when the current app is below the enforced minimum. */
  forced: boolean;
  /** Minimum version required by the server ('' when not enforced). */
  minimumVersion: string;
  /** Server-provided notes (optional). */
  notes: string;
}

export const updateMessages = {
  error: i18n.t("errors"),
  downloadFailed: i18n.t("errors.apkDownloadGeneric"),
  filePathNotFound: i18n.t("errors.apkDownloadFailed"),
  backupInvalid: i18n.t("errors.invalidBackupFile"),
  backupMissingVersion: i18n.t("errors.backupMissingVersion"),
  backupUnsupportedVersion: i18n.t("errors.backupUnsupportedVersion"),
  backupNoRestorableData: i18n.t("errors.backupNoRestorableData"),
  wrongPassword: i18n.t("errors.wrongPassword"),
  encryptedDataPasswordRequired: i18n.t("errors.encryptedDataPasswordRequired"),
  invalidData: i18n.t("errors.invalidData"),
  invalidFile: i18n.t("errors.invalidFile"),
  failedReadFile: i18n.t("errors.failedReadFile"),
  invalidDataStructure: i18n.t("errors.invalidDataStructure"),
  noConnection: i18n.t("errors.noConnection"),
  accountSuspended: i18n.t("errors.accountSuspended"),
  accountBlocked: i18n.t("errors.accountBlocked"),
  licenseExpired: i18n.t("errors.licenseExpired"),
  activationRejected: i18n.t("errors.activationRejected"),
  licenseBlocked: i18n.t("errors.licenseBlocked"),
  trialEnded: i18n.t("errors.trialEnded"),
  licenseInactive: i18n.t("errors.licenseInactive"),
  deviceMismatch: i18n.t("errors.deviceMismatch"),
  noOAuthUrl: i18n.t("errors.noOAuthUrl"),
  noAuthCode: i18n.t("errors.noAuthCode"),
  notAuthenticated: i18n.t("errors.notAuthenticated"),
  emailRequired: i18n.t("errors.emailRequired"),
  invalidEmail: i18n.t("errors.invalidEmail"),
  phoneTooShort: i18n.t("errors.phoneTooShort"),
  passwordRequired: i18n.t("errors.passwordRequired"),
  passwordTooShort: i18n.t("errors.passwordTooShort"),
  passwordsMismatch: i18n.t("errors.passwordsMismatch"),
};

// Get current app version
export function getCurrentVersion(): string {
  return CONFIG_VERSION;
}

export interface UpdatePolicyCache {
  policy: UpdatePolicy;
  timestamp: number;
}

function isUpdatePolicy(value: unknown): value is UpdatePolicy {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.minimumVersion === 'string' ||
    typeof obj.downloadUrl === 'string' ||
    typeof obj.latestVersion === 'string' ||
    typeof obj.notes === 'string'
  );
}

/** Read the update policy from Supabase, with a short-lived local cache. */
export async function fetchUpdatePolicy(forceLive = false): Promise<UpdatePolicy> {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(POLICY_CACHE_KEY);
    if (raw && !forceLive) {
      const cached: UpdatePolicyCache = JSON.parse(raw);
      if (cached && isUpdatePolicy(cached.policy) && now - cached.timestamp < POLICY_CACHE_TTL) {
        return cached.policy;
      }
    }
  } catch {}

  try {
    const { data, error } = await supabase.rpc('get_update_policy');
    if (error) throw error;
    const policy = normalizePolicy(data);
    try {
      localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify({ policy, timestamp: now }));
    } catch {}
    return policy;
  } catch {
    // Fall back to cached policy even when stale.
    try {
      const raw = localStorage.getItem(POLICY_CACHE_KEY);
      if (raw) {
        const cached: UpdatePolicyCache = JSON.parse(raw);
        if (cached && isUpdatePolicy(cached.policy)) return cached.policy;
      }
    } catch {}
    return { ...DEFAULT_UPDATE_POLICY };
  }
}

function normalizePolicy(data: unknown): UpdatePolicy {
  if (data === null || typeof data !== 'object') return { ...DEFAULT_UPDATE_POLICY };
  const obj = data as Record<string, unknown>;
  const toStr = (key: string) => (typeof obj[key] === 'string' ? obj[key] as string : '');

  let minimumVersion = toStr('minimum_version');
  if (!isValidVersion(minimumVersion)) minimumVersion = '';
  let latestVersion = toStr('latest_version');
  if (!isValidVersion(latestVersion)) latestVersion = '';

  return {
    minimumVersion,
    downloadUrl: toStr('download_url'),
    latestVersion,
    notes: toStr('notes'),
  };
}

function readCachedUpdateInfo(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(UPDATE_CHECK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UpdateInfo;
  } catch {
    return null;
  }
}

function buildResult(args: {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  minimumVersion: string;
  notes: string;
}): UpdateInfo {
  const currentVersion = args.currentVersion;
  const latestVersion = args.latestVersion;
  const minimumVersion = args.minimumVersion;

  const updateAvailable = isValidVersion(latestVersion) && isNewerVersion(latestVersion, currentVersion);
  const forced = isValidVersion(minimumVersion) && compareVersions(currentVersion, minimumVersion) < 0;

  return {
    hasUpdate: updateAvailable || forced,
    currentVersion,
    latestVersion: updateAvailable ? latestVersion : currentVersion,
    downloadUrl: args.downloadUrl,
    changelog: args.changelog,
    releaseDate: args.releaseDate,
    updateAvailable,
    forced,
    minimumVersion,
    notes: args.notes,
  };
}

// Check for updates via policy + GitHub Releases API
// Pass forceLive = true to bypass the cached policy and always hit the server.
export async function checkForUpdate(forceLive = false): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  const cached = readCachedUpdateInfo();

  try {
    const policy = await fetchUpdatePolicy(forceLive);

    let latest = await getLatestGitHubRelease();

    // Server-provided latestVersion (if any) wins over GitHub metadata.
    if (policy.latestVersion) {
      latest = {
        version: policy.latestVersion,
        downloadUrl: policy.downloadUrl || latest?.downloadUrl || '',
        changelog: latest?.changelog || '',
        releaseDate: latest?.releaseDate || '',
      };
    }

    // Server-provided download URL overrides the release asset.
    const downloadUrl = policy.downloadUrl || latest?.downloadUrl || '';
    const changelog = latest?.changelog || '';
    const releaseDate = latest?.releaseDate || '';

    if (latest && !policy.latestVersion) {
      // Keep GitHub metadata as-is unless policy already overrode it.
    }

    const result = buildResult({
      currentVersion,
      latestVersion: latest?.version || (isValidVersion(policy.latestVersion) ? policy.latestVersion : currentVersion),
      downloadUrl,
      changelog,
      releaseDate,
      minimumVersion: policy.minimumVersion,
      notes: policy.notes,
    });

    try {
      localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify(result));
    } catch {}

    return result;
  } catch {
    // Online check failed — surface the last known update state (if any).
    return cached ?? {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      downloadUrl: '',
      changelog: '',
      releaseDate: '',
      updateAvailable: false,
      forced: false,
      minimumVersion: '',
      notes: '',
    };
  }
}

/** Convenience helper used by UI: only the most relevant flag. */
export function shouldShowUpdatePrompt(info: UpdateInfo): boolean {
  return info.updateAvailable || info.forced;
}
