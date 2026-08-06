/**
 * Update Checker — التحقق من وجود تحديثات
 * يجلب أحدث نسخة من GitHub Releases ويقارنها مع النسخة الحالية
 */

import { getLatestGitHubRelease } from './github-releases';
import { APP_VERSION as CONFIG_VERSION } from '../config/version';
import i18n from "@/lib/i18n";

const UPDATE_CHECK_KEY = 'app_update_check_v1';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  forceUpdate: boolean;
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

// Compare versions: returns true if remote > local
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.replace(/[^0-9.]/g, '').split('.').map(Number);
  const l = local.replace(/[^0-9.]/g, '').split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// Check for updates via GitHub Releases API
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  const noUpdate: UpdateInfo = {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    downloadUrl: '',
    changelog: '',
    releaseDate: '',
    forceUpdate: false,
  };

  try {
    const latest = await getLatestGitHubRelease();
    if (!latest || !latest.version) return noUpdate;

    const hasUpdate = isNewerVersion(latest.version, currentVersion);

    const result: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion: latest.version,
      downloadUrl: latest.downloadUrl,
      changelog: latest.changelog,
      releaseDate: latest.releaseDate,
      forceUpdate: hasUpdate,
    };

    // Cache result
    localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify(result));
    return result;
  } catch {
    // Return cached result if offline
    try {
      const cached = localStorage.getItem(UPDATE_CHECK_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
    return noUpdate;
  }
}

