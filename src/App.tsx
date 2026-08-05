import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Balance from "./pages/Balance";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Updates from "./pages/Updates";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Activation from "./pages/Activation";
import LicenseLocked from "./pages/LicenseLocked";
import { AuthSessionProvider, RequireAdmin, RequireAuth } from "@/lib/auth-session";
import OnboardingGate from "@/components/OnboardingGate";

import "./lib/i18n";
import { isWebBrowser } from "@/lib/platform";
import { checkForUpdate, type UpdateInfo } from "@/lib/update-checker";
import ForceUpdate from "@/components/ForceUpdate";

const queryClient = new QueryClient();
const Reports = lazy(() => import("./pages/Reports"));

const AppContent = () => {
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

  useEffect(() => {
    if (!isWeb) {
      doUpdateCheck();
    }
  }, []);

  if (updateInfo?.maintenance) {
    return (
      <div className="min-h-dvh bg-background p-6 flex items-center justify-center safe-area-insets">
        <div className="w-full max-w-sm border border-border bg-card p-6 text-center space-y-3">
          <h1 className="text-xl font-bold">Maintenance in progress</h1>
          <p className="text-sm text-muted-foreground">The service is temporarily unavailable. Access will resume automatically.</p>
        </div>
      </div>
    );
  }

  if (updateInfo?.minimum_version) {
    return <ForceUpdate minimumVersion={updateInfo.minimum_version} latestVersion={updateInfo.latest_version} />;
  }

  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/activation" element={<RequireAuth><Activation /></RequireAuth>} />
          <Route path="/license-locked" element={<RequireAuth><LicenseLocked /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/reports" element={
            <RequireAuth>
              <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">Loading reports...</div>}>
                <Reports />
              </Suspense>
            </RequireAuth>
          } />
          <Route path="/balance" element={<RequireAuth><Balance /></RequireAuth>} />
          <Route path="/sys-panel" element={<RequireAuth><RequireAdmin><Admin /></RequireAdmin></RequireAuth>} />
          <Route path="/updates" element={<RequireAuth><Updates /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
        </Routes>
        <OnboardingGate />
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
