import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_CACHE_MAX_AGE_MS, ACCESS_SNAPSHOT_KEY } from "./access-state";
import { getAppStatus } from "./license";

function cache(state: string, extra: Record<string, unknown> = {}, checkedAt = new Date().toISOString()) {
  localStorage.setItem(ACCESS_SNAPSHOT_KEY, JSON.stringify({
    ok: true,
    state,
    server_checked_at: checkedAt,
    ...extra,
  }));
}

describe("server-authoritative app access", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("allows a permanent license only from a heartbeat snapshot", async () => {
    cache("license_active", {
      license: { status: "active", expiry_date: null, permanent: true },
    });
    await expect(getAppStatus()).resolves.toEqual({
      status: "licensed",
      expiryDate: "permanent",
      daysLeft: Infinity,
      permanent: true,
    });
  });

  it("allows an active server trial", async () => {
    cache("trial_active", {
      trial: { status: "active", expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString() },
    });
    await expect(getAppStatus()).resolves.toMatchObject({ status: "trial" });
  });

  it.each([
    ["blocked", "blocked"],
    ["fingerprint_mismatch", "blocked"],
    ["suspended", "suspended"],
    ["revoked", "license_expired"],
    ["license_expired", "license_expired"],
    ["trial_expired", "trial_expired"],
    ["maintenance", "maintenance"],
  ])("maps %s to %s", async (serverState, appState) => {
    cache(serverState);
    await expect(getAppStatus()).resolves.toMatchObject({ status: appState });
  });

  it("blocks a forced update and preserves the minimum version", async () => {
    cache("force_update", {
      force_update: { enabled: true, minimum_version: "0.5.0", latest_version: "0.6.0" },
    });
    await expect(getAppStatus()).resolves.toEqual({
      status: "force_update",
      minimumVersion: "0.5.0",
      latestVersion: "0.6.0",
    });
  });

  it("surfaces the server reason for blocked and expired gate states", async () => {
    cache("blocked", { reason: "Device was blocked by admin" });
    await expect(getAppStatus()).resolves.toEqual({
      status: "blocked",
      reason: "Device was blocked by admin",
    });

    cache("suspended", { reason: "Account suspended by admin" });
    await expect(getAppStatus()).resolves.toEqual({
      status: "suspended",
      reason: "Account suspended by admin",
    });

    cache("license_expired", { reason: "License expired" });
    await expect(getAppStatus()).resolves.toEqual({
      status: "license_expired",
      reason: "License expired",
    });
  });

  it("does not allow legacy local license data to grant access", async () => {
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      status: "active", permanent: true,
    }));
    localStorage.setItem("_sys_v2_lk_meta", JSON.stringify({
      status: "active", permanent: true,
    }));
    await expect(getAppStatus()).resolves.toEqual({ status: "offline_expired" });
  });

  it("expires offline authorization after the bounded cache window", async () => {
    cache(
      "license_active",
      { license: { status: "active", permanent: true } },
      new Date(Date.now() - ACCESS_CACHE_MAX_AGE_MS - 1_000).toISOString(),
    );
    await expect(getAppStatus()).resolves.toEqual({ status: "offline_expired" });
  });
});
