import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Balance from "./pages/Balance";
import Admin from "./pages/Admin";
import Distributor from "./pages/Distributor";
import Contacts from "./pages/Contacts";
import NotFound from "./pages/NotFound";
import Activation from "./pages/Activation";
import Updates from "./pages/Updates";
import Subscription from "./pages/Subscription";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import { AuthSessionProvider, RequireAuth, RequireAdmin } from "./lib/auth-session";

import "./lib/i18n";
import { getAppStatus, type AppLicenseStatus } from "./lib/license";
import { startBackgroundSync, trackAppOpen, trackDeviceInfo, trackLicenseEvent } from "./lib/cloud-sync";
import { startSupabaseSync } from "./lib/supabase-sync";
import { isWebBrowser } from "./lib/platform";
import { initDeviceId } from "./lib/device-id";
import { verifyLicenseOnline, getLicenseApiEndpoint } from "./lib/license-api";
import { checkForUpdate, type UpdateInfo } from "./lib/update-checker";
import { syncLicense, startLicenseSyncListeners } from "./lib/license-sync";

const queryClient = new QueryClient();

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

    // Online verification in background (if API is configured)
    if (getLicenseApiEndpoint() && (s.status === 'licensed' || s.status === 'trial')) {
      verifyLicenseOnline().then(onlineResult => {
        if (onlineResult.status === 'revoked') {
          setStatus({ status: 'license_expired' } as AppLicenseStatus);
        }
      });
    }

    // Track license status changes
    if (s.status === 'trial') trackLicenseEvent('trial_started', { daysLeft: s.daysLeft });
    else if (s.status === 'trial_expired') trackLicenseEvent('trial_expired');
    else if (s.status === 'licensed') trackLicenseEvent('license_activated', { expiryDate: s.expiryDate });
    else if (s.status === 'license_expired') trackLicenseEvent('license_expired');
  };

  useEffect(() => {
    const init = async () => {
      await initDeviceId(); // Must run first — generates stable device ID
      await checkStatus();
      startSupabaseSync();
      if (!isWeb) {
        doUpdateCheck();
        startBackgroundSync();
        startLicenseSyncListeners();
        syncLicense().catch(() => {});
        trackDeviceInfo();
        trackAppOpen();
      }
    };
    init();
  }, []);

  // Update info is available but no overlay is shown — user checks via Updates page

  if (!status) return null;

  if (status.status === 'trial_expired' || status.status === 'license_expired' || status.status === 'clock_tampered' || status.status === 'blocked') {
    return (
      <BrowserRouter>
        <AuthSessionProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
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
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/distributor" element={<RequireAuth><Distributor /></RequireAuth>} />
          <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
          <Route path="/balance" element={<RequireAuth><Balance /></RequireAuth>} />
          <Route path="/sys-panel" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/updates" element={<RequireAuth><Updates /></RequireAuth>} />
          <Route path="/subscription" element={<RequireAuth><Subscription /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/activation" element={<RequireAuth><Activation status={status} onActivated={checkStatus} /></RequireAuth>} />
          <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
        </Routes>
      </AuthSessionProvider>
    </BrowserRouter>
  );
};

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
