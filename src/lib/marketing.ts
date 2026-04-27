/**
 * Marketing & App Config
 * إدارة الباقات والتحديثات والروابط
 * يجلب النسخ من Google Sheets مع fallback لـ localStorage
 */

import { getSyncEndpoint } from './cloud-sync';

const PACKAGES_KEY = 'app-packages-v1';
const APP_CONFIG_KEY = 'app-config-v1';
const RELEASES_KEY = 'app-releases-v1';

export interface AppPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: string; // 'monthly' | 'yearly' | 'lifetime' | 'trial'
  durationLabel: string;
  features: string[];
  popular?: boolean;
  enabled: boolean;
}

export interface AppRelease {
  id: string;
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  isLatest: boolean;
}

export interface AppConfig {
  appVersion: string;
  downloadUrl: string;
  whatsappContact: string;
  supportPhone: string;
  changelog: string;
  heroTitle: string;
  heroSubtitle: string;
}

const DEFAULT_PACKAGES: AppPackage[] = [];

const DEFAULT_CONFIG: AppConfig = {
  appVersion: '1.0.0',
  downloadUrl: 'https://github.com/mobi1298-del/ussd/releases/download/1/1.apk',
  whatsappContact: '',
  supportPhone: '0991214570',
  changelog: 'الإصدار الأول من التطبيق',
  heroTitle: 'تحويل الرصيد بلمسة واحدة',
  heroSubtitle: 'أسرع وأسهل طريقة لتحويل رصيد سيريتل و MTN في سوريا',
};

export function getPackages(): AppPackage[] {
  try {
    const stored = localStorage.getItem(PACKAGES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_PACKAGES];
}

export function savePackages(packages: AppPackage[]) {
  localStorage.setItem(PACKAGES_KEY, JSON.stringify(packages));
}

export function getAppConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(APP_CONFIG_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveAppConfig(config: AppConfig) {
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
}

// ======= Releases (localStorage) =======

export function getReleases(): AppRelease[] {
  try {
    const stored = localStorage.getItem(RELEASES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function saveReleases(releases: AppRelease[]) {
  localStorage.setItem(RELEASES_KEY, JSON.stringify(releases));
}

export function addRelease(release: Omit<AppRelease, 'id'>): AppRelease[] {
  const releases = getReleases();
  if (release.isLatest) {
    releases.forEach(r => r.isLatest = false);
  }
  const newRelease: AppRelease = { ...release, id: crypto.randomUUID() };
  releases.unshift(newRelease);
  saveReleases(releases);
  return releases;
}

export function deleteRelease(id: string): AppRelease[] {
  const releases = getReleases().filter(r => r.id !== id);
  saveReleases(releases);
  return releases;
}

export function getLatestRelease(): AppRelease | undefined {
  return getReleases().find(r => r.isLatest) || getReleases()[0];
}

// ======= Releases (Cloud — Google Sheets) =======

export async function fetchReleasesFromCloud(): Promise<AppRelease[]> {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${endpoint}?action=listReleases`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();

    if (data.success && Array.isArray(data.releases)) {
      return data.releases as AppRelease[];
    }
  } catch {}
  return [];
}

export async function addReleaseToCloud(release: {
  version: string;
  downloadUrl: string;
  changelog?: string;
  releaseDate?: string;
}): Promise<boolean> {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return false;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addRelease', ...release }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function deleteReleaseFromCloud(version: string): Promise<boolean> {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return false;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteRelease', version }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
