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
// been confirmed by Supabase. The marker below records the last time the
// session was actually validated, so offline-first continuity can NEVER
// fabricate an authenticated state from an arbitrary stored blob (license
// cache, profile cache, copied app data, etc.).
export const AUTH_VALIDATED_AT_KEY = "app_auth_session_validated_at";

// Mirrors the app-wide session policy used by session-service.ts.
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
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

function clearAuthValidated(): void {
  try {
    localStorage.removeItem(AUTH_VALIDATED_AT_KEY);
  } catch {}
}

// A session is eligible for offline continuity only if Supabase confirmed it
// recently enough per the app's session policy.
function hasAuthContinuity(): boolean {
  const last = getLastAuthValidation();
  return last > 0 && Date.now() - last < SESSION_MAX_AGE_MS;
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
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
        clearAuthValidated();
        setUser(null);
        setIsAdmin(false);
      }
      return;
    }
    const sessionUser = data.user ?? null;
    userRef.current = sessionUser;
    setUser(sessionUser);
    if (sessionUser) {
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
    // granted only after the session is validated (or, while offline, only
    // when Supabase previously confirmed this session).
    const load = async () => {
      let storedSessionUser: User | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        storedSessionUser = session?.user ?? null;
      } catch {}
      if (!alive) return;

      // No session at all → not authenticated. (Fresh install, logged out,
      // cleared data, or an expired session Supabase already removed.)
      if (!storedSessionUser) {
        userRef.current = null;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Offline + a session Supabase previously confirmed → offline continuity
      // (never a fabricated authentication state).
      const offline = typeof navigator === "undefined" || !navigator.onLine;
      if (offline && hasAuthContinuity()) {
        userRef.current = storedSessionUser;
        setUser(storedSessionUser);
        setLoading(false);
        runBackgroundChecks();
        return;
      }

      // Otherwise the stored session must be validated against Supabase before
      // it grants access.
      try {
        const result = await withAuthTimeout(
          supabase.auth.getUser(),
          AUTH_VALIDATION_TIMEOUT_MS,
        );
        if (result?.data?.user) {
          markAuthValidated();
          userRef.current = result.data.user;
          setUser(result.data.user);
        } else if (result?.error && isGenuineAuthError(result.error)) {
          // Expired / invalid / revoked session → clear it and require login.
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}
          clearAuthValidated();
          userRef.current = null;
          setUser(null);
          setIsAdmin(false);
        } else if (hasAuthContinuity()) {
          // Transport failure while a previously-validated session exists.
          userRef.current = storedSessionUser;
          setUser(storedSessionUser);
        } else {
          userRef.current = null;
          setUser(null);
          setIsAdmin(false);
        }
      } catch {
        if (hasAuthContinuity()) {
          userRef.current = storedSessionUser;
          setUser(storedSessionUser);
        } else {
          userRef.current = null;
          setUser(null);
          setIsAdmin(false);
        }
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

      // Runtime events below are network-confirmed (real login, token refresh,
      // user update) or explicit state changes (sign-out) — safe to apply.
      userRef.current = sessionUser;
      setUser(sessionUser);
      setLoading(false);
      if (!sessionUser) {
        setIsAdmin(false);
        clearAuthValidated();
        return;
      }
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
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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
