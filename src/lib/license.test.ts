import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppStatus } from "./license";

vi.mock("./device-id", () => ({
  getDeviceId: vi.fn(() => "device-1"),
}));

vi.mock("./trial-guard", () => ({
  getProtectedTrial: vi.fn(() => Promise.resolve({ status: "expired", daysLeft: 0 })),
}));

describe("getAppStatus remote synced license", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("treats a synced permanent device license as licensed", async () => {
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "active",
      expiry_date: null,
      permanent: true,
      ussd_numbers: [],
    }));

    await expect(getAppStatus()).resolves.toEqual({
      status: "licensed",
      expiryDate: "permanent",
      daysLeft: Infinity,
      permanent: true,
    });
  });

  it("treats a synced expiring device license as licensed until its expiry date", async () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "active",
      expiry_date: future,
      permanent: false,
      ussd_numbers: [],
    }));

    const status = await getAppStatus();
    expect(status.status).toBe("licensed");
    expect(status).toMatchObject({ expiryDate: future });
    expect("permanent" in status).toBe(false);
  });

  it("blocks the app when a synced license is revoked", async () => {
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "revoked",
      expiry_date: null,
      permanent: true,
      ussd_numbers: [],
    }));

    await expect(getAppStatus()).resolves.toEqual({ status: "blocked" });
  });

  it("enters suspended mode when a synced license is suspended", async () => {
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "suspended",
      expiry_date: null,
      permanent: true,
      ussd_numbers: [],
    }));

    await expect(getAppStatus()).resolves.toEqual({ status: "suspended" });
  });

  it("uses modified synced expiry dates immediately", async () => {
    const future = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "active",
      expiry_date: future,
      permanent: false,
      ussd_numbers: [],
    }));

    await expect(getAppStatus()).resolves.toMatchObject({ status: "licensed", expiryDate: future });
  });

  it("uses permanent conversion from synced license data immediately", async () => {
    localStorage.setItem("_sys_remote_license_v1", JSON.stringify({
      license_key: "ABCD2345EFGH",
      status: "active",
      expiry_date: null,
      permanent: true,
      ussd_numbers: [],
    }));

    await expect(getAppStatus()).resolves.toMatchObject({ status: "licensed", expiryDate: "permanent", permanent: true });
  });
});
