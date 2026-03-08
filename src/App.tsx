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
import { getAppStatus, type AppLicenseStatus } from "./lib/license";
import { startBackgroundSync, trackAppOpen, trackDeviceInfo, trackLicenseEvent } from "./lib/cloud-sync";

const queryClient = new QueryClient();

const AppContent = () => {
  const [status, setStatus] = useState<AppLicenseStatus | null>(null);

  const checkStatus = async () => {
    const s = await getAppStatus();
    setStatus(s);

    // Track license status changes
    if (s.status === 'trial') trackLicenseEvent('trial_started', { daysLeft: s.daysLeft });
    else if (s.status === 'trial_expired') trackLicenseEvent('trial_expired');
    else if (s.status === 'licensed') trackLicenseEvent('license_activated', { expiryDate: s.expiryDate });
    else if (s.status === 'license_expired') trackLicenseEvent('license_expired');
  };

  useEffect(() => {
    checkStatus();
    startBackgroundSync();
    trackDeviceInfo();
    trackAppOpen();
  }, []);

  if (!status) return null;

  if (status.status === 'trial_expired' || status.status === 'license_expired' || status.status === 'clock_tampered') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/sys-panel" element={<Admin />} />
          <Route path="*" element={<Activation status={status} onActivated={checkStatus} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/distributor" element={<Distributor />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/balance" element={<Balance />} />
        <Route path="/sys-panel" element={<Admin />} />
        <Route path="/activation" element={<Activation status={status} onActivated={checkStatus} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
