import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, FutureConfig, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Balance from "./pages/Balance";
import TransferHistory from "./pages/TransferHistory";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Updates from "./pages/Updates";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Activation from "./pages/Activation";
import LicenseLocked from "./pages/LicenseLocked";
import About from "./pages/About";
import { AuthSessionProvider, RequireAdmin, RequireAuth, RequireDistributor } from "@/lib/auth-session";
import { NotificationsProvider } from "@/hooks/use-notifications";
import OnboardingGate from "@/components/OnboardingGate";
import LicenseReminder from "@/components/LicenseReminder";
import DeviceMismatchDialog from "@/components/DeviceMismatchDialog";
import { UpdateBanner, ForcedUpdateGate, isForcedDismissed, dismissForcedUpdate } from "@/components/ForceUpdate";
import CustomerDisplayEntry from "@/features/customer-display/customer/CustomerDisplayEntry";
import SellerDisplayPage from "@/features/customer-display/seller/SellerDisplayPage";
import { CustomerDisplayServerProvider } from "@/features/customer-display/seller/CustomerDisplayServerProvider";
import { AppModeProvider } from "@/features/customer-display/app-mode";
import { useAppMode } from "@/features/customer-display/app-mode";

import "./lib/i18n";
import { isWebBrowser } from "@/lib/platform";
import { checkForUpdate, type UpdateInfo } from "@/lib/update-checker";
import { startCloudServices } from "@/cloud";

const queryClient = new QueryClient();
const Reports = lazy(() => import("./pages/Reports"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DistributorPanel = lazy(() => import("./pages/DistributorPanel"));

const AppContent = () => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const isWeb = isWebBrowser();
  const { isCustomerDisplay } = useAppMode();

  const doUpdateCheck = async () => {
    setChecking(true);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch {}
    setChecking(false);
  };

  // Cloud Module bootstrap — background, non-blocking, never awaited.
  useEffect(() => {
    startCloudServices();
  }, []);

  useEffect(() => {
    if (!isWeb) {
      doUpdateCheck();
    }
  }, []);

  // Re-check when the app comes back online so a forced gate (or the banner)
  // appears as soon as a policy can be fetched.
  useEffect(() => {
    if (isWeb) return;
    const onOnline = () => doUpdateCheck();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const showForcedGate = Boolean(updateInfo?.forced && !isForcedDismissed());

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthSessionProvider>
        <NotificationsProvider>
          {showForcedGate && updateInfo && (
            <ForcedUpdateGate
              updateInfo={updateInfo}
              onRetry={doUpdateCheck}
              onDismiss={() => dismissForcedUpdate()}
              checking={checking}
              allowDismiss
            />
          )}
          {!showForcedGate && updateInfo?.hasUpdate && (
            <UpdateBanner updateInfo={updateInfo} onDismiss={() => setUpdateInfo(null)} />
          )}
          <LicenseReminder />
          <CustomerDisplayServerProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/customer-display" element={<CustomerDisplayEntry />} />
            <Route path="/seller-display" element={<RequireAuth><SellerDisplayPage /></RequireAuth>} />
            <Route path="/activation" element={<RequireAuth><Activation /></RequireAuth>} />
            <Route path="/license-locked" element={<RequireAuth><LicenseLocked /></RequireAuth>} />
            <Route path="/" element={isCustomerDisplay ? <Navigate to="/customer-display" replace /> : <RequireAuth><Index /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/reports" element={
              <RequireAuth>
                <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">{t("common.loadingReports")}</div>}>
                  <Reports />
                </Suspense>
              </RequireAuth>
            } />
            <Route path="/balance" element={<RequireAuth><Balance /></RequireAuth>} />
            <Route path="/transfer-history" element={<RequireAuth><TransferHistory /></RequireAuth>} />
            <Route path="/notifications" element={
              <RequireAuth>
                <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
                  <Notifications />
                </Suspense>
              </RequireAuth>
            } />
            <Route path="/sys-panel" element={<RequireAuth><RequireAdmin><Admin /></RequireAdmin></RequireAuth>} />
            <Route path="/distributor" element={
              <RequireAuth>
                <RequireDistributor>
                  <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
                    <DistributorPanel />
                  </Suspense>
                </RequireDistributor>
              </RequireAuth>
            } />
            <Route path="/updates" element={<RequireAuth><Updates /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/about" element={<RequireAuth><About /></RequireAuth>} />
            <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
          </Routes>
          </CustomerDisplayServerProvider>
          <OnboardingGate />
          <DeviceMismatchDialog />
        </NotificationsProvider>
      </AuthSessionProvider>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppModeProvider>
        <AppContent />
      </AppModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
