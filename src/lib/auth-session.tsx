import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { validateAndRefreshSession } from "@/lib/session-service";
import { registerDeviceLogin } from "@/lib/device";
import { refreshLicenseCacheIfNeeded } from "@/lib/license-cache";
import { listenForOAuthCallback, getInitialDeepLink, handleOAuthDeepLink, authTrace } from "@/lib/auth";

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
      // Offline mode must NEVER log the user out. If the network is down,
      // the local authenticated session stays in place — only genuine auth
      // errors (expired/invalid JWT, sub claim, replaced session) clear it.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const msg = (error.message || "").toLowerCase();
      if (
        msg.includes("jwt") ||
        msg.includes("sub claim") ||
        msg.includes("session") ||
        msg.includes("token")
      ) {
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      }
      setUser(null);
      setIsAdmin(false);
      return;
    }
    const sessionUser = data.user ?? null;
    userRef.current = sessionUser;
    setUser(sessionUser);
    if (sessionUser) {
      setIsAdmin(await isAdminUser());
    } else {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let alive = true;

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
        validateAndRefreshSession().catch(() => {});
      }, 0);
    };

    // Local-first cold start: read the session straight from device storage so
    // the UI renders instantly (<1s) without any network call.
    const load = async () => {
      let sessionUser: User | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        sessionUser = session?.user ?? null;
      } catch {}
      if (!alive) return;
      userRef.current = sessionUser;
      setUser(sessionUser);
      setLoading(false);

      if (!sessionUser) return;
      runBackgroundChecks();
    };

    load();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      authTrace("AUTH_STATE_CHANGE", { event: _event, user: sessionUser ? "present" : "absent" });
      if (_event === "SIGNED_IN") {
        authTrace("SIGNED_IN", { user: sessionUser?.id ? "present" : "absent" });
      }
      userRef.current = sessionUser;
      setUser(sessionUser);
      setLoading(false);
      if (!sessionUser) {
        setIsAdmin(false);
        return;
      }
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
      if (initialUrl && initialUrl.startsWith("com.BlueOrbitTechnologies.Raseed://")) {
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
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );
}
