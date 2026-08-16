import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { validateAndRefreshSession } from "@/lib/session-service";
import { registerDeviceLogin } from "@/lib/device";
import { refreshLicenseCacheIfNeeded } from "@/lib/license-cache";
import { useTranslation } from "react-i18next";
import { listenForOAuthCallback, getInitialDeepLink, handleOAuthDeepLink, authTrace, isRaseedDeepLink } from "@/lib/auth";

// A locally persisted session is only treated as authentication when it has
// been confirmed by Supabase. The marker below records that this app has seen
// a successful Supabase confirmation at least once, so offline-first continuity
// can NEVER fabricate an authenticated state from an arbitrary stored blob
// (license cache, profile cache, copied app data, etc.). It is only ever
// consulted alongside a real persisted Supabase session — never on its own.
export const AUTH_VALIDATED_AT_KEY = "app_auth_session_validated_at";

// Set before an explicit user-initiated logout so that an offline cold start
// can never resurrect the old session. Consumed once a new session is
// established or once load() confirms no session remains.
const EXPLICIT_LOGOUT_KEY = "app_explicit_logout";

const AUTH_VALIDATION_TIMEOUT_MS = 10_000;

function getLastAuthValidation(): number {
  try {
    return parseInt(localStorage.getItem(AUTH_VALIDATED_AT_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function markAuthValidated(): void {
  try {
    localStorage.setItem(AUTH_VALIDATED_AT_KEY, String(Date.now()));
  } catch {}
}

export function clearAuthValidated(): void {
  try {
    localStorage.removeItem(AUTH_VALIDATED_AT_KEY);
  } catch {}
}

// Explicit-logout marker. MUST be set before signOut() so the restore logic can
// tell an intentional logout apart from a transient auth-state loss while
// offline.
export function markExplicitLogout(): void {
  try {
    localStorage.setItem(EXPLICIT_LOGOUT_KEY, "1");
  } catch {}
}

export function clearExplicitLogout(): void {
  try {
    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
  } catch {}
}

function hasExplicitLogout(): boolean {
  try {
    return localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "1";
  } catch {
    return false;
  }
}

// A session is eligible for offline continuity only when Supabase confirmed it
// at least once in the past. There is deliberately NO time cap here (no 7-day
// window): the app keeps its last known-good Supabase session while offline and
// lets Supabase decide validity when connectivity returns. The marker is never
// an independent authentication proof — it is only consulted when a persisted
// Supabase session actually exists.
function hasAuthContinuity(): boolean {
  return getLastAuthValidation() > 0;
}

// Matches the default supabase-js storage key: `sb-<project-ref>-auth-token`.
function getSupabaseStorageKey(): string {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const match = url ? /^https:\/\/([^.]+)\./.exec(url) : null;
    return match ? `sb-${match[1]}-auth-token` : "";
  } catch {
    return "";
  }
}

// When the access token is expired, auth-js attempts a refresh inside
// getSession(); if that fails while offline it returns a null session even
// though the persisted Supabase session is still intact. This reads the raw
// persisted session blob so an offline cold start still recovers the user.
function readPersistedSessionUser(): User | null {
  const key = getSupabaseStorageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: unknown } | null;
    const maybeUser = parsed?.user as User | undefined;
    return maybeUser != null && typeof maybeUser.id === "string" ? maybeUser : null;
  } catch {
    return null;
  }
}

// Guarantees the Supabase session is gone from device storage even when an
// offline signOut() cannot reach the server (auth-js keeps the blob in that
// case). Clears auth only — never app data (license, settings, transfers…).
export function clearSupabaseLocalSession(): void {
  const key = getSupabaseStorageKey();
  if (!key) return;
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}-user`);
    localStorage.removeItem(`${key}-code-verifier`);
  } catch {}
}

// Genuine authentication failures (expired/invalid/revoked JWT, missing
// session) are strictly distinct from transport failures (offline, DNS,
// timeout) and transient server errors (e.g. 429 rate limit). Only genuine
// auth failures may clear the local session — otherwise a valid user could be
// force-logged-out by a momentary server hiccup.
function isGenuineAuthError(error: unknown): boolean {
  const err = error as { status?: number; name?: string; message?: string };
  // Only the server's explicit 401/403 means the stored credential was
  // rejected. Other 4xx (429 rate limit…) and 5xx are transient.
  if (typeof err.status === "number" && (err.status === 401 || err.status === 403)) return true;
  if (err.name === "AuthSessionMissingError") return true;
  const msg = (err.message || "").toLowerCase();
  return ["jwt", "sub claim", "token"].some((part) => msg.includes(part));
}

function withAuthTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

type AuthState = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthState | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Offline / transient failures must never clear an established session.
      // Only genuine auth failures (expired/invalid/revoked JWT) do.
      if (isGenuineAuthError(error)) {
        // Clear the in-memory user BEFORE signOut so the SIGNED_OUT event this
        // triggers is not mistaken for a transient loss to be preserved.
        userRef.current = null;
        setUser(null);
        setIsAdmin(false);
        clearAuthValidated();
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      }
      return;
    }
    const sessionUser = data.user ?? null;
    userRef.current = sessionUser;
    setUser(sessionUser);
    if (sessionUser) {
      clearExplicitLogout();
      markAuthValidated();
      setIsAdmin(await isAdminUser());
    } else {
      setIsAdmin(false);
      clearAuthValidated();
    }
  };

  useEffect(() => {
    let alive = true;
    // Cold start is settled once load() finishes. Until then, SIGNED_IN events
    // are the auth-js storage-recovery replay (no server confirmation) and must
    // not be treated as authentication.
    let coldStartSettled = false;

    // Background network refreshes — never block render. Also re-runs when the
    // app regains focus so a device that was displaced by a login on another
    // device detects it and signs out promptly.
    const runBackgroundChecks = () => {
      window.setTimeout(async () => {
        try {
          await refresh();
        } catch {}
        try {
          await registerDeviceLogin();
        } catch {}
        try {
          await refreshLicenseCacheIfNeeded();
        } catch {}
        try {
          const sessionResult = await validateAndRefreshSession();
          // If session is invalid due to suspended/blocked account, logout and redirect
          if (!sessionResult.valid && sessionResult.requiresLogout) {
            try { await supabase.auth.signOut({ scope: "local" }); } catch {}
            clearAuthValidated();
            setUser(null);
            setIsAdmin(false);
            // Redirect will be handled by RequireAuth since user is now null
          }
        } catch {}
      }, 0);
    };

    // Local-first cold start: read the session straight from device storage,
    // but NEVER treat a stored blob as authentication on its own. Access is
    // granted only when a real persisted Supabase session exists AND it was
    // previously confirmed (or, when reachable, is confirmed again by the
    // server). navigator.onLine is intentionally NOT used — it is unreliable in
    // the Android WebView and must not decide whether a stored session is kept.
    const load = async () => {
      let storedSessionUser: User | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        storedSessionUser = session?.user ?? null;
      } catch {
        storedSessionUser = null;
      }
      // With an expired access token, auth-js refreshes inside getSession();
      // if that fails while offline it returns a null session although the
      // persisted session is intact. Fall back to the raw persisted blob.
      if (!storedSessionUser) {
        storedSessionUser = readPersistedSessionUser();
      }
      if (!alive) return;

      // No session at all → not authenticated. (Fresh install, logged out,
      // cleared data, or a session Supabase already removed.)
      if (!storedSessionUser) {
        clearExplicitLogout();
        userRef.current = null;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // A prior explicit logout must never be resurrected by an offline cold
      // start.
      if (hasExplicitLogout()) {
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
        clearSupabaseLocalSession();
        clearAuthValidated();
        clearExplicitLogout();
        userRef.current = null;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // A session Supabase previously confirmed → restore it immediately
      // without waiting for a network round-trip. The marker records prior
      // confirmation, NOT a time-based grant — there is deliberately no 7-day
      // cap. Server validation continues in the background and may only revoke
      // access on a genuine rejection, never on a network error.
      if (hasAuthContinuity()) {
        clearExplicitLogout();
        userRef.current = storedSessionUser;
        setUser(storedSessionUser);
        setLoading(false);
        runBackgroundChecks();
        return;
      }

      // Never previously confirmed → the stored session must be validated
      // against Supabase before it grants access.
      try {
        const result = await withAuthTimeout(
          supabase.auth.getUser(),
          AUTH_VALIDATION_TIMEOUT_MS,
        );
        if (result?.data?.user) {
          clearExplicitLogout();
          markAuthValidated();
          userRef.current = result.data.user;
          setUser(result.data.user);
        } else if (result?.error && isGenuineAuthError(result.error)) {
          // Expired / invalid / revoked session → clear it and require login.
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}
          clearAuthValidated();
          clearExplicitLogout();
          userRef.current = null;
          setUser(null);
          setIsAdmin(false);
        }
      } catch {
        // Transport failure / timeout with no prior confirmation → stay locked.
      }
      setLoading(false);
      if (userRef.current) runBackgroundChecks();
    };

    load().finally(() => {
      coldStartSettled = true;
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      authTrace("AUTH_STATE_CHANGE", { event: _event, user: sessionUser ? "present" : "absent" });

      // @supabase/auth-js replays the session recovered from device storage at
      // startup: INITIAL_SESSION always fires, and SIGNED_IN fires whenever the
      // stored session is structurally valid. Neither is a server confirmation,
      // so neither may open the app on its own. The load() flow decides cold
      // start, and its offline-continuity marker is the only offline grant.
      if (_event === "INITIAL_SESSION") return;
      if (_event === "SIGNED_IN" && !coldStartSettled) return;

      // A null session must NOT be treated as a real logout by default: auth-js
      // can surface a cleared/internal state during offline initialization, and
      // a bare SIGNED_OUT here would evict a user we just restored from a
      // persisted session. Only an explicit user logout (marked beforehand) or
      // a confirmed server rejection (verified by the background check) may
      // evict the user.
      if (!sessionUser) {
        if (hasExplicitLogout()) {
          // This was an intentional logout → session is gone for good.
          clearExplicitLogout();
          clearAuthValidated();
          clearSupabaseLocalSession();
          userRef.current = null;
          setUser(null);
          setIsAdmin(false);
          return;
        }
        // Preserve a restored user in memory and let the background validation
        // decide — it keeps the user on network errors and only clears on a
        // genuine server rejection.
        if (userRef.current) {
          runBackgroundChecks();
          return;
        }
        userRef.current = null;
        setUser(null);
        setIsAdmin(false);
        clearAuthValidated();
        return;
      }

      // Runtime events below are network-confirmed (real login, token refresh,
      // user update) — safe to apply.
      userRef.current = sessionUser;
      setUser(sessionUser);
      setLoading(false);
      clearExplicitLogout();
      markAuthValidated();
      window.setTimeout(async () => {
        try {
          setIsAdmin(await isAdminUser());
          await registerDeviceLogin();
        } catch {
          setIsAdmin(false);
        }
        try {
          await refreshLicenseCacheIfNeeded();
        } catch {}
        // Check license state after login - if suspended/blocked, logout
        try {
          const sessionResult = await validateAndRefreshSession();
          if (!sessionResult.valid && sessionResult.requiresLogout) {
            try { await supabase.auth.signOut({ scope: "local" }); } catch {}
            clearAuthValidated();
            setUser(null);
            setIsAdmin(false);
          }
        } catch {}
      }, 0);
    });

    const onFocus = () => {
      if (document.visibilityState === "visible" && userRef.current) {
        runBackgroundChecks();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runBackgroundChecks();
      }
    };
    // When connectivity comes back, immediately re-validate the session and
    // refresh the license so a suspended/blocked account is locked (or a good
    // license re-enabled) as soon as the server is reachable again — without
    // waiting for a focus change. navigator.onLine is never read; this only
    // reacts to the real event.
    const onOnline = () => {
      if (userRef.current) {
        runBackgroundChecks();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let removeListener: (() => void) | null = null;

    const setup = async () => {
      // Cold start: the app was launched by a deep link (email confirmation / OAuth)
      const initialUrl = await getInitialDeepLink();
      if (isRaseedDeepLink(initialUrl)) {
        const result = await handleOAuthDeepLink(initialUrl);
        if (result.error) {
          authTrace("AUTH_ERROR", { stage: "cold start handleOAuthDeepLink", message: result.error.message });
          console.error("Cold start OAuth error:", result.error.message);
        }
      }

      // Listen for OAuth / email-confirmation callbacks via the app deep link
      removeListener = await listenForOAuthCallback();
    };

    setup().catch((err) => {
      authTrace("AUTH_ERROR", { stage: "deep-link setup", message: String(err) });
      console.error("Deep-link setup failed:", err);
    });

    return () => {
      alive = false;
      if (removeListener) {
        removeListener();
      }
    };
  }, []);

  const value = useMemo(() => ({ user, isAdmin, loading, refresh }), [user, isAdmin, loading]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthSession();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuthSession();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  if (!isAdmin) return <Navigate to="/profile" replace state={{ deniedFrom: location.pathname }} />;
  return <>{children}</>;
}

function AuthLoading() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
    </div>
  );
}
