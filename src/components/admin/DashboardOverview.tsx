import { useEffect, useState, type ComponentType } from "react";
import {
  Activity, AlertTriangle, Ban, CheckCircle, Clock, Key, RefreshCw, ShieldAlert,
  Smartphone, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Metric {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: "neutral" | "good" | "warn" | "bad";
}

interface MonitoringMetrics {
  totalUsers: number;
  totalDevices: number;
  activeDevices: number;
  blockedDevices: number;
  activeLicenses: number;
  suspendedLicenses: number;
  revokedLicenses: number;
  expiringLicenses: number;
  activeTrials: number;
  expiringTrials: number;
  pendingActivations: number;
  failedSyncs: number;
  suspiciousEvents: number;
}

const EMPTY: MonitoringMetrics = {
  totalUsers: 0,
  totalDevices: 0,
  activeDevices: 0,
  blockedDevices: 0,
  activeLicenses: 0,
  suspendedLicenses: 0,
  revokedLicenses: 0,
  expiringLicenses: 0,
  activeTrials: 0,
  expiringTrials: 0,
  pendingActivations: 0,
  failedSyncs: 0,
  suspiciousEvents: 0,
};

export function DashboardOverview() {
  const [metrics, setMetrics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMetrics() {
    setError(null);
    const now = new Date();
    const activeSince = new Date(now.getTime() - 15 * 60_000).toISOString();
    const trialCutoff = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const licenseCutoff = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const failuresSince = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

    const results = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("devices").select("id", { count: "exact", head: true }),
      supabase.from("devices").select("id", { count: "exact", head: true }).gte("last_activity_at", activeSince),
      supabase.from("devices").select("id", { count: "exact", head: true }).eq("is_blocked", true),
      supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "revoked"),
      supabase.from("licenses").select("id", { count: "exact", head: true })
        .eq("status", "active").eq("permanent", false).lte("expiry_date", licenseCutoff),
      supabase.from("trials").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("trials").select("id", { count: "exact", head: true })
        .eq("status", "active").lte("expires_at", trialCutoff),
      supabase.from("activations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("sync_logs").select("id", { count: "exact", head: true })
        .eq("status", "failed").gte("created_at", failuresSince),
      supabase.from("app_events").select("id", { count: "exact", head: true })
        .in("event", ["fingerprint_mismatch", "device_owner_mismatch", "app_instance_changed"])
        .gte("created_at", failuresSince),
    ]);

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      const counts = results.map((result) => result.count || 0);
      setMetrics({
        totalUsers: counts[0],
        totalDevices: counts[1],
        activeDevices: counts[2],
        blockedDevices: counts[3],
        activeLicenses: counts[4],
        suspendedLicenses: counts[5],
        revokedLicenses: counts[6],
        expiringLicenses: counts[7],
        activeTrials: counts[8],
        expiringTrials: counts[9],
        pendingActivations: counts[10],
        failedSyncs: counts[11],
        suspiciousEvents: counts[12],
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
    { label: "Devices", value: metrics.totalDevices, icon: Smartphone, tone: "neutral" },
    { label: "Active devices (15m)", value: metrics.activeDevices, icon: Activity, tone: "good" },
    { label: "Blocked devices", value: metrics.blockedDevices, icon: Ban, tone: metrics.blockedDevices ? "bad" : "good" },
    { label: "Active licenses", value: metrics.activeLicenses, icon: Key, tone: "good" },
    { label: "Suspended licenses", value: metrics.suspendedLicenses, icon: ShieldAlert, tone: metrics.suspendedLicenses ? "warn" : "good" },
    { label: "Revoked licenses", value: metrics.revokedLicenses, icon: Ban, tone: metrics.revokedLicenses ? "bad" : "neutral" },
    { label: "Licenses expiring (30d)", value: metrics.expiringLicenses, icon: Clock, tone: metrics.expiringLicenses ? "warn" : "good" },
    { label: "Active trials", value: metrics.activeTrials, icon: CheckCircle, tone: "neutral" },
    { label: "Trials expiring (7d)", value: metrics.expiringTrials, icon: Clock, tone: metrics.expiringTrials ? "warn" : "good" },
    { label: "Pending activations", value: metrics.pendingActivations, icon: CheckCircle, tone: metrics.pendingActivations ? "warn" : "good" },
    { label: "Failed syncs (24h)", value: metrics.failedSyncs, icon: RefreshCw, tone: metrics.failedSyncs ? "bad" : "good" },
    { label: "Suspicious events (24h)", value: metrics.suspiciousEvents, icon: AlertTriangle, tone: metrics.suspiciousEvents ? "bad" : "good" },
  ];

  const tones = {
    neutral: "border-border bg-card",
    good: "border-emerald-500/25 bg-emerald-500/5",
    warn: "border-amber-500/30 bg-amber-500/5",
    bad: "border-destructive/30 bg-destructive/5",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Operational monitoring</h2>
          <p className="text-sm text-muted-foreground">Server-backed status, refreshed every 30 seconds.</p>
        </div>
        <button onClick={loadMetrics} className="h-9 w-9 border border-border bg-card grid place-items-center" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Monitoring query failed: {error}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`border p-4 min-h-28 ${tones[tone]}`}>
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
