import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Truck, LayoutGrid, Users, BarChart3, User, LogOut, Banknote, TrendingUp, Calendar, RefreshCw, Info, Wallet, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { markExplicitLogout, clearAuthValidated, clearSupabaseLocalSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import {
  distributorGetDashboard,
  distributorGetCustomers,
  distributorGetReport,
  distributorGetPayouts,
  type DistributorDashboard,
  type DistributorCustomer,
  type DistributorReport,
  type DistributorPayout,
} from "@/lib/distributor";

const tabs = [
  { value: "overview", labelKey: "distributorPanel.overview", icon: LayoutGrid },
  { value: "customers", labelKey: "distributorPanel.customers", icon: Users },
  { value: "payouts", labelKey: "distributorPanel.payouts", icon: Wallet },
  { value: "reports", labelKey: "distributorPanel.reports", icon: BarChart3 },
  { value: "profile", labelKey: "distributorPanel.profile", icon: User },
];

const DistributorPanel = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboard, setDashboard] = useState<DistributorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await distributorGetDashboard();
      if (result.ok) setDashboard(result);
      else setError(result.error || "Failed to load");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleLogout = async () => {
    markExplicitLogout();
    clearAuthValidated();
    try { await signOut(); } catch {}
    clearSupabaseLocalSession();
    navigate("/auth");
  };

  if (loading && !dashboard) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (error || !dashboard?.ok) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Truck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
          <div className="text-sm font-medium">{error || t("distributorPanel.notDistributor")}</div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>{t("common.back")}</Button>
        </div>
      </div>
    );
  }

  const d = dashboard.distributor!;
  const s = dashboard.stats!;

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="header-gradient px-5 pb-4 pt-[calc(var(--sat)+14px)] flex flex-col gap-4 shadow-[0_2px_20px_-4px_hsl(var(--primary)/0.35)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
              <Truck className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-white text-lg font-bold tracking-tight">{t("distributorPanel.welcome", { name: d.display_name || "" })}</h1>
              <p className="text-xs text-white/70">{d.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => fetchDashboard(true)} disabled={refreshing} className="text-white hover:bg-white/10 rounded-xl h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white hover:bg-white/10 h-9 rounded-xl text-xs font-semibold">
              {t("admin.backToApp")}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/10 rounded-xl h-9 w-9">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto scrollbar-none">
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
      </header>

      {/* Content */}
      <main className="px-4 pt-4 max-w-7xl mx-auto pb-[calc(var(--sab)+2rem)]">
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-5 animate-fade-in">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Info note */}
              <div className="bg-blue-50 text-blue-700 rounded-xl p-3 text-xs flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{t("distributorPanel.firstPaymentOnly")}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { icon: <Users className="w-5 h-5" />, label: t("distributorPanel.totalCustomers"), value: s.total_customers, color: "text-blue-600", bg: "bg-blue-100" },
                  { icon: <Users className="w-5 h-5" />, label: t("distributorPanel.activeCustomers"), value: s.active_customers, color: "text-green-600", bg: "bg-green-100" },
                  { icon: <Banknote className="w-5 h-5" />, label: t("distributorPanel.totalPayments"), value: Number(s.total_payments).toLocaleString(), color: "text-primary", bg: "bg-primary/10" },
                  { icon: <TrendingUp className="w-5 h-5" />, label: t("distributorPanel.totalCommission"), value: Number(s.total_commission).toLocaleString(), color: "text-emerald-600", bg: "bg-emerald-100" },
                  { icon: <CheckCircle className="w-5 h-5" />, label: t("distributorPanel.totalPaid"), value: Number(s.total_paid).toLocaleString(), color: "text-green-600", bg: "bg-green-100" },
                  { icon: <Wallet className="w-5 h-5" />, label: t("distributorPanel.totalPending"), value: Number(s.total_pending).toLocaleString(), color: "text-amber-600", bg: "bg-amber-100" },
                  { icon: <Calendar className="w-5 h-5" />, label: t("distributorPanel.monthlyCommission"), value: Number(s.monthly_commission).toLocaleString(), color: "text-indigo-600", bg: "bg-indigo-100" },
                  { icon: <Calendar className="w-5 h-5" />, label: t("distributorPanel.todayCommission"), value: Number(s.today_commission).toLocaleString(), color: "text-amber-600", bg: "bg-amber-100" },
                ].map((stat, i) => (
                  <div key={i} className="bg-muted/50 rounded-xl p-3 space-y-1">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", stat.bg)}>
                      <span className={stat.color}>{stat.icon}</span>
                    </div>
                    <div className="text-xl font-bold">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "customers" && <CustomersPanel />}

          {activeTab === "payouts" && <PayoutsPanel />}

          {activeTab === "reports" && <ReportsPanel />}

          {activeTab === "profile" && (
            <div className="space-y-4">
              <h3 className="font-bold">{t("distributorPanel.myProfile")}</h3>
              <div className="space-y-3">
                {[
                  { label: t("distributorPanel.profileName"), value: d.display_name || "—" },
                  { label: t("distributorPanel.distributorCode"), value: d.code, className: "font-mono font-semibold text-primary" },
                  { label: t("distributorPanel.profileEmail"), value: d.email || "—" },
                  { label: t("distributorPanel.profilePhone"), value: d.phone || "—" },
                  { label: t("distributorPanel.commissionRate"), value: d.commission_rate + "%", className: "font-semibold text-primary" },
                ].map((item, i) => (
                  <div key={i} className="bg-muted/50 rounded-xl p-3">
                    <label className="text-xs text-muted-foreground">{item.label}</label>
                    <div className={cn("font-medium mt-1", item.className)}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ─── Customers Panel ─────────────────────────────────────────

function CustomersPanel() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<DistributorCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCustomers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await distributorGetCustomers({ search, page, page_size: 20 });
      setCustomers(result.customers || []);
      setTotal(result.total || 0);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [search, page]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold">{t("distributorPanel.myCustomers")} ({total})</h3>
        <Button size="sm" variant="outline" onClick={() => fetchCustomers(true)} disabled={refreshing} className="h-8">
          <RefreshCw className={cn("w-3.5 h-3.5 me-1", refreshing && "animate-spin")} />
          {t("adminDistributors.refresh")}
        </Button>
      </div>
      <div className="relative">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t("distributorPanel.searchPlaceholder")}
          className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {t("distributorPanel.noCustomers")}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <div key={c.user_id} className="p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.display_name || c.email || "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  c.license_status === "active" ? "bg-green-100 text-green-700" :
                  c.license_status === "trial" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-700"
                }`}>{c.license_status || "—"}</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{t("distributorPanel.totalPayments")}: {Number(c.total_payments || 0).toLocaleString()}</span>
                <span className="text-emerald-600">{t("distributorPanel.myCommission")}: {Number(c.distributor_commission || 0).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reports Panel ───────────────────────────────────────────

function ReportsPanel() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DistributorReport | null>(null);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReport = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await distributorGetReport({ period });
      if (result.ok) setReport(result);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold">{t("distributorPanel.myReports")}</h3>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="day">{t("distributorPanel.dailyReport")}</option>
            <option value="week">{t("reports.range7")}</option>
            <option value="month">{t("distributorPanel.monthlyReport")}</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => fetchReport(true)} disabled={refreshing} className="h-9">
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : !report || report.daily.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {t("distributorPanel.noReportData")}
        </div>
      ) : (
        <div className="space-y-4">
          {report.daily.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">{t("distributorPanel.dailyBreakdown")}</h4>
              <div className="space-y-2">
                {report.daily.map((day) => (
                  <div key={day.day} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm">{day.day}</div>
                    <div className="text-end text-sm">
                      <span className="font-medium">{day.payment_count} {t("distributorPanel.payments")}</span>
                      <span className="ms-3 text-muted-foreground">{Number(day.total_amount).toLocaleString()}</span>
                      <span className="ms-2 text-emerald-600">+{Number(day.total_commission).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.customer_ranking.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">{t("distributorPanel.customerRanking")}</h4>
              <div className="space-y-2">
                {report.customer_ranking.map((r, i) => (
                  <div key={r.user_id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <span className="text-sm font-medium">{r.display_name || "—"}</span>
                    </div>
                    <div className="text-end text-sm">
                      <span className="font-medium">{Number(r.total_amount).toLocaleString()}</span>
                      <span className="ms-2 text-xs text-emerald-600">+{Number(r.total_commission).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payouts Panel ──────────────────────────────────────────

function PayoutsPanel() {
  const { t } = useTranslation();
  const [payouts, setPayouts] = useState<DistributorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPayouts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await distributorGetPayouts();
      setPayouts(result.payouts || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold">{t("distributorPanel.payoutHistory")}</h3>
        <Button size="sm" variant="outline" onClick={() => fetchPayouts(true)} disabled={refreshing} className="h-8">
          <RefreshCw className={cn("w-3.5 h-3.5 me-1", refreshing && "animate-spin")} />
          {t("adminDistributors.refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : payouts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {t("distributorPanel.noPayouts")}
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div>
                <div className="text-sm font-medium">{t("distributorPanel.payoutDelivered")}</div>
                {p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}
              </div>
              <div className="text-end">
                <div className="text-sm font-semibold text-emerald-600">+{Number(p.amount).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DistributorPanel;
