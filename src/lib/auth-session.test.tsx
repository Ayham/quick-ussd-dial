import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

import { AuthSessionProvider, RequireAuth } from "./auth-session";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  isAdminUser: vi.fn(),
  listenForOAuthCallback: vi.fn(),
  getInitialDeepLink: vi.fn(),
  handleOAuthDeepLink: vi.fn(),
  validateAndRefreshSession: vi.fn(),
  registerDeviceLogin: vi.fn(),
  refreshLicenseCacheIfNeeded: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  isAdminUser: mocks.isAdminUser,
  listenForOAuthCallback: mocks.listenForOAuthCallback,
  getInitialDeepLink: mocks.getInitialDeepLink,
  handleOAuthDeepLink: mocks.handleOAuthDeepLink,
}));

vi.mock("@/lib/session-service", () => ({
  validateAndRefreshSession: mocks.validateAndRefreshSession,
}));

vi.mock("@/lib/device", () => ({
  registerDeviceLogin: mocks.registerDeviceLogin,
}));

vi.mock("@/lib/license-cache", () => ({
  refreshLicenseCacheIfNeeded: mocks.refreshLicenseCacheIfNeeded,
}));

const testUser = { id: "u1", email: "a@b.com" } as User;

function setup(sessionUser: User | null) {
  mocks.getSession.mockResolvedValue({ data: { session: sessionUser ? { user: sessionUser } : null }, error: null });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.listenForOAuthCallback.mockResolvedValue(() => {});
  mocks.getInitialDeepLink.mockResolvedValue(null);
  mocks.validateAndRefreshSession.mockResolvedValue({ valid: true });
  mocks.registerDeviceLogin.mockResolvedValue({ success: true });
  mocks.refreshLicenseCacheIfNeeded.mockResolvedValue(null);
  mocks.isAdminUser.mockResolvedValue(false);
}

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthSessionProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div>PROTECTED_CONTENT</div>
              </RequireAuth>
            }
          />
          <Route path="/auth" element={<div>AUTH_PAGE</div>} />
        </Routes>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

describe("authentication is independent of network/license state", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("keeps an authenticated user logged in when the network is down", async () => {
    setup(testUser);
    // The background session refresh fails with a network error while offline.
    mocks.getUser.mockRejectedValue(new Error("NetworkError"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });

    renderProtected();

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("AUTH_PAGE")).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users away from protected pages", async () => {
    setup(null);

    renderProtected();

    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_CONTENT")).not.toBeInTheDocument();
  });

  it("grants protected-page access to an authenticated user online", async () => {
    setup(testUser);
    mocks.getUser.mockResolvedValue({ data: { user: testUser }, error: null });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });

    renderProtected();

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
  });
});
