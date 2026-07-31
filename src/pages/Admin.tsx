import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, LogOut, LayoutGrid, Users, Activity, FileText, Database, KeyRound, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { signOut } from "@/lib/auth";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { EventsViewer } from "@/components/admin/EventsViewer";
import { TransfersViewer } from "@/components/admin/TransfersViewer";
import { UsersRolesManager } from "@/components/admin/UsersRolesManager";
import LicenseManagement from "@/components/admin/LicenseManagement";
import ActivationRequests from "@/components/admin/ActivationRequests";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", labelKey: "admin.dashboard", icon: LayoutGrid },
   { value: "users", labelKey: "admin.users", icon: Users },
   { value: "transfers", labelKey: "admin.transfers", icon: Activity },
  { value: "licenses", labelKey: "admin.licenses", icon: KeyRound },
  { value: "activations", labelKey: "admin.activationRequests", icon: UserCheck },
  { value: "events", labelKey: "admin.events", icon: Database },
];

const Admin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = tabsRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      return () => el.removeEventListener("scroll", checkScroll);
    }
  }, []);

  const scrollTabs = (direction: "left" | "right") => {
    if (tabsRef.current) {
      const amount = 200;
      tabsRef.current.scrollBy({ left: direction === "right" ? amount : -amount, behavior: "smooth" });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out");
      navigate("/auth");
    } catch {
      toast.error("Sign out failed");
    }
  };

  const renderPanel = (value: string) => {
    switch (value) {
      case "overview":
        return <DashboardOverview />;
      case "users":
        return <UsersRolesManager />;
      case "transfers":
        return <TransfersViewer />;
      case "events":
        return <EventsViewer />;
      case "licenses":
        return <LicenseManagement />;
       case "activations":
         return <ActivationRequests />;
       default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] flex flex-col gap-4 shadow-[0_2px_20px_-4px_hsl(221_83%_53%/0.25)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
              <Shield className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-white text-lg font-bold tracking-tight">Administration</h1>
              <p className="text-xs text-white/70">Operational console for users, transfers, and system events.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white hover:bg-white/10 h-9 rounded-xl text-xs font-semibold">
              Back to app
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/10 rounded-xl h-9 w-9">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          {canScrollLeft && (
            <button onClick={() => scrollTabs("left")} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-lg bg-white/90 shadow-sm flex items-center justify-center text-foreground backdrop-blur-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <div ref={tabsRef} className="overflow-x-auto scrollbar-none" onScroll={checkScroll}>
            <div className="flex gap-2 rounded-2xl bg-white/10 backdrop-blur-sm p-1.5 min-w-fit">
              {tabs.map((tab) => {
                const active = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                      active ? 'bg-white text-primary shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          {canScrollRight && (
            <button onClick={() => scrollTabs("right")} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-lg bg-white/90 shadow-sm flex items-center justify-center text-foreground backdrop-blur-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto pb-8">
        {tabs.map((tab) => (
          <div
            key={tab.value}
            className={cn(
              "bg-white rounded-2xl shadow-sm border border-border/60 p-5 transition-all duration-300",
              activeTab === tab.value ? "block animate-fade-in" : "hidden"
            )}
          >
            {renderPanel(tab.value)}
          </div>
        ))}
      </main>
    </div>
  );
};

export default Admin;
