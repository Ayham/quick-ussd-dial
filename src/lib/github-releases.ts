/**
 * GitHub Releases — جلب التحديثات من ريبو GitHub العام
 * يستخدم GitHub API لجلب الإصدارات بدلاً من Google Sheets
 */

import type { AppRelease } from './marketing';
import { isValidVersion } from "./version";

const GITHUB_REPO = 'mobi1298-del/ussd';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const CACHE_KEY = 'github_releases_cache_v1';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const FETCH_TIMEOUT_MS = 8000;

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

/** Best APK asset: prefer a release APK whose name embeds the version, fallback to any .apk. */
function pickApkAsset(gh: GitHubRelease): GitHubRelease['assets'][number] | undefined {
  const apks = gh.assets.filter(a => a.name.toLowerCase().endsWith('.apk'));
  if (apks.length === 0) return undefined;
  const versionToken = gh.tag_name.replace(/^v/i, '');
  if (versionToken) {
    const match = apks.find(a => a.name.toLowerCase().includes(versionToken.toLowerCase()));
    if (match) return match;
  }
  return apks[0];
}

function mapGitHubRelease(gh: GitHubRelease, isLatest: boolean): AppRelease | null {
  const version = gh.tag_name.replace(/^v/i, '');
  if (!isValidVersion(version)) return null;

  const apkAsset = pickApkAsset(gh);

  return {
    id: gh.tag_name,
    version,
    downloadUrl: apkAsset?.browser_download_url || '',
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
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ releases, timestamp: Date.now() }));
  } catch {}
}

async function fetchFromGitHub(path: string, signal?: AbortSignal): Promise<GitHubRelease[]> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    signal,
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('GitHub API returned unexpected payload');
  return data;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise
    .catch(err => {
      if (controller.signal.aborted) throw new Error('timeout');
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

/** Fetch all published, non-draft releases from GitHub (stable only). */
export async function fetchReleasesFromGitHub(): Promise<AppRelease[]> {
  // Return cache if fresh
  const cached = getCached();
  if (cached) return cached.releases;

  try {
    const releases = await withTimeout(fetchFromGitHub('', undefined), FETCH_TIMEOUT_MS);
    const stable = releases
      .filter(r => !r.draft && !r.prerelease)
      .map((r, i) => mapGitHubRelease(r, i === 0))
      .filter((r): r is AppRelease => r !== null);

    setCache(stable);
    return stable;
  } catch {
    return getCached()?.releases || [];
  }
}

/** Get latest stable release info for update checking. */
export async function getLatestGitHubRelease(): Promise<{
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
} | null> {
  try {
    const releases = await withTimeout(fetchFromGitHub('', undefined), FETCH_TIMEOUT_MS);
    const stable = releases.find(r => !r.draft && !r.prerelease && isValidVersion(r.tag_name.replace(/^v/i, '')));
    if (!stable) return null;
    const mapped = mapGitHubRelease(stable, true);
    if (!mapped) return null;
    return {
      version: mapped.version,
      downloadUrl: mapped.downloadUrl,
      changelog: mapped.changelog,
      releaseDate: mapped.releaseDate,
    };
  } catch {
    return null;
  }
}

/** Export shared constants for tooling/tests. */
export const githubConfig = {
  repo: GITHUB_REPO,
  cacheKey: CACHE_KEY,
  cacheTtl: CACHE_TTL,
  fetchTimeoutMs: FETCH_TIMEOUT_MS,
};
