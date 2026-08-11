import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import About from "./About";
import { CONTACT_SETTINGS_CACHE_KEY } from "@/lib/contact-settings";
import { supabase } from "@/integrations/supabase/client";
import "@/lib/i18n";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    total: 0,
    loading: false,
    refreshing: false,
    error: null,
    hasMore: false,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    toggleFavorite: vi.fn(),
    dismiss: vi.fn(),
    acknowledge: vi.fn(),
    markAllReadLocal: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
  isAdminUser: vi.fn().mockResolvedValue(false),
  signOut: vi.fn(),
}));

vi.mock("@/lib/onboarding", () => ({
  getBusinessName: () => "",
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

const ALL_ENABLED = {
  whatsapp: { enabled: true, number: "+963912345678", url: "" },
  email: { enabled: true, address: "support@raseed.app" },
  facebook: { enabled: true, url: "https://www.facebook.com/raseed" },
  updatedAt: "2026-08-13T10:00:00.000Z",
};

const WHATSAPP_ONLY = {
  whatsapp: { enabled: true, number: "+963912345678", url: "https://wa.me/963912345678" },
  email: { enabled: false, address: "" },
  facebook: { enabled: false, url: "" },
  updatedAt: "2026-08-13T10:00:00.000Z",
};

const ALL_DISABLED = {
  whatsapp: { enabled: false, number: "", url: "" },
  email: { enabled: false, address: "" },
  facebook: { enabled: false, url: "" },
  updatedAt: "2026-08-13T10:00:00.000Z",
};

describe("About page", () => {
  beforeEach(() => {
    localStorage.clear();
    setOnline(false);
  });

  it("shows app name, version (from the central source) and copyright", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(ALL_DISABLED));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(screen.getByText("رصيد Raseed")).toBeInTheDocument();
    expect(screen.getByText("v1.2.1")).toBeInTheDocument();
    expect(screen.getByText("معلومات التطبيق")).toBeInTheDocument();
    expect(screen.getByText("حقوق النشر")).toBeInTheDocument();
  });

  it("renders every enabled channel with the correct contact link", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(ALL_ENABLED));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    const wa = screen.getByRole("link", { name: /واتساب/ });
    expect(wa.getAttribute("href")).toBe("https://wa.me/963912345678");

    const email = screen.getByRole("link", { name: /البريد الإلكتروني/ });
    expect(email.getAttribute("href")).toBe("mailto:support@raseed.app");

    const fb = screen.getByRole("link", { name: /فيسبوك/ });
    expect(fb.getAttribute("href")).toBe("https://www.facebook.com/raseed");
  });

  it("uses a custom WhatsApp URL when provided", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify({
      ...ALL_ENABLED,
      whatsapp: { enabled: true, number: "", url: "https://wa.me/963900000000?text=hi" },
    }));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /واتساب/ }).getAttribute("href")).toBe("https://wa.me/963900000000?text=hi");
  });

  it("hides disabled channels", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(WHATSAPP_ONLY));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /واتساب/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /البريد الإلكتروني/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /فيسبوك/ })).not.toBeInTheDocument();
  });

  it("shows a friendly placeholder when no contact info is enabled", () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(ALL_DISABLED));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(screen.getByText("لا توجد معلومات تواصل متاحة")).toBeInTheDocument();
  });

  it("offline: renders from the local cache and never calls the network", async () => {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(ALL_ENABLED));
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(screen.getByText("رصيد Raseed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /واتساب/ })).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("online: silently refreshes in the background and updates the UI on arrival", async () => {
    setOnline(true);
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(WHATSAPP_ONLY));
    rpcMock.mockResolvedValueOnce({
      data: {
        whatsapp_enabled: true,
        whatsapp_number: "+963912345678",
        whatsapp_url: "",
        email_enabled: true,
        email_address: "support@raseed.app",
        facebook_enabled: false,
        facebook_url: "",
        updated_at: "2026-08-13T11:00:00.000Z",
      },
      error: null,
    });

    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    // Cache rendered immediately.
    expect(screen.getByText("رصيد Raseed")).toBeInTheDocument();

    // New email channel appears after the background refresh lands.
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /البريد الإلكتروني/ })).toBeInTheDocument();
    });
    expect(rpcMock).toHaveBeenCalledWith("get_contact_settings");
  });
});
