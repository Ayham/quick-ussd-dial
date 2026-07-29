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
import Distributor from "./pages/Distributor";
import Contacts from "./pages/Contacts";
import NotFound from "./pages/NotFound";
import Updates from "./pages/Updates";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import { AuthSessionProvider, RequireAdmin, RequireDistributor } from "@/lib/auth-session";

import "./lib/i18n";
import { isWebBrowser } from "@/lib/platform";
import { checkForUpdate, type UpdateInfo } from "@/lib/update-checker";
import ForceUpdate from "@/components/ForceUpdate";

import DistributorDashboard from "@/pages/distributor/DistributorDashboard";
import DistributorCustomers from "@/pages/distributor/DistributorCustomers";
import DistributorCustomerDetail from "@/pages/distributor/DistributorCustomerDetail";
import DistributorRequests from "@/pages/distributor/DistributorRequests";

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
          <Route path="/" element={<Index />} />
          <Route path="/distributor" element={<Distributor />} />
          <Route path="/dm" element={<RequireDistributor><DistributorDashboard /></RequireDistributor>} />
          <Route path="/dm/customers" element={<RequireDistributor><DistributorCustomers /></RequireDistributor>} />
          <Route path="/dm/customer/:id" element={<RequireDistributor><DistributorCustomerDetail /></RequireDistributor>} />
          <Route path="/dm/requests" element={<RequireDistributor><DistributorRequests /></RequireDistributor>} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/reports" element={
            <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">Loading reports...</div>}>
              <Reports />
            </Suspense>
          } />
          <Route path="/balance" element={<Balance />} />
          <Route path="/sys-panel" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
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
