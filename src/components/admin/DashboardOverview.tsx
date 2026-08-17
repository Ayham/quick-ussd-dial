import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Users, UserCheck, RefreshCw, Smartphone, Activity, DollarSign,
  AlertTriangle, ShieldCheck, Truck, Clock, ArrowRight, TrendingUp,
  CheckCircle2, XCircle, PauseCircle, Ban
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface DashboardMetrics {
  totalUsers: number;
  activeDevices: number;
  totalDevices: number;
  transfers24h: number;
  transfersFailed7d: number;
  totalTransfers: number;
  pendingActivations: number;
  activeLicenses: number;
  trialLicenses: number;
  expiredLicenses: number;
  blockedLicenses: number;
  suspendedLicenses: number;
  totalLicenses: number;
  activeDistributors: number;
  syncFailures24h: number;
  recentTransfers: Array<{
    phone: string;
    amount: number;
    operator: string;
    status: string;
    created_at: string;
  }>;
}

const EMPTY: DashboardMetrics = {
  totalUsers: 0, activeDevices: 0, totalDevices: 0,
  transfers24h: 0, transfersFailed7d: 0, totalTransfers: 0,
  pendingActivations: 0,
  activeLicenses: 0, trialLicenses: 0, expiredLicenses: 0,
  blockedLicenses: 0, suspendedLicenses: 0, totalLicenses: 0,
  activeDistributors: 0, syncFailures24h: 0, recentTransfers: [],
};

const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return phone || "???";
  return phone.slice(0, 3) + "****" + phone.slice(-2);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `${days} يوم`;
}

function getErrMsg(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

export function DashboardOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  const loadMetrics = useCallback(async () => {
    if (!isMountedRef.current) return;
    setError(null);
    setLoading(true);

    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!isMountedRef.current) return;

      try {
        const [
          profilesResult,
          syncMonitorResult,
          transfersResult,
          h24TransfersResult,
          activationsResult,
          syncLogsResult,
        ] = await Promise.all([
          withTimeout(
            supabase.from("profiles").select("user_id, license_status, account_status", { count: "exact" }),
            REQUEST_TIMEOUT_MS
          ),
          withTimeout(
            supabase.rpc("admin_get_sync_monitor", {}),
            REQUEST_TIMEOUT_MS
          ),
          withTimeout(
            supabase.from("transfers").select("id", { count: "exact", head: true }),
            REQUEST_TIMEOUT_MS
          ),
          withTimeout(
            supabase.from("transfers").select("phone, amount, operator, status, created_at")
              .order("created_at", { ascending: false })
              .limit(5),
            REQUEST_TIMEOUT_MS
          ),
          withTimeout(
            supabase.rpc("get_activation_requests", { _status: "pending" }),
            REQUEST_TIMEOUT_MS
          ),
          withTimeout(
            supabase.from("sync_logs").select("id", { count: "exact", head: true })
              .eq("status", "failed")
              .gte("created_at", h24Ago),
            REQUEST_TIMEOUT_MS
          ),
        ]);

        const errors: string[] = [];

        // --- profiles (users + license breakdown) ---
        let totalUsers = 0;
        let activeLicenses = 0, trialLicenses = 0, expiredLicenses = 0;
        let blockedLicenses = 0, suspendedLicenses = 0;
        if (profilesResult.error) {
          errors.push(`المستخدمون: ${getErrMsg(profilesResult.error)}`);
        } else {
          const profiles = (profilesResult.data || []) as Array<{
            user_id: string;
            license_status: string;
            account_status: string;
          }>;
          totalUsers = profilesResult.count || profiles.length;
          for (const p of profiles) {
            switch (p.license_status) {
              case "active": activeLicenses++; break;
              case "trial": trialLicenses++; break;
              case "expired": expiredLicenses++; break;
              case "blocked": blockedLicenses++; break;
              case "suspended": suspendedLicenses++; break;
            }
          }
        }

        // --- sync monitor (devices + transfers 24h + failed 7d) ---
        let activeDevices = 0, totalDevices = 0;
        let transfers24h = 0, transfersFailed7d = 0;
        if (syncMonitorResult.error) {
          errors.push(`المزامنة: ${getErrMsg(syncMonitorResult.error)}`);
        } else {
          const sm = (syncMonitorResult.data || {}) as {
            totals?: {
              total_devices?: number;
              active_24h?: number;
              transfers_24h?: number;
              transfers_failed_7d?: number;
            };
          };
          totalDevices = sm.totals?.total_devices || 0;
          activeDevices = sm.totals?.active_24h || 0;
          transfers24h = sm.totals?.transfers_24h || 0;
          transfersFailed7d = sm.totals?.transfers_failed_7d || 0;
        }

        // --- total transfers ---
        let totalTransfers = 0;
        if (transfersResult.error) {
          errors.push(`التحويلات: ${getErrMsg(transfersResult.error)}`);
        } else {
          totalTransfers = transfersResult.count || 0;
        }

        // --- recent transfers ---
        let recentTransfers: DashboardMetrics["recentTransfers"] = [];
        if (h24TransfersResult.error) {
          errors.push(`آخر التحويلات: ${getErrMsg(h24TransfersResult.error)}`);
        } else {
          recentTransfers = (h24TransfersResult.data || []) as DashboardMetrics["recentTransfers"];
        }

        // --- pending activations ---
        let pendingActivations = 0;
        if (activationsResult.error) {
          errors.push(`طلبات التفعيل: ${getErrMsg(activationsResult.error)}`);
        } else {
          const acts = (activationsResult.data || []) as unknown[];
          pendingActivations = Array.isArray(acts) ? acts.length : 0;
        }

        // --- sync failures ---
        let syncFailures24h = 0;
        if (syncLogsResult.error) {
          errors.push(`إخفاقات المزامنة: ${getErrMsg(syncLogsResult.error)}`);
        } else {
          syncFailures24h = syncLogsResult.count || 0;
        }

        // --- distributors: skip if problematic, just show "—" ---
        let activeDistributors = 0;
        try {
          const distResult = await withTimeout(
            supabase.from("distributors").select("id", { count: "exact", head: true }).eq("status", "active"),
            5000
          );
          if (distResult.error) {
            errors.push(`الموزعون: ${getErrMsg(distResult.error)}`);
          } else {
            activeDistributors = distResult.count || 0;
          }
        } catch {
          // silently skip
        }

        if (isMountedRef.current) {
          setMetrics({
            totalUsers,
            activeDevices,
            totalDevices,
            transfers24h,
            transfersFailed7d,
            totalTransfers,
            pendingActivations,
            activeLicenses,
            trialLicenses,
            expiredLicenses,
            blockedLicenses,
            suspendedLicenses,
            totalLicenses: activeLicenses + trialLicenses + expiredLicenses + blockedLicenses + suspendedLicenses,
            activeDistributors,
            syncFailures24h,
            recentTransfers,
          });
          if (errors.length > 0) {
            setError(errors.join(" | "));
          }
          setLastUpdated(new Date());
        }
        return;
      } catch (err) {
        const isNetworkError =
          (err instanceof TypeError && err.message.includes("Failed to fetch")) ||
          (err instanceof Error &&
            (err.message.includes("timeout") || err.message.includes("ERR_CONNECTION_CLOSED")));

        if (isNetworkError && attempt < MAX_RETRIES) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
          continue;
        }
        if (isMountedRef.current) {
          setError(getErrMsg(err));
        }
        return;
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadMetrics();
    const interval = window.setInterval(loadMetrics, 30_000);
    return () => {
      isMountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [loadMetrics]);

  const statCards = [
    {
      label: t("adminDashboard.totalUsers"),
      value: metrics.totalUsers,
      icon: Users,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      label: t("adminDashboard.activeDevices"),
      value: metrics.activeDevices,
      icon: Smartphone,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
      suffix: `${metrics.totalDevices} ${t("adminDashboard.totalDevices")}`,
    },
    {
      label: t("adminDashboard.transfers24h"),
      value: metrics.transfers24h,
      icon: Activity,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      suffix: `${metrics.totalTransfers} ${t("admin.totalTransfers")}`,
    },
    {
      label: t("admin.totalTransfers"),
      value: metrics.totalTransfers,
      icon: TrendingUp,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600",
    },
  ];

  const alertCards = [
    {
      label: t("adminDashboard.pendingActivations"),
      value: metrics.pendingActivations,
      icon: UserCheck,
      tone: metrics.pendingActivations > 0 ? "warn" as const : "good" as const,
    },
    {
      label: t("adminDashboard.syncFailures"),
      value: metrics.syncFailures24h,
      icon: AlertTriangle,
      tone: metrics.syncFailures24h > 0 ? "bad" as const : "good" as const,
    },
    {
      label: t("adminDashboard.distributors"),
      value: metrics.activeDistributors,
      icon: Truck,
      tone: "neutral" as const,
    },
  ];

  const licenseBreakdown = [
    { label: t("adminDashboard.activeLicenses"), count: metrics.activeLicenses, color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 },
    { label: t("adminDashboard.trialLicenses"), count: metrics.trialLicenses, color: "text-blue-600", bg: "bg-blue-500/10", icon: ShieldCheck },
    { label: t("adminDashboard.expiredLicenses"), count: metrics.expiredLicenses, color: "text-amber-600", bg: "bg-amber-500/10", icon: Clock },
    { label: t("adminDashboard.suspendedLicenses"), count: metrics.suspendedLicenses, color: "text-orange-600", bg: "bg-orange-500/10", icon: PauseCircle },
    { label: t("adminDashboard.blockedLicenses"), count: metrics.blockedLicenses, color: "text-red-600", bg: "bg-red-500/10", icon: Ban },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("admin.dashboard")}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">{t("adminDashboard.refreshNote")}</p>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground/70">
                {t("adminDashboard.lastUpdated")}: {lastUpdated.toLocaleTimeString("ar")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={loadMetrics}
          className="h-10 w-10 border border-border/60 bg-card rounded-xl grid place-items-center shadow-sm hover:bg-muted/50 transition-colors"
          title={t("common.refresh")}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && (
        <div className="border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-800 rounded-xl">
          <p className="font-semibold mb-1">بعض البيانات لم تُحمّل:</p>
          <p className="text-xs opacity-80 break-all">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, icon: Icon, iconBg, iconColor, suffix }) => (
          <div key={label} className="border border-border/60 bg-card p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
                <Icon className={cn("w-4.5 h-4.5", iconColor)} />
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {loading ? "-" : value.toLocaleString()}
            </p>
            {suffix && !loading && (
              <p className="text-xs text-muted-foreground mt-1">{suffix}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {alertCards.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className={cn(
              "border p-4 rounded-2xl shadow-sm transition-all",
              tone === "good" && "border-emerald-200 bg-emerald-50/50",
              tone === "warn" && "border-amber-200 bg-amber-50/50",
              tone === "bad" && "border-red-200 bg-red-50/50",
              tone === "neutral" && "border-border/60 bg-card"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon className={cn(
                  "w-5 h-5",
                  tone === "good" && "text-emerald-600",
                  tone === "warn" && "text-amber-600",
                  tone === "bad" && "text-red-600",
                  tone === "neutral" && "text-muted-foreground"
                )} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <span className="text-xl font-bold">{loading ? "-" : value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border/60 bg-card rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {t("adminDashboard.licensesBreakdown")}
          </h3>
          <div className="space-y-2.5">
            {licenseBreakdown.map(({ label, count, color, bg, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", bg)}>
                    <Icon className={cn("w-3.5 h-3.5", color)} />
                  </div>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
                <span className={cn("text-sm font-bold", color)}>
                  {loading ? "-" : count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border/60 bg-card rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t("adminDashboard.recentTransfers")}
          </h3>
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-muted/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : metrics.recentTransfers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              {t("adminDashboard.noRecentTransfers")}
            </div>
          ) : (
            <div className="space-y-2">
              {metrics.recentTransfers.map((transfer, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      transfer.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-600"
                    )}>
                      {transfer.status === "success" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{maskPhone(transfer.phone)}</p>
                      <p className="text-xs text-muted-foreground">{transfer.operator}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-bold">{transfer.amount.toLocaleString()} {t("common.currencySymbol")}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(transfer.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border border-border/60 bg-card rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          {t("adminDashboard.quickActions")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/sys-panel")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <Users className="w-4 h-4" />
            {t("adminDashboard.viewAllUsers")}
          </button>
          <button
            onClick={() => navigate("/sys-panel")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <Activity className="w-4 h-4" />
            {t("adminDashboard.viewAllTransfers")}
          </button>
          <button
            onClick={() => navigate("/sys-panel")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <UserCheck className="w-4 h-4" />
            {t("adminDashboard.viewActivations")}
          </button>
        </div>
      </div>
    </div>
  );
}
