import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users, AlertTriangle, Wallet, Clock, Activity, ArrowLeft, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { signOut } from "@/lib/auth";
import { useAuthSession } from "@/lib/auth-session";
import { getDistributorDashboardStats, type DashboardStats } from "@/lib/distributor-management";

export default function DistributorDashboard() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { user, isAdmin } = useAuthSession();
  const isArabic = i18n.language === "ar";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const s = await getDashboardStats();
      setStats(s);
    } catch (err: any) {
      toast.error(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast.success(isArabic ? "تم تسجيل الخروج" : "Signed out");
    nav("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex flex-col gap-4 shadow-elevated">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-foreground/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-primary-foreground text-lg font-bold tracking-tight">
                {isArabic ? "لوحة الموزع" : "Distributor Dashboard"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isArabic ? "نظرة عامة على عملك" : "Overview of your business"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => nav("/")}>
              <ArrowLeft className="w-4 h-4 me-1" />
              {isArabic ? "التطبيق" : "App"}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto pb-8 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label={isArabic ? "إجمالي العملاء" : "Total Customers"}
            value={stats?.total_customers ?? 0}
            color="text-primary"
            bg="bg-primary/10"
          />
          <StatCard
            label={isArabic ? "الديون المستحقة" : "Outstanding Debt"}
            value={stats?.total_debt ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="text-destructive"
            bg="bg-destructive/10"
            format="currency"
          />
          <StatCard
            label={isArabic ? "أرصدة العملاء" : "Customer Balances"}
            value={stats?.total_balance ?? 0}
            icon={<Wallet className="w-5 h-5" />}
            color="text-success"
            bg="bg-success/10"
            format="currency"
          />
          <StatCard
            label={isArabic ? "طلبات معلقة" : "Pending Requests"}
            value={stats?.pending_requests ?? 0}
            icon={<Clock className="w-5 h-5" />}
            color="text-accent"
            bg="bg-accent/10"
          />
          <StatCard
            label={isArabic ? "عمليات اليوم" : "Today's Transactions"}
            value={stats?.today_transactions ?? 0}
            icon={<Activity className="w-5 h-5" />}
            color="text-secondary-foreground"
            bg="bg-secondary/50"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => nav("/dm/customers")}
            className="bg-card border border-border rounded-2xl p-4 shadow-card hover:bg-muted/50 transition-smooth text-center"
          >
            <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-bold">{isArabic ? "العملاء" : "Customers"}</p>
            <p className="text-[10px] text-muted-foreground">
              {isArabic ? "إدارة وعرض العملاء" : "Manage & view customers"}
            </p>
          </button>
          <button
            onClick={() => nav("/dm/requests")}
            className="bg-card border border-border rounded-2xl p-4 shadow-card hover:bg-muted/50 transition-smooth text-center relative"
          >
            <Clock className="w-8 h-8 mx-auto mb-2 text-accent" />
            <p className="text-sm font-bold">{isArabic ? "طلبات الرصيد" : "Topup Requests"}</p>
            <p className="text-[10px] text-muted-foreground">
              {isArabic ? "معالجة الطلبات" : "Process requests"}
            </p>
            {(stats?.pending_requests ?? 0) > 0 && (
              <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {stats!.pending_requests}
              </span>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
  format,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  format?: "currency";
}) {
  const displayValue = format === "currency" ? value.toLocaleString() : value;
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
          <span className={color}>{icon}</span>
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>
        {displayValue}
        {format === "currency" && <span className="text-xs text-muted-foreground ms-1">ل.س</span>}
      </p>
    </div>
  );
}
