import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReleasesFromGitHub, getLatestGitHubRelease } from "./github-releases";

function makeRelease(overrides: Partial<{
  tag_name: string; body: string; published_at: string; draft: boolean; prerelease: boolean;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}> = {}): any {
  return {
    tag_name: "v1.0.6",
    body: "First release",
    published_at: "2026-08-01T10:00:00Z",
    draft: false,
    prerelease: false,
    assets: [{ name: "app-1.0.6.apk", browser_download_url: "https://example.com/1.0.6.apk", size: 100 }],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("fetchReleasesFromGitHub", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns published stable releases mapped to AppRelease", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({ tag_name: "v1.0.7", body: "new stuff" }),
      makeRelease({ tag_name: "v1.0.6" }),
    ])));
    vi.stubGlobal("fetch", fetchMock);

    const releases = await fetchReleasesFromGitHub();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe("1.0.7");
    expect(releases[0].isLatest).toBe(true);
    expect(releases[0].downloadUrl).toBe("https://example.com/1.0.6.apk");
    expect(releases[1].isLatest).toBe(false);
  });

  it("drops drafts and prereleases", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({ tag_name: "v1.1.0-rc.1", prerelease: true }),
      makeRelease({ tag_name: "v1.0.9", draft: true }),
      makeRelease({ tag_name: "v1.0.8" }),
    ]))));
    const releases = await fetchReleasesFromGitHub();
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe("1.0.8");
  });

  it("ignores releases with non-semver tags", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({ tag_name: "latest" }),
      makeRelease({ tag_name: "1.0.8" }),
    ]))));
    const releases = await fetchReleasesFromGitHub();
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe("1.0.8");
  });

  it("prefers an APK asset whose name contains the version token", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({
        tag_name: "v2.3.4",
        assets: [
          { name: "app-arm64.apk", browser_download_url: "https://example.com/arm64.apk", size: 10 },
          { name: "app-2.3.4.apk", browser_download_url: "https://example.com/2.3.4.apk", size: 10 },
        ],
      }),
    ]))));
    const releases = await fetchReleasesFromGitHub();
    expect(releases[0].downloadUrl).toBe("https://example.com/2.3.4.apk");
  });

  it("returns cached releases when the API fails", async () => {
    // Seed the cache first via a successful (stubbed) fetch.
    const seeded = [makeRelease({ tag_name: "v1.0.8" })];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(seeded))));
    await fetchReleasesFromGitHub();

    // Now make the network fail and confirm the cached result is returned.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
    const releases = await fetchReleasesFromGitHub();
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe("1.0.8");
  });

  it("caches results for CACHE_TTL then refetches", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([makeRelease({ tag_name: "v1.0.8" })])));
    vi.stubGlobal("fetch", fetchMock);

    await fetchReleasesFromGitHub();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within TTL: no new fetch.
    await fetchReleasesFromGitHub();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After TTL: refetch.
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    await fetchReleasesFromGitHub();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getLatestGitHubRelease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the latest stable release", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({ tag_name: "v1.0.9-prerelease", prerelease: true }),
      makeRelease({ tag_name: "v1.0.8", body: "stable latest" }),
      makeRelease({ tag_name: "v1.0.7" }),
    ]))));
    const latest = await getLatestGitHubRelease();
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe("1.0.8");
    expect(latest!.changelog).toBe("stable latest");
  });

  it("returns null when no stable release exists", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([
      makeRelease({ tag_name: "v2.0.0-rc.1", prerelease: true }),
    ]))));
    expect(await getLatestGitHubRelease()).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await getLatestGitHubRelease()).toBeNull();
  });
});
