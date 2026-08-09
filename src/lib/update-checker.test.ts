import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, fetchUpdatePolicy, isForcedDismissed, dismissForcedUpdate, type UpdateInfo } from "./update-checker";
import { supabase } from "@/integrations/supabase/client";
import { getLatestGitHubRelease } from "./github-releases";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("@/config/version", () => ({
  APP_VERSION: "1.0.6",
}));

vi.mock("./github-releases", () => ({
  getLatestGitHubRelease: vi.fn(),
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const ghMock = getLatestGitHubRelease as unknown as ReturnType<typeof vi.fn>;

const POLICY_CACHE_KEY = "app_update_policy_cache_v1";
const UPDATE_CACHE_KEY = "app_update_check_v1";

function policyResult(p: Record<string, unknown> = {}) {
  return { data: { minimum_version: "", latest_version: "", download_url: "", notes: "", ...p }, error: null };
}

function ghRelease(v: { version: string; downloadUrl: string; changelog: string; releaseDate: string }) {
  return { version: v.version, downloadUrl: v.downloadUrl, changelog: v.changelog, releaseDate: v.releaseDate };
}

describe("fetchUpdatePolicy", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns a normalized policy from the server", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.7", download_url: "https://x/a.apk" }));
    const policy = await fetchUpdatePolicy();
    expect(policy.minimumVersion).toBe("1.0.7");
    expect(policy.downloadUrl).toBe("https://x/a.apk");
    expect(rpcMock).toHaveBeenCalledWith("get_update_policy");
  });

  it("caches the policy and skips network calls within the TTL", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.7" }));
    await fetchUpdatePolicy();
    await fetchUpdatePolicy();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("forceLive bypasses the cache", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.7" }));
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.8" }));
    const first = await fetchUpdatePolicy();
    const second = await fetchUpdatePolicy(true);
    expect(first.minimumVersion).toBe("1.0.7");
    expect(second.minimumVersion).toBe("1.0.8");
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to stale cache on server error", async () => {
    localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify({ policy: { minimumVersion: "1.0.9", latestVersion: "", downloadUrl: "", notes: "" }, timestamp: Date.now() }));
    rpcMock.mockRejectedValueOnce(new Error("offline"));
    const policy = await fetchUpdatePolicy();
    expect(policy.minimumVersion).toBe("1.0.9");
  });

  it("drops invalid minimum versions", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "nonsense" }));
    const policy = await fetchUpdatePolicy();
    expect(policy.minimumVersion).toBe("");
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("advisory update: newer remote, no minimum -> updateAvailable, not forced", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({}));
    ghMock.mockResolvedValueOnce(ghRelease({ version: "1.0.7", downloadUrl: "https://x/1.0.7.apk", changelog: "hi", releaseDate: "2026-08-01" }));
    const info = await checkForUpdate();
    expect(info.hasUpdate).toBe(true);
    expect(info.updateAvailable).toBe(true);
    expect(info.forced).toBe(false);
    expect(info.latestVersion).toBe("1.0.7");
    expect(info.downloadUrl).toBe("https://x/1.0.7.apk");
  });

  it("forced update: minimum > current -> forced true", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.8", latest_version: "1.0.8", download_url: "https://x/1.0.8.apk" }));
    ghMock.mockResolvedValueOnce(ghRelease({ version: "1.0.8", downloadUrl: "https://x/1.0.8.apk", changelog: "", releaseDate: "2026-08-02" }));
    const info = await checkForUpdate();
    expect(info.forced).toBe(true);
    expect(info.minimumVersion).toBe("1.0.8");
    expect(info.latestVersion).toBe("1.0.8");
    expect(info.downloadUrl).toBe("https://x/1.0.8.apk");
  });

  it("server latest_version overrides GitHub version", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ latest_version: "1.1.0", download_url: "https://x/1.1.0.apk" }));
    ghMock.mockResolvedValueOnce(ghRelease({ version: "1.0.7", downloadUrl: "https://x/1.0.7.apk", changelog: "gh", releaseDate: "2026-08-01" }));
    const info = await checkForUpdate();
    expect(info.latestVersion).toBe("1.1.0");
    expect(info.downloadUrl).toBe("https://x/1.1.0.apk");
    expect(info.changelog).toBe("gh");
  });

  it("no update when current >= latest and no minimum", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({}));
    ghMock.mockResolvedValueOnce(ghRelease({ version: "1.0.6", downloadUrl: "", changelog: "", releaseDate: "" }));
    const info = await checkForUpdate();
    expect(info.hasUpdate).toBe(false);
    expect(info.updateAvailable).toBe(false);
    expect(info.forced).toBe(false);
  });

  it("never forces on an equal-to-minimum version", async () => {
    rpcMock.mockResolvedValueOnce(policyResult({ minimum_version: "1.0.6" }));
    ghMock.mockResolvedValueOnce(ghRelease({ version: "1.0.8", downloadUrl: "", changelog: "", releaseDate: "" }));
    const info = await checkForUpdate();
    expect(info.forced).toBe(false);
    expect(info.updateAvailable).toBe(true);
  });

  it("falls back to cached update info on policy + github failure", async () => {
    const cached: UpdateInfo = {
      hasUpdate: true, currentVersion: "1.0.6", latestVersion: "1.0.7", downloadUrl: "https://x/1.0.7.apk",
      changelog: "cached", releaseDate: "2026-08-01", updateAvailable: true, forced: false,
      minimumVersion: "", notes: "",
    };
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(cached));
    rpcMock.mockRejectedValueOnce(new Error("offline"));
    ghMock.mockRejectedValueOnce(new Error("offline"));
    const info = await checkForUpdate();
    expect(info).toEqual(cached);
  });
});

describe("forced-dismiss helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is forced-dismissed only within the 24h window", () => {
    expect(isForcedDismissed(Date.now())).toBe(false);
    dismissForcedUpdate();
    expect(isForcedDismissed(Date.now())).toBe(true);
  });

  it("treats an expired dismissal as not dismissed", () => {
    localStorage.setItem("app_forced_update_dismissed_at", String(Date.now() - 25 * 60 * 60 * 1000));
    expect(isForcedDismissed(Date.now())).toBe(false);
  });
});
