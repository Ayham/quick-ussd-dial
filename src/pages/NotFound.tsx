import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
      <div className="text-center space-y-4 animate-slide-up">
        <div className="w-20 h-20 rounded-2xl bg-muted mx-auto flex items-center justify-center">
          <span className="text-4xl font-bold text-muted-foreground">404</span>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">الصفحة غير موجودة</h1>
          <p className="text-sm text-muted-foreground">عذراً، لا يمكننا العثور على الصفحة المطلوبة</p>
        </div>
        <Button onClick={() => navigate("/")} className="rounded-xl h-12 px-6">
          <Home className="w-4 h-4 me-2" />
          العودة للرئيسية
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
