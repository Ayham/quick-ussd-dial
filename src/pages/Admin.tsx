import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SubscriptionPlansAdmin } from "@/components/admin/SubscriptionPlansAdmin";
import { PaymentMethodsAdmin } from "@/components/admin/PaymentMethodsAdmin";
import { 
  Shield, 
  LogOut, 
  LayoutGrid, 
  Users, 
  MonitorSmartphone, 
  Truck, 
  Activity, 
  KeyRound, 
  Package, 
  CreditCard, 
  UserCheck, 
  Bell, 
  RefreshCw, 
  Smartphone, 
  MessageCircle, 
  Database, 
  ChevronLeft, 
  ChevronRight,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { signOut } from "@/lib/auth";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { EventsViewer } from "@/components/admin/EventsViewer";
import { TransfersViewer } from "@/components/admin/TransfersViewer";
import { UsersRolesManager } from "@/components/admin/UsersRolesManager";
import LicenseManagement from "@/components/admin/LicenseManagement";
import ActivationRequests from "@/components/admin/ActivationRequests";
import { NotificationManagement } from "@/components/admin/NotificationManagement";
import { SyncMonitor } from "@/components/admin/SyncMonitor";
import AppUpdatesAdmin from "@/components/admin/AppUpdatesAdmin";
import ContactSettingsAdmin from "@/components/admin/ContactSettingsAdmin";
import { DistributorManagement } from "@/components/admin/DistributorManagement";
import { DevicesManager } from "@/components/admin/DevicesManager";
import { cn } from "@/lib/utils";

const tabs = [
   { value: "overview", labelKey: "admin.dashboard", icon: LayoutGrid },
   { value: "users", labelKey: "admin.users", icon: Users },
   { value: "devices", labelKey: "adminDevices.title", icon: MonitorSmartphone },
   { value: "distributors", labelKey: "adminDistributors.title", icon: Truck },
   { value: "transfers", labelKey: "admin.transfers", icon: Activity },
   { value: "licenses", labelKey: "admin.licenses", icon: KeyRound },
   { value: "plans", labelKey: "admin.subscriptionPlans", icon: Package },
   { value: "paymentMethods", labelKey: "admin.paymentMethods", icon: CreditCard },
   { value: "activations", labelKey: "admin.activationRequests", icon: UserCheck },
   { value: "notifications", labelKey: "admin.notifications", icon: Bell },
   { value: "sync", labelKey: "admin.sync", icon: RefreshCw },
   { value: "updates", labelKey: "admin.appUpdates", icon: Smartphone },
   { value: "contactSettings", labelKey: "admin.contactSettings", icon: MessageCircle },
   { value: "events", labelKey: "admin.events", icon: Database },
];

const Admin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = tabsRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, []);

  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
    checkScroll();
  }, [activeTab]);

  const scrollTabs = (direction: "left" | "right") => {
    if (tabsRef.current) {
      const amount = 250;
      const isRtl = document.documentElement.dir === "rtl";
      const scrollDirection = isRtl
        ? direction === "right" ? -amount : amount
        : direction === "right" ? amount : -amount;
      tabsRef.current.scrollBy({ left: scrollDirection, behavior: "smooth" });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success(t("admin.signedOut"));
      navigate("/auth");
    } catch {
      toast.error(t("admin.signOutFailed"));
    }
  };

  const renderPanel = (value: string) => {
    switch (value) {
      case "overview":
        return <DashboardOverview />;
      case "users":
        return <UsersRolesManager />;
      case "devices":
        return <DevicesManager />;
      case "distributors":
        return <DistributorManagement />;
      case "transfers":
        return <TransfersViewer />;
      case "events":
        return <EventsViewer />;
      case "licenses":
        return <LicenseManagement />;
      case "plans":
        return <SubscriptionPlansAdmin />;
      case "paymentMethods":
        return <PaymentMethodsAdmin />;
      case "notifications":
        return <NotificationManagement />;
        case "sync":
          return <SyncMonitor />;
        case "updates":
          return <AppUpdatesAdmin />;
        case "contactSettings":
          return <ContactSettingsAdmin />;
        case "activations":
         return <ActivationRequests />;
       default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="header-gradient px-4 sm:px-6 pb-4 pt-[calc(var(--sat)+16px)] flex flex-col gap-4 shadow-[0_4px_25px_-5px_hsl(var(--primary)/0.4)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner backdrop-blur-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white text-lg sm:text-xl font-bold tracking-tight">{t("admin.administration")}</h1>
              <p className="text-xs sm:text-sm text-white/80">{t("admin.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold gap-1.5 border border-white/20 shadow-sm backdrop-blur-sm">
                  <Menu className="w-4 h-4" />
                  <span className="hidden xs:inline">{t("admin.sections", "الأقسام")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-[75vh] overflow-y-auto rounded-2xl p-2 shadow-xl border-border/80 z-50">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  {t("admin.selectSection", "اختر القسم للانتقال السريع")}
                </div>
                {tabs.map((tab) => {
                  const active = activeTab === tab.value;
                  const Icon = tab.icon;
                  return (
                    <DropdownMenuItem
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all my-0.5",
                        active ? "bg-primary text-primary-foreground font-semibold shadow-sm" : "hover:bg-muted"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t(tab.labelKey)}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white hover:bg-white/20 h-9 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all">
              {t("admin.backToApp")}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/20 rounded-xl h-9 w-9 transition-all" title={t("admin.signOut")}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="relative flex items-center gap-1.5 pt-1">
          {canScrollLeft && (
            <button 
              type="button"
              onClick={() => scrollTabs("left")} 
              className="hidden sm:flex items-center justify-center w-8 h-9 rounded-xl bg-white/20 hover:bg-white/30 text-white shadow-sm backdrop-blur-sm transition-all shrink-0"
              aria-label="Scroll left"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <div 
            ref={tabsRef} 
            className="overflow-x-auto scrollbar-none flex-1 -mx-1 px-1 py-1 focus:outline-none focus:ring-1 focus:ring-white/30 rounded-2xl" 
            onScroll={checkScroll}
            tabIndex={0}
          >
            <div className="flex gap-2 rounded-2xl bg-white/10 backdrop-blur-md p-1.5 min-w-fit shadow-inner">
              {tabs.map((tab) => {
                const active = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={active ? activeTabRef : null}
                    onClick={() => setActiveTab(tab.value)}
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0 select-none",
                      active 
                        ? 'bg-white text-primary shadow-lg ring-2 ring-white/50 scale-[1.01] font-bold' 
                        : 'text-white/80 hover:bg-white/15 hover:text-white'
                    )}
                  >
                    <tab.icon className={cn("h-4 w-4 shrink-0 transition-transform", active ? "text-primary scale-110" : "text-white/80")} />
                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {canScrollRight && (
            <button 
              type="button"
              onClick={() => scrollTabs("right")} 
              className="hidden sm:flex items-center justify-center w-8 h-9 rounded-xl bg-white/20 hover:bg-white/30 text-white shadow-sm backdrop-blur-sm transition-all shrink-0"
              aria-label="Scroll right"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="px-4 pt-4 max-w-7xl mx-auto pb-[calc(var(--sab)+2rem)]">
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
