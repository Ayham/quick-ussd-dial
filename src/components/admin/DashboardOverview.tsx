import { useEffect, useState, useCallback, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: "neutral" | "good" | "warn" | "bad";
}

interface Metrics {
  totalUsers: number;
  failedSyncs: number;
  suspiciousEvents: number;
}

const EMPTY: Metrics = { totalUsers: 0, failedSyncs: 0, suspiciousEvents: 0 };

export function DashboardOverview() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setError(null);
    setLoading(true);
    const failuresSince = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    try {
      const results = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("sync_logs").select("id", { count: "exact", head: true })
          .eq("status", "failed").gte("created_at", failuresSince),
      ]);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        setError(firstError.message);
      } else {
        setMetrics({
          totalUsers: results[0].count || 0,
          failedSyncs: results[1].count || 0,
          suspiciousEvents: 0,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const interval = window.setInterval(loadMetrics, 30_000);
    return () => window.clearInterval(interval);
  }, [loadMetrics]);

  const cards: Metric[] = [
    { label: t("admin.users"), value: metrics.totalUsers, icon: Users, tone: "neutral" as const },
    { label: t("adminDashboard.failedSyncs"), value: metrics.failedSyncs, icon: RefreshCw, tone: metrics.failedSyncs ? "bad" : "good" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
<h2 className="text-xl font-bold">{t("admin.dashboard")}</h2>
	           <p className="text-sm text-muted-foreground">{t("adminDashboard.refreshNote")}</p>
        </div>
        <button onClick={loadMetrics} className="h-10 w-10 border border-border/60 bg-card rounded-xl grid place-items-center shadow-sm hover:bg-muted/50 transition-colors" title={t("common.refresh")}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && (
<div className="border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive rounded-xl">
	          {t("adminDashboard.queryFailed", { error })}
	        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={cn(
            "border p-4.5 min-h-28 shadow-sm rounded-2xl",
            tone === "good" && "border-success/25 bg-success/5",
            tone === "bad" && "border-destructive/30 bg-destructive/5",
            tone === "neutral" && "border-border/60 bg-card"
          )}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-4">{loading ? "-" : value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
