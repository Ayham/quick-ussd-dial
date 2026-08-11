import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_SETTINGS_CACHE_KEY,
  EMPTY_CONTACT_SETTINGS,
  adminUpdateContactSettings,
  buildEmailUrl,
  buildFacebookUrl,
  buildWhatsAppUrl,
  fetchContactSettingsLive,
  getCachedContactSettings,
  getContactSettingsUpdatedAt,
  normalizeContactSettings,
  refreshContactSettings,
  saveContactSettingsCache,
} from "./contact-settings";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

const LIVE_PAYLOAD = {
  whatsapp_enabled: true,
  whatsapp_number: "+963912345678",
  whatsapp_url: "",
  email_enabled: true,
  email_address: "support@raseed.app",
  facebook_enabled: false,
  facebook_url: "https://www.facebook.com/raseed",
  updated_at: "2026-08-13T10:00:00.000Z",
};

const CACHED = {
  whatsapp: { enabled: true, number: "+963911111111", url: "" },
  email: { enabled: true, address: "cached@raseed.app" },
  facebook: { enabled: true, url: "https://www.facebook.com/cached" },
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("normalizeContactSettings", () => {
  it("maps the flat RPC payload into the typed nested shape", () => {
    const s = normalizeContactSettings(LIVE_PAYLOAD);
    expect(s.whatsapp.enabled).toBe(true);
    expect(s.whatsapp.number).toBe("+963912345678");
    expect(s.email.address).toBe("support@raseed.app");
    expect(s.facebook.enabled).toBe(false);
    expect(s.updatedAt).toBe("2026-08-13T10:00:00.000Z");
  });

  it("treats null / garbage as empty defaults", () => {
    expect(normalizeContactSettings(null)).toEqual(EMPTY_CONTACT_SETTINGS);
    expect(normalizeContactSettings("nope")).toEqual(EMPTY_CONTACT_SETTINGS);
    expect(normalizeContactSettings({ whatsapp_enabled: "yes" }).whatsapp.enabled).toBe(false);
  });
});

describe("local cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty defaults when nothing is cached", () => {
    expect(getCachedContactSettings()).toEqual(EMPTY_CONTACT_SETTINGS);
    expect(getContactSettingsUpdatedAt()).toBe("");
  });

  it("stores and reads a typed copy", () => {
    saveContactSettingsCache(CACHED);
    expect(getCachedContactSettings()).toEqual(CACHED);
    expect(getContactSettingsUpdatedAt()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("ignores a malformed cache", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify({ nope: true }));
    expect(getCachedContactSettings()).toEqual(EMPTY_CONTACT_SETTINGS);
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, "not json");
    expect(getCachedContactSettings()).toEqual(EMPTY_CONTACT_SETTINGS);
  });
});

describe("link builders", () => {
  it("WhatsApp: uses the custom URL when present", () => {
    expect(buildWhatsAppUrl({ ...CACHED, whatsapp: { enabled: true, number: "+9639", url: "https://wa.me/999?text=hi" } }))
      .toBe("https://wa.me/999?text=hi");
  });

  it("WhatsApp: builds wa.me from the number when no custom URL", () => {
    expect(buildWhatsAppUrl(CACHED)).toBe("https://wa.me/963911111111");
  });

  it("WhatsApp: empty when no number and no URL", () => {
    expect(buildWhatsAppUrl(EMPTY_CONTACT_SETTINGS)).toBe("");
  });

  it("Email: uses mailto with the stored address", () => {
    expect(buildEmailUrl(CACHED)).toBe("mailto:cached@raseed.app");
    expect(buildEmailUrl(EMPTY_CONTACT_SETTINGS)).toBe("");
  });

  it("Facebook: uses the stored page URL", () => {
    expect(buildFacebookUrl(CACHED)).toBe("https://www.facebook.com/cached");
    expect(buildFacebookUrl(EMPTY_CONTACT_SETTINGS)).toBe("");
  });
});

describe("online fetch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads settings from Supabase and stores them locally", async () => {
    rpcMock.mockResolvedValueOnce({ data: LIVE_PAYLOAD, error: null });
    const s = await fetchContactSettingsLive();
    expect(rpcMock).toHaveBeenCalledWith("get_contact_settings");
    expect(s.whatsapp.number).toBe("+963912345678");
    expect(getCachedContactSettings().email.address).toBe("support@raseed.app");
  });

  it("refresh updates the cache when online and the server is newer", async () => {
    saveContactSettingsCache(CACHED);
    rpcMock.mockResolvedValueOnce({ data: LIVE_PAYLOAD, error: null });
    const s = await refreshContactSettings();
    expect(s.updatedAt).toBe("2026-08-13T10:00:00.000Z");
    expect(getContactSettingsUpdatedAt()).toBe("2026-08-13T10:00:00.000Z");
  });

  it("refresh does NOT replace the cache when the request fails", async () => {
    saveContactSettingsCache(CACHED);
    rpcMock.mockRejectedValueOnce(new Error("offline"));
    const s = await refreshContactSettings();
    expect(s).toEqual(CACHED);
    expect(getCachedContactSettings()).toEqual(CACHED);
  });

  it("refresh does not throw on network failure", async () => {
    rpcMock.mockRejectedValueOnce(new Error("boom"));
    await expect(refreshContactSettings()).resolves.toEqual(EMPTY_CONTACT_SETTINGS);
  });
});

describe("offline behaviour", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setOnline(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the last cache without any network call", async () => {
    saveContactSettingsCache(CACHED);
    const s = await refreshContactSettings();
    expect(s).toEqual(CACHED);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never attempts a network request repeatedly", async () => {
    saveContactSettingsCache(CACHED);
    await refreshContactSettings();
    await refreshContactSettings();
    await refreshContactSettings();
    expect(rpcMock).toHaveBeenCalledTimes(0);
  });
});

describe("admin write", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setOnline(true);
  });

  it("calls the admin RPC with the flattened payload and refreshes the cache", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, updated_at: "2026-08-13T12:00:00.000Z" }, error: null });
    const result = await adminUpdateContactSettings({
      whatsapp: { enabled: true, number: "+963912345678", url: "" },
      email: { enabled: false, address: "" },
      facebook: { enabled: true, url: "https://www.facebook.com/x" },
      updatedAt: "",
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_update_contact_settings", expect.objectContaining({
      p_whatsapp_enabled: true,
      p_email_enabled: false,
      p_facebook_url: "https://www.facebook.com/x",
    }));
    expect(result.ok).toBe(true);
    expect(getCachedContactSettings().updatedAt).toBe("2026-08-13T12:00:00.000Z");
  });

  it("propagates RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "forbidden" } });
    await expect(adminUpdateContactSettings(CACHED)).rejects.toThrow();
  });
});
