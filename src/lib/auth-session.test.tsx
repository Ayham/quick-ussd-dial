import { render, screen, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

import { AuthSessionProvider, RequireAuth, AUTH_VALIDATED_AT_KEY, useAuthSession } from "./auth-session";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  isAdminUser: vi.fn(),
  listenForOAuthCallback: vi.fn(),
  getInitialDeepLink: vi.fn(),
  handleOAuthDeepLink: vi.fn(),
  isRaseedDeepLink: vi.fn(),
  authTrace: vi.fn(),
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
  isRaseedDeepLink: mocks.isRaseedDeepLink,
  authTrace: mocks.authTrace,
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

// Mirrors @supabase/auth-js: onAuthStateChange registers a callback that the
// library later invokes with the recovered session (INITIAL_SESSION at startup,
// SIGNED_IN for real logins / storage recovery, TOKEN_REFRESHED, SIGNED_OUT…).
// Tests capture that callback so they can emit the events auth-js would.
let fireAuthState: ((event: string, session: { user: User | null } | null) => void) | null = null;

function setup(sessionUser: User | null) {
  mocks.getSession.mockResolvedValue({ data: { session: sessionUser ? { user: sessionUser } : null }, error: null });
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: { user: User | null } | null) => void) => {
    fireAuthState = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.listenForOAuthCallback.mockResolvedValue(() => {});
  mocks.getInitialDeepLink.mockResolvedValue(null);
  mocks.isRaseedDeepLink.mockReturnValue(false);
  mocks.validateAndRefreshSession.mockResolvedValue({ valid: true });
  mocks.registerDeviceLogin.mockResolvedValue({ success: true });
  mocks.refreshLicenseCacheIfNeeded.mockResolvedValue(null);
  mocks.isAdminUser.mockResolvedValue(false);
}

// Mirrors the real Auth page: once a user is authenticated it navigates to the
// protected area (in the app this is done by Auth.tsx listening for SIGNED_IN).
function AuthPage() {
  const { user } = useAuthSession();
  const nav = useNavigate();
  useEffect(() => {
    if (user) nav("/protected", { replace: true });
  }, [user, nav]);
  return <div>AUTH_PAGE</div>;
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
          <Route path="/auth" element={<AuthPage />} />
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
    // The session was previously confirmed by Supabase (marker), so offline
    // continuity is legitimate — this is NOT fabricated authentication.
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
    // The background session refresh fails with a network error while offline.
    mocks.getUser.mockRejectedValue(new Error("NetworkError"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });

    renderProtected();

    // auth-js still replays the stored session via INITIAL_SESSION — this must
    // not disturb the offline continuity grant.
    act(() => {
      fireAuthState?.("INITIAL_SESSION", { user: testUser });
    });

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("AUTH_PAGE")).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("NEVER opens the app from storage-recovery events alone (no fabricated auth)", async () => {
    // The reported bypass: auth-js replays a stored session at startup via
    // INITIAL_SESSION and SIGNED_IN with NO server confirmation. Offline and
    // without a validation marker, the app must stay locked, even though these
    // events carry a user object.
    setup(testUser);
    localStorage.removeItem(AUTH_VALIDATED_AT_KEY);
    mocks.getUser.mockRejectedValue(new Error("NetworkError"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });

    renderProtected();

    act(() => {
      fireAuthState?.("INITIAL_SESSION", { user: testUser });
      fireAuthState?.("SIGNED_IN", { user: testUser });
    });

    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_CONTENT")).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("still accepts a real SIGNED_IN after the app is open (normal login works)", async () => {
    setup(null);

    renderProtected();

    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();

    // A genuine login while the app is running.
    act(() => {
      fireAuthState?.("SIGNED_IN", { user: testUser });
    });

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
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

  it("does NOT grant access offline to a stored session that was never validated", async () => {
    setup(testUser);
    // A session blob exists in storage but Supabase never confirmed it.
    localStorage.removeItem(AUTH_VALIDATED_AT_KEY);
    mocks.getUser.mockRejectedValue(new Error("NetworkError"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });

    renderProtected();

    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_CONTENT")).not.toBeInTheDocument();
  });

  it("clears a stored session that the server rejects (revoked/expired) and requires login", async () => {
    setup(testUser);
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, name: "AuthApiError", message: "invalid JWT: Token is expired" },
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });

    renderProtected();

    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_CONTENT")).not.toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_VALIDATED_AT_KEY)).toBeNull();
  });

  it("falls back to offline continuity when a validated session hits a transport failure online", async () => {
    setup(testUser);
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 0, name: "AuthRetryableFetchError", message: "fetch failed" },
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });

    renderProtected();

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("logs out locally when the license/account verdict demands it (suspended/blocked)", async () => {
    setup(testUser);
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
    mocks.getUser.mockResolvedValue({ data: { user: testUser }, error: null });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    // The account is suspended server-side → the session verdict demands logout.
    mocks.validateAndRefreshSession.mockResolvedValue({
      valid: false,
      requiresLogout: true,
      license: null,
    });

    renderProtected();

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalled();
    });
    // The user is redirected back to the auth page.
    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_CONTENT")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_VALIDATED_AT_KEY)).toBeNull();
  });

  it("does NOT log out when a license-level verdict merely blocks transfers (expired/revoked)", async () => {
    setup(testUser);
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
    mocks.getUser.mockResolvedValue({ data: { user: testUser }, error: null });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    // Expired / revoked licenses keep the app usable (banners), no logout.
    mocks.validateAndRefreshSession.mockResolvedValue({
      valid: true,
      requiresLogout: false,
      license: null,
    });

    renderProtected();

    expect(await screen.findByText("PROTECTED_CONTENT")).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_VALIDATED_AT_KEY)).not.toBeNull();
  });
});
