import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Activation from "./pages/Activation";
import { getAppStatus, type AppLicenseStatus } from "./lib/license";

const queryClient = new QueryClient();

const AppContent = () => {
  const [status, setStatus] = useState<AppLicenseStatus | null>(null);

  const checkStatus = async () => {
    const s = await getAppStatus();
    setStatus(s);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (!status) return null; // loading

  // Show activation for expired/tampered states
  if (status.status === 'trial_expired' || status.status === 'license_expired' || status.status === 'clock_tampered') {
    return <Activation status={status} onActivated={checkStatus} />;
  }

  // Trial active or licensed - show app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/settings" element={<Settings />} />
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
