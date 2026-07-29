import React, { useState, useEffect } from "react";
import {
  Send, Wallet, BarChart3, Settings, Zap, Menu, ChevronLeft,
  Users, BookUser, Download, Shield, ChevronDown, Home, LogIn, LogOut, User,
  LayoutDashboard, FileText, UserCheck, X, ExternalLink
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCurrentUser, signOut, isAdminUser, isDistributorUser } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Bottom nav items - the 5 primary tabs
const BOTTOM_NAV_ITEMS = [
  { icon: Send, label: "تحويل", path: "/" },
  { icon: BookUser, label: "جهات", path: "/contacts" },
  { icon: Wallet, label: "الرصيد", path: "/balance" },
  { icon: BarChart3, label: "التقارير", path: "/reports" },
  { icon: Settings, label: "الإعدادات", path: "/settings" },
];

function useMenuItems() {
  const { t } = useTranslation();
  return [
    { icon: Send, label: t("nav.transfer"), path: "/", description: t("nav.transferDesc", "Quick balance transfer") },
    { icon: BookUser, label: t("nav.contacts"), path: "/contacts", description: t("nav.contactsDesc", "Manage customer names") },
    { icon: Wallet, label: t("nav.balance"), path: "/balance", description: t("nav.balanceDesc", "Track balance") },
    { icon: BarChart3, label: t("nav.reports"), path: "/reports", description: t("nav.reportsDesc", "Transfer statistics") },
    { icon: User, label: t("nav.profile", "الملف الشخصي"), path: "/profile", description: t("nav.profileDesc", "Account & language") },
    { icon: Settings, label: t("nav.settings"), path: "/settings", description: t("nav.settingsDesc", "App settings") },
    { icon: Download, label: t("nav.updates"), path: "/updates", description: t("nav.updatesDesc", "Check for updates") },
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
  const [isDistributor, setIsDistributor] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u ? { email: u.email } : null));
    isAdminUser().then(setIsAdmin).catch(() => setIsAdmin(false));
    isDistributorUser().then(setIsDistributor).catch(() => setIsDistributor(false));
  }, [menuOpen]);

  const isBottomNavActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col safe-area-insets">
      {/* Header */}
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between shadow-elevated z-header sticky top-0">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={onTitleClick}>
          {titleIcon || (
            <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center backdrop-blur-sm">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-primary-foreground text-lg font-bold select-none tracking-tight">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {headerRight}
          <button 
            onClick={() => setMenuOpen(true)} 
            className="text-primary-foreground w-10 h-10 rounded-xl bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-smooth active:scale-95"
            aria-label="القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-nav">
        {children}
      </main>

      {/* Side Menu / Drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0 flex flex-col">
          {/* Menu Header */}
          <div className="header-gradient px-5 py-6 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-primary-foreground text-lg font-bold">تحويل رصيد</h2>
                  {user && (
                    <p className="text-primary-foreground/70 text-[11px] mt-0.5 truncate max-w-[180px]">{user.email}</p>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setMenuOpen(false)}
                className="text-primary-foreground/70 hover:text-primary-foreground p-1.5 rounded-lg hover:bg-primary-foreground/10 transition-smooth"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Menu Items */}
          <nav className="flex-1 py-3 px-2 overflow-y-auto scrollbar-thin">
            {/* Main Navigation */}
            <div className="px-3 py-1.5 mb-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">القائمة الرئيسية</span>
            </div>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setMenuOpen(false); navigate(item.path); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full",
                    isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="text-right flex-1">
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
                <div className="px-3 py-1.5 mt-3 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">الإدارة</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/sys-panel"); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full",
                    location.pathname === "/sys-panel" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-primary text-primary-foreground">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="text-right flex-1">
                    <span className="text-sm font-semibold block">Administration</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">Licenses, devices, monitoring</span>
                  </div>
                </button>
              </>
            )}

            {/* Distributor section */}
            {isDistributor && !isAdmin && (
              <>
                <div className="px-3 py-1.5 mt-3 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">الموزع</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/dm"); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full",
                    location.pathname === "/dm" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center",
                    location.pathname === "/dm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  {location.pathname === "/dm" && <ChevronLeft className="w-4 h-4 text-primary me-auto flex-shrink-0" />}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/dm/customers"); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full",
                    location.pathname.startsWith("/dm/customers") || location.pathname.startsWith("/dm/customer") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center",
                    location.pathname.startsWith("/dm/customers") || location.pathname.startsWith("/dm/customer") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-right flex-1">
                    <span className={cn("text-sm font-semibold block", location.pathname.startsWith("/dm/customers") || location.pathname.startsWith("/dm/customer") ? "text-primary" : "")}>العملاء</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">إدارة العملاء</span>
                  </div>
                  {(location.pathname.startsWith("/dm/customers") || location.pathname.startsWith("/dm/customer")) && <ChevronLeft className="w-4 h-4 text-primary me-auto flex-shrink-0" />}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/dm/requests"); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full",
                    location.pathname === "/dm/requests" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center",
                    location.pathname === "/dm/requests" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-right flex-1">
                    <span className={cn("text-sm font-semibold block", location.pathname === "/dm/requests" ? "text-primary" : "")}>طلبات الرصيد</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">طلبات التعبئة</span>
                  </div>
                  {location.pathname === "/dm/requests" && <ChevronLeft className="w-4 h-4 text-primary me-auto flex-shrink-0" />}
                </button>
              </>
            )}
          </nav>

          {/* Menu Footer - Sign In / Sign Out */}
          <div className="border-t border-border p-3 flex-shrink-0">
            {user ? (
              <button
                onClick={async () => { await signOut(); setUser(null); toast.success(t("common.success")); setMenuOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full text-foreground hover:bg-muted"
              >
                <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground">
                  <LogOut className="w-4 h-4" />
                </div>
                <div className="text-right flex-1">
                  <span className="text-sm font-semibold block">{t("common.logout")}</span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">{user.email}</span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); navigate("/auth"); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth w-full text-foreground hover:bg-muted"
              >
                <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-primary text-primary-foreground">
                  <LogIn className="w-4 h-4" />
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
