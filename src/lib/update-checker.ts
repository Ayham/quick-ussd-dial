/**
 * Update Checker — التحقق من وجود تحديثات
 * يجلب أحدث نسخة من Google Sheets ويقارنها مع النسخة الحالية
 */

import { getAppConfig } from './marketing';
import { getSyncEndpoint } from './cloud-sync';

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

// Get current app version
export function getCurrentVersion(): string {
  // First check localStorage (set by admin), then fallback to config
  const stored = localStorage.getItem(CURRENT_VERSION_KEY);
  if (stored) return stored;
  return getAppConfig().appVersion || '1.0.0';
}

export function setCurrentVersion(version: string) {
  localStorage.setItem(CURRENT_VERSION_KEY, version);
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

// Check for updates via the sync endpoint
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

  const endpoint = getSyncEndpoint();
  if (!endpoint) return noUpdate;

  try {
    const url = `${endpoint}?action=getLatestRelease`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return noUpdate;
    const data = await res.json();

    if (!data.version) return noUpdate;

    const hasUpdate = isNewerVersion(data.version, currentVersion);

    const result: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion: data.version,
      downloadUrl: data.downloadUrl || '',
      changelog: data.changelog || '',
      releaseDate: data.releaseDate || '',
      forceUpdate: data.forceUpdate === true || hasUpdate, // Force by default
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
