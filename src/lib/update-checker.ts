/**
 * Update Checker — التحقق من وجود تحديثات
 * يجلب أحدث نسخة من GitHub Releases ويقارنها مع النسخة الحالية
 */

import { getAppConfig } from './marketing';
import { getLatestGitHubRelease } from './github-releases';

const CURRENT_VERSION_KEY = 'app_current_version';
const UPDATE_CHECK_KEY = 'app_update_check_v1';
const UPDATE_SKIP_KEY = 'app_update_skip_v1';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  forceUpdate: boolean;
}

export const APP_VERSION: string = __APP_VERSION__;

// Get current app version
export function getCurrentVersion(): string {
  // Always use the bundled APP_VERSION as the true installed version
  return APP_VERSION;
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

// For skipping (not used in forced mode, but kept for flexibility)
export function getSkippedVersion(): string | null {
  return localStorage.getItem(UPDATE_SKIP_KEY);
}

export function skipVersion(version: string) {
  localStorage.setItem(UPDATE_SKIP_KEY, version);
}
