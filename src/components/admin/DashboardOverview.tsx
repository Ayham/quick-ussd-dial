import { useEffect, useState, type ComponentType } from "react";
import {
  Activity, RefreshCw, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

const EMPTY: Metrics = {
  totalUsers: 0,
  failedSyncs: 0,
  suspiciousEvents: 0,
};

export function DashboardOverview() {
  const [metrics, setMetrics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMetrics() {
    setError(null);
    const failuresSince = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    const results = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("sync_logs").select("id", { count: "exact", head: true })
        .eq("status", "failed").gte("created_at", failuresSince),
    ]);

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      const counts = results.map((result) => result.count || 0);
      setMetrics({
        totalUsers: counts[0],
        failedSyncs: counts[1],
        suspiciousEvents: 0,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMetrics();
    const interval = window.setInterval(loadMetrics, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const cards: Metric[] = [
    { label: "Users", value: metrics.totalUsers, icon: Users, tone: "neutral" },
    { label: "Failed syncs (24h)", value: metrics.failedSyncs, icon: RefreshCw, tone: metrics.failedSyncs ? "bad" : "good" },
  ];

  const tones = {
    neutral: "border-border bg-card rounded-2xl",
    good: "border-success/25 bg-success/5 rounded-2xl",
    warn: "border-warning/30 bg-warning/5 rounded-2xl",
    bad: "border-destructive/30 bg-destructive/5 rounded-2xl",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Refreshed every 30 seconds.</p>
        </div>
        <button onClick={loadMetrics} className="h-10 w-10 border border-border bg-card rounded-xl grid place-items-center shadow-sm" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive rounded-2xl">
          Query failed: {error}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`border p-4 min-h-28 shadow-card ${tones[tone]}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-2xl font-bold mt-4">{loading ? "-" : value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
