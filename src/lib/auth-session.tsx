import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser, getUserRole, type UserRole } from "@/lib/auth";

type AuthState = {
  user: User | null;
  isAdmin: boolean;
  isDistributor: boolean;
  userRole: UserRole;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthState | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDistributor, setIsDistributor] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("customer");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
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
      setIsDistributor(false);
      return;
    }
    const sessionUser = data.user ?? null;
    setUser(sessionUser);
    if (sessionUser) {
      const [adminStatus, role] = await Promise.all([isAdminUser(), getUserRole()]);
      setIsAdmin(adminStatus);
      setIsDistributor(role === "distributor");
      setUserRole(role);
    } else {
      setIsAdmin(false);
      setIsDistributor(false);
      setUserRole("customer");
    }
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        await refresh();
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        setIsAdmin(false);
        setIsDistributor(false);
        return;
      }
      window.setTimeout(async () => {
        try {
          const [adminStatus, role] = await Promise.all([isAdminUser(), getUserRole()]);
          setIsAdmin(adminStatus);
          setIsDistributor(role === "distributor");
          setUserRole(role);
        } catch {
          setIsAdmin(false);
          setIsDistributor(false);
          setUserRole("customer");
        }
      }, 0);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, isAdmin, isDistributor, userRole, loading, refresh }), [user, isAdmin, isDistributor, userRole, loading]);

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

export function RequireDistributor({ children }: { children: ReactNode }) {
  const { user, isAdmin, isDistributor, loading } = useAuthSession();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  if (!isAdmin && !isDistributor) return <Navigate to="/profile" replace state={{ deniedFrom: location.pathname }} />;
  return <>{children}</>;
}

function AuthLoading() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );
}
