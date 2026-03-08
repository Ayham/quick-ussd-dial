/**
 * GitHub Releases — جلب التحديثات من ريبو GitHub العام
 * يستخدم GitHub API لجلب الإصدارات بدلاً من Google Sheets
 */

import type { AppRelease } from './marketing';

const GITHUB_REPO = 'mobi1298-del/ussd';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const CACHE_KEY = 'github_releases_cache_v1';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

interface CachedData {
  releases: AppRelease[];
  timestamp: number;
}

function mapGitHubRelease(gh: GitHubRelease, isLatest: boolean): AppRelease {
  // Find APK asset
  const apkAsset = gh.assets.find(a => a.name.endsWith('.apk'));
  const downloadUrl = apkAsset?.browser_download_url || '';

  return {
    id: gh.tag_name,
    version: gh.tag_name.replace(/^v/i, ''),
    downloadUrl,
    changelog: gh.body || '',
    releaseDate: gh.published_at?.split('T')[0] || '',
    isLatest,
  };
}

function getCached(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CachedData = JSON.parse(raw);
    if (Date.now() - data.timestamp < CACHE_TTL) return data;
  } catch {}
  return null;
}

function setCache(releases: AppRelease[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ releases, timestamp: Date.now() }));
}

/** Fetch all releases from GitHub */
export async function fetchReleasesFromGitHub(): Promise<AppRelease[]> {
  // Return cache if fresh
  const cached = getCached();
  if (cached) return cached.releases;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(GITHUB_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    clearTimeout(timeout);

    if (!res.ok) return getCached()?.releases || [];

    const data: GitHubRelease[] = await res.json();
    const published = data.filter(r => !r.draft);

    const releases = published.map((r, i) => mapGitHubRelease(r, i === 0));
    setCache(releases);
    return releases;
  } catch {
    return getCached()?.releases || [];
  }
}

/** Get latest release info for update checking */
export async function getLatestGitHubRelease(): Promise<{
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${GITHUB_API}/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const gh: GitHubRelease = await res.json();
    const apkAsset = gh.assets.find(a => a.name.endsWith('.apk'));

    return {
      version: gh.tag_name.replace(/^v/i, ''),
      downloadUrl: apkAsset?.browser_download_url || '',
      changelog: gh.body || '',
      releaseDate: gh.published_at?.split('T')[0] || '',
    };
  } catch {
    return null;
  }
}
