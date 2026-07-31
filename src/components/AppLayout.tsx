import React, { useState, useEffect } from "react";
import {
  Send, Wallet, BarChart3, Settings, Zap, Menu, ChevronLeft,
  Download, Shield, ChevronDown, Home, LogIn, LogOut, User,
  X, ExternalLink, KeyRound
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCurrentUser, signOut, isAdminUser } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BOTTOM_NAV_ITEMS = [
  { icon: Send, label: "تحويل", path: "/" },
  { icon: Wallet, label: "الرصيد", path: "/balance" },
  { icon: BarChart3, label: "التقارير", path: "/reports" },
  { icon: Settings, label: "الإعدادات", path: "/settings" },
];

function useMenuItems() {
  const { t } = useTranslation();
  return [
    { icon: Send, label: t("nav.transfer"), path: "/", description: t("nav.transferDesc", "Quick balance transfer") },
    { icon: Wallet, label: t("nav.balance"), path: "/balance", description: t("nav.balanceDesc", "Track balance") },
    { icon: BarChart3, label: t("nav.reports"), path: "/reports", description: t("nav.reportsDesc", "Transfer statistics") },
    { icon: User, label: t("nav.profile", "الملف الشخصي"), path: "/profile", description: t("nav.profileDesc", "Account & language") },
    { icon: Settings, label: t("nav.settings"), path: "/settings", description: t("nav.settingsDesc", "App settings") },
    { icon: Download, label: t("nav.updates"), path: "/updates", description: t("nav.updatesDesc", "Check for updates") },
    { icon: KeyRound, label: t("nav.activation", "التفعيل"), path: "/activation", description: t("nav.activationDesc", "License & activation") },
  ];
}

interface AppLayoutProps {
  title: string;
  titleIcon?: React.ReactNode;
  onTitleClick?: () => void;
  children: React.ReactNode;
  hideNav?: boolean;
  headerRight?: React.ReactNode;
}

const AppLayout = ({ title, titleIcon, onTitleClick, children, hideNav, headerRight }: AppLayoutProps) => {
  const { t } = useTranslation();
  const menuItems = useMenuItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u ? { email: u.email } : null));
    isAdminUser().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, [menuOpen]);

  const isBottomNavActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col safe-area-insets">
      {/* Header */}
      <header className="header-gradient px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] flex items-center justify-between z-header sticky top-0 shadow-[0_2px_20px_-4px_hsl(221_83%_53%/0.25)]">
        <div className="flex items-center gap-3 cursor-pointer active:scale-95 transition-transform" onClick={onTitleClick}>
          {titleIcon || (
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm shadow-inner">
              <Zap className="w-5.5 h-5.5 text-white" />
            </div>
          )}
          <h1 className="text-white text-lg font-bold select-none tracking-tight">{title}</h1>
        </div>

        <div className="flex items-center gap-2.5">
          {headerRight}
          <button 
            onClick={() => setMenuOpen(true)} 
            className="text-white w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/25 transition-all active:scale-90 backdrop-blur-sm"
            aria-label="القائمة"
          >
            <Menu className="w-5.5 h-5.5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className={cn("flex-1 overflow-y-auto", !hideNav && "pb-nav")}>
        {children}
      </main>

      {/* Bottom Navigation - Floating Style */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-nav pb-safe">
          <div className="relative mx-auto max-w-lg px-4 pb-2">
            <div className="bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_-4px_24px_-6px_rgba(0,0,0,0.12)] px-2 py-1.5 flex items-center justify-around">
              {BOTTOM_NAV_ITEMS.map((item) => {
                const active = isBottomNavActive(item.path);
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[60px]",
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground/60"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                      active && "bg-primary/10"
                    )}>
                      <Icon className={cn(
                        "w-5.5 h-5.5 transition-all duration-300",
                        active && "animate-nav-item-active"
                      )} />
                    </div>
                    <span className={cn(
                      "text-[10px] font-semibold transition-all duration-200 leading-none",
                      active && "text-primary"
                    )}>
                      {item.label}
                    </span>
                    {active && (
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-1 bg-primary rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Side Menu / Drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0 flex flex-col">
          {/* Menu Header - Modern Gradient */}
          <div className="header-gradient px-5 py-7 flex-shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_hsla(0,0%,100%,0.1)_0%,_transparent_60%)]" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <button 
                  onClick={() => setMenuOpen(false)}
                  className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-white text-lg font-bold">تحويل رصيد</h2>
                  {user && (
                    <p className="text-white/60 text-[11px] mt-0.5 truncate">{user.email}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Menu Items */}
          <nav className="flex-1 py-3 px-2.5 overflow-y-auto scrollbar-thin">
            <div className="px-3 py-1.5 mb-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">القائمة الرئيسية</span>
            </div>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setMenuOpen(false); navigate(item.path); }}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all w-full text-start",
                    isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted active:bg-muted/80"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all",
                    isActive ? "bg-primary text-white shadow-sm" : "bg-muted text-muted-foreground"
                  )}>
                    <item.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-right flex-1 min-w-0">
                    <span className={cn("text-sm font-semibold block", isActive ? "text-primary" : "")}>{item.label}</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</span>
                  </div>
                  {isActive && <ChevronLeft className="w-4 h-4 text-primary me-auto flex-shrink-0" />}
                </button>
              );
            })}

            {/* Admin link */}
            {isAdmin && (
              <>
                <div className="px-3 py-1.5 mt-4 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">الإدارة</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/sys-panel"); }}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all w-full text-start",
                    location.pathname === "/sys-panel" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-primary text-white shadow-sm">
                    <Shield className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-right flex-1">
                    <span className="text-sm font-semibold block">Administration</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">Licenses, devices, monitoring</span>
                  </div>
                </button>
              </>
            )}

          </nav>

          {/* Menu Footer - Sign In / Sign Out */}
          <div className="border-t border-border p-3 flex-shrink-0">
            {user ? (
              <button
                onClick={async () => { await signOut(); setUser(null); toast.success(t("common.success")); setMenuOpen(false); }}
                className="flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all w-full text-start text-foreground hover:bg-muted active:bg-muted/80"
              >
                <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground">
                  <LogOut className="w-4.5 h-4.5" />
                </div>
                <div className="text-right flex-1 min-w-0">
                  <span className="text-sm font-semibold block">{t("common.logout")}</span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">{user.email}</span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); navigate("/auth"); }}
                className="flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all w-full text-start text-foreground hover:bg-muted active:bg-muted/80"
              >
                <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-primary text-white shadow-sm">
                  <LogIn className="w-4.5 h-4.5" />
                </div>
                <div className="text-right flex-1">
                  <span className="text-sm font-semibold block">{t("common.login")}</span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">{t("auth.subtitle")}</span>
                </div>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AppLayout;
