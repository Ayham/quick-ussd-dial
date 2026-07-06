import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Balance from "./pages/Balance";
import Admin from "./pages/Admin";
import Distributor from "./pages/Distributor";
import Contacts from "./pages/Contacts";
import NotFound from "./pages/NotFound";
import Activation from "./pages/Activation";
import Updates from "./pages/Updates";
import Subscription from "./pages/Subscription";
import Auth from "./pages/Auth";
import OAuthConsent from "./pages/OAuthConsent";
import Profile from "./pages/Profile";
import { AuthSessionProvider, RequireAuth, RequireAdmin } from "./lib/auth-session";

import "./lib/i18n";
import { getAppStatus, type AppLicenseStatus } from "./lib/license";
import { startBackgroundSync, trackAppOpen, trackDeviceInfo } from "./lib/cloud-sync";
import { flush, startSupabaseSync } from "./lib/supabase-sync";
import { isWebBrowser } from "./lib/platform";
import { initDeviceId } from "./lib/device-id";
import { checkForUpdate, type UpdateInfo } from "./lib/update-checker";

const queryClient = new QueryClient();
const Reports = lazy(() => import("./pages/Reports"));

const AppContent = () => {
  const [status, setStatus] = useState<AppLicenseStatus | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const isWeb = isWebBrowser();

  const doUpdateCheck = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch {}
    setCheckingUpdate(false);
  };

  const checkStatus = async () => {
    const s = await getAppStatus();
    setStatus(s);

  };

  useEffect(() => {
    const init = async () => {
      await initDeviceId(); // Must run first — generates stable device ID
      await flush({ force: true });
      await checkStatus();
      startSupabaseSync();
      if (!isWeb) {
        doUpdateCheck();
        startBackgroundSync();
        trackDeviceInfo();
        trackAppOpen();
      }
    };
    init();
  }, []);

  useEffect(() => {
    window.addEventListener("app-license-sync", checkStatus);
    const refreshFromServer = async () => {
      await flush({ force: true });
      await checkStatus();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshFromServer();
    };
    window.addEventListener("online", refreshFromServer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("app-license-sync", checkStatus);
      window.removeEventListener("online", refreshFromServer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Update info is available but no overlay is shown — user checks via Updates page

  if (!status) return null;

  if (status.status === 'maintenance') {
    return <AccessBlock title="Maintenance in progress" message="The service is temporarily unavailable. Access will resume automatically." />;
  }

  if (status.status === 'force_update') {
    return <AccessBlock title="Update required" message={`Install version ${status.minimumVersion || "required by the administrator"} or newer to continue.`} />;
  }

  if (status.status === 'offline_expired') {
    return <AccessBlock title="Connection required" message="Connect to the internet so this device can renew its server authorization." />;
  }

  if (status.status === 'trial_expired' || status.status === 'license_expired' || status.status === 'blocked' || status.status === 'suspended') {
    return (
      <BrowserRouter>
        <AuthSessionProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/sys-panel" element={<RequireAdmin><Admin /></RequireAdmin>} />
            <Route path="*" element={<RequireAuth><Activation status={status} onActivated={checkStatus} /></RequireAuth>} />
          </Routes>
        </AuthSessionProvider>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/distributor" element={<RequireAuth><Distributor /></RequireAuth>} />
          <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/reports" element={
            <RequireAuth>
              <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">Loading reports...</div>}>
                <Reports />
              </Suspense>
            </RequireAuth>
          } />
          <Route path="/balance" element={<RequireAuth><Balance /></RequireAuth>} />
          <Route path="/sys-panel" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/updates" element={<RequireAuth><Updates /></RequireAuth>} />
          <Route path="/subscription" element={<RequireAuth><Subscription /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/activation" element={<Navigate to="/" replace />} />
          <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
        </Routes>
      </AuthSessionProvider>
    </BrowserRouter>
  );
};

const AccessBlock = ({ title, message }: { title: string; message: string }) => (
  <div className="min-h-dvh bg-background p-6 flex items-center justify-center safe-area-insets">
    <div className="w-full max-w-sm border border-border bg-card p-6 text-center space-y-3">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
