import React, { useState, useEffect } from "react";
import {
  Send, Wallet, BarChart3, Settings, Zap, Menu, ChevronLeft,
  Users, BookUser, Download, Shield, ChevronDown, Home, LogIn, LogOut, User
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getCurrentUser, signOut, isAdminUser } from "@/lib/auth";
import { toast } from "sonner";

function useMenuItems() {
  const { t } = useTranslation();
  return [
    { icon: Send, label: t("nav.transfer"), path: "/", description: t("nav.transferDesc", "Quick balance transfer") },
    { icon: BookUser, label: t("nav.contacts"), path: "/contacts", description: t("nav.contactsDesc", "Manage customer names") },
    { icon: Users, label: t("nav.distributor"), path: "/distributor", description: t("nav.distributorDesc", "Distributor account") },
    { icon: Wallet, label: t("nav.balance"), path: "/balance", description: t("nav.balanceDesc", "Track balance") },
    { icon: BarChart3, label: t("nav.reports"), path: "/reports", description: t("nav.reportsDesc", "Transfer statistics") },
    { icon: Shield, label: t("nav.activation"), path: "/subscription", description: t("nav.activationDesc", "Subscription & payment") },
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
}

const AppLayout = ({ title, titleIcon, onTitleClick, children }: AppLayoutProps) => {
  const { t } = useTranslation();
  const menuItems = useMenuItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u ? { email: u.email } : null));
    isAdminUser().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, [menuOpen]);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 15) {
      setShowScrollHint(false);
    } else {
      setShowScrollHint(true);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between shadow-elevated">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={onTitleClick}>
          {titleIcon || (
            <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center backdrop-blur-sm">
              <Zap className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-primary-foreground text-lg font-bold select-none tracking-tight">{title}</h1>
        </div>

        {/* ✅ Action Buttons Container */}
        <div className="flex items-center gap-2">
          {/* Home Button */}
          <button 
            onClick={() => navigate("/")} 
            className="text-primary-foreground w-9 h-9 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-smooth"
            aria-label="Home"
          >
            <Home className="w-5 h-5" />
          </button>

          {/* Menu Button */}
          <button 
            onClick={() => setMenuOpen(true)} 
            className="text-primary-foreground w-9 h-9 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-smooth"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0 flex flex-col">
          <SheetHeader className="header-gradient px-5 py-6 flex-shrink-0">
            <SheetTitle className="text-primary-foreground flex items-center gap-2.5 pt-2">
              <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold">تحويل رصيد</span>
            </SheetTitle>

          </SheetHeader>
          
          <div className="relative flex-1 overflow-hidden">
            <nav 
              onScroll={handleScroll}
              className="flex flex-col py-3 px-2 gap-0.5 overflow-y-auto h-full max-h-[100dvh] scrollbar-thin"
            >
              {menuItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { setMenuOpen(false); navigate(item.path); }}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-smooth flex-shrink-0 ${
                      isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      <item.icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="text-right flex-1">
                      <span className={`text-sm font-semibold block ${isActive ? "text-primary" : ""}`}>{item.label}</span>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</span>
                    </div>
                    {isActive && <ChevronLeft className="w-4 h-4 text-primary mr-auto flex-shrink-0" />}
                  </button>
                );
              })}

              {/* Admin link (only for admins) */}
              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); navigate("/sys-panel"); }}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-smooth flex-shrink-0 w-full ${
                    location.pathname === "/sys-panel" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-primary text-primary-foreground">
                    <Shield className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-right flex-1">
                    <span className="text-sm font-semibold block">Administration</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">Licenses, devices, monitoring</span>
                  </div>
                </button>
              )}

              {/* Sign In / Sign Out */}
              <div className="border-t border-border mt-2 pt-2">

                {user ? (
                  <button
                    onClick={async () => { await signOut(); setUser(null); toast.success(t("common.success")); setMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-smooth flex-shrink-0 w-full text-foreground hover:bg-muted"
                  >
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground">
                      <LogOut className="w-4.5 h-4.5" />
                    </div>
                    <div className="text-right flex-1">
                      <span className="text-sm font-semibold block">{t("common.logout")}</span>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">{user.email}</span>
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate("/auth"); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-smooth flex-shrink-0 w-full text-foreground hover:bg-muted"
                  >
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-primary text-primary-foreground">
                      <LogIn className="w-4.5 h-4.5" />
                    </div>
                    <div className="text-right flex-1">
                      <span className="text-sm font-semibold block">{t("common.login")}</span>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">{t("auth.subtitle")}</span>
                    </div>
                  </button>
                )}
              </div>
            </nav>

            {showScrollHint && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce bg-primary/20 rounded-full p-1.5 border border-primary/30 backdrop-blur-sm z-50">
                <ChevronDown className="w-4 h-4 text-primary" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-y-auto pt-safe pb-safe">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
