import { useState } from "react";
import { Send, Wallet, BarChart3, Settings, Zap, Menu, ChevronLeft, Users, BookUser, Download } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const menuItems = [
  { icon: Send, label: "تحويل", path: "/", description: "تحويل رصيد سريع" },
  { icon: BookUser, label: "جهات الاتصال", path: "/contacts", description: "إدارة أسماء الزبائن" },
  { icon: Users, label: "الموزع", path: "/distributor", description: "إدارة حساب الموزع" },
  { icon: Wallet, label: "الرصيد", path: "/balance", description: "متابعة الرصيد" },
  { icon: BarChart3, label: "التقارير", path: "/reports", description: "إحصائيات التحويلات" },
  { icon: Settings, label: "الإعدادات", path: "/settings", description: "إعدادات التطبيق" },
];

interface AppLayoutProps {
  title: string;
  titleIcon?: React.ReactNode;
  onTitleClick?: () => void;
  children: React.ReactNode;
}

const AppLayout = ({ title, titleIcon, onTitleClick, children }: AppLayoutProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets">
      {/* Header with gradient */}
      <header className="header-gradient px-4 py-3 flex items-center justify-between shadow-elevated pt-safe">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={onTitleClick}>
          {titleIcon || (
            <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center backdrop-blur-sm">
              <Zap className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-primary-foreground text-lg font-bold select-none tracking-tight">{title}</h1>
        </div>
        <button 
          onClick={() => setMenuOpen(true)} 
          className="text-primary-foreground w-9 h-9 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-smooth"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Drawer Menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0">
          <SheetHeader className="header-gradient px-5 py-6">
            <SheetTitle className="text-primary-foreground flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold">تحويل رصيد</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col py-3 px-2 gap-0.5">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setMenuOpen(false); navigate(item.path); }}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-smooth ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    <item.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold block ${isActive ? "text-primary" : ""}`}>{item.label}</span>
                    <span className="text-[11px] text-muted-foreground">{item.description}</span>
                  </div>
                  {isActive && <ChevronLeft className="w-4 h-4 text-primary mr-auto" />}
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {children}
    </div>
  );
};

export default AppLayout;