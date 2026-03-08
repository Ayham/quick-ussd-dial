import { useState } from "react";
import { Send, Wallet, BarChart3, Settings, Zap, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const menuItems = [
  { icon: Send, label: "تحويل", path: "/" },
  { icon: Wallet, label: "الرصيد", path: "/balance" },
  { icon: BarChart3, label: "التقارير", path: "/reports" },
  { icon: Settings, label: "الإعدادات", path: "/settings" },
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
      <header className="bg-primary px-3 py-2.5 flex items-center justify-between shadow-md pt-safe">
        <div className="flex items-center gap-2" onClick={onTitleClick}>
          {titleIcon || <Zap className="w-5 h-5 text-primary-foreground" />}
          <h1 className="text-primary-foreground text-lg font-bold select-none">{title}</h1>
        </div>
        <button onClick={() => setMenuOpen(true)} className="text-primary-foreground p-1 rounded-md hover:bg-primary-foreground/10 transition-colors">
          <Menu className="w-6 h-6" />
        </button>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="bg-primary px-4 py-4">
            <SheetTitle className="text-primary-foreground flex items-center gap-2">
              <Zap className="w-5 h-5" />
              تحويل رصيد
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col py-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setMenuOpen(false); navigate(item.path); }}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isActive
                      ? "bg-muted text-primary font-semibold"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{item.label}</span>
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
