import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Smartphone, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SyncMonitorDevice {
  device_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  app_version: string | null;
  platform: string | null;
  lifecycle_state: string | null;
  is_active: boolean;
  is_blocked: boolean;
  last_seen: string | null;
  last_seen_at: string | null;
  last_sync_at: string | null;
  pending_sync_count: number;
  last_sync_error: string | null;
  transfers_24h: number;
  transfers_7d: number;
  last_transfer_at: string | null;
}

interface SyncMonitorTotals {
  total_devices: number;
  active_24h: number;
  active_7d: number;
  needs_attention: number;
  with_pending: number;
  transfers_24h: number;
  transfers_7d: number;
  transfers_failed_7d: number;
}

const EMPTY_TOTALS: SyncMonitorTotals = {
  total_devices: 0,
  active_24h: 0,
  active_7d: 0,
  needs_attention: 0,
  with_pending: 0,
  transfers_24h: 0,
  transfers_7d: 0,
  transfers_failed_7d: 0,
};

const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(value: string | null | undefined): boolean {
  if (!value) return true;
  const t = new Date(value).getTime();
  return Number.isNaN(t) || Date.now() - t > STALE_MS;
}

export function SyncMonitor() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<SyncMonitorDevice[]>([]);
  const [totals, setTotals] = useState<SyncMonitorTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("admin_get_sync_monitor", {});
      if (error) throw error;
      const result = data as unknown as {
        totals?: SyncMonitorTotals;
        devices?: SyncMonitorDevice[];
      };
      setTotals(result?.totals || EMPTY_TOTALS);
      setDevices(result?.devices || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const statusOf = (d: SyncMonitorDevice): { tone: "good" | "warn" | "bad" | "neutral"; label: string } => {
    if (d.is_blocked) return { tone: "bad", label: t("syncMonitor.blocked") };
    if (d.lifecycle_state === "pending_activation") return { tone: "warn", label: t("syncMonitor.pendingActivation") };
    if (d.last_sync_error && d.last_sync_at && !isStale(d.last_sync_at)) {
      return { tone: "warn", label: t("syncMonitor.syncError") };
    }
    if (d.pending_sync_count > 0) return { tone: "warn", label: t("syncMonitor.pendingQueue") };
    if (d.last_sync_at && !isStale(d.last_sync_at)) return { tone: "good", label: t("syncMonitor.live") };
    if (d.last_sync_at) return { tone: "warn", label: t("syncMonitor.stale") };
    return { tone: "neutral", label: t("syncMonitor.neverSynced") };
  };

  const cards = [
    { label: t("syncMonitor.totalDevices"), value: totals.total_devices, icon: Smartphone, tone: "neutral" },
    { label: t("syncMonitor.active24h"), value: totals.active_24h, icon: CheckCircle2, tone: "good" },
    { label: t("syncMonitor.needsAttention"), value: totals.needs_attention, icon: AlertTriangle, tone: totals.needs_attention ? "warn" : "good" },
    { label: t("syncMonitor.transfers24h"), value: totals.transfers_24h, icon: Database, tone: "neutral" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("admin.sync")}</h2>
          <p className="text-sm text-muted-foreground">{t("syncMonitor.refreshNote")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-9 gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </Button>
      </div>

      {loadError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={load}>{t("common.retry")}</Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={cn(
            "border p-4.5 min-h-28 shadow-sm rounded-2xl",
            tone === "good" && "border-success/25 bg-success/5",
            tone === "warn" && "border-amber-400/30 bg-amber-500/5",
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

      {loading && !devices.length ? (
        <div className="text-center py-8 text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">{t("syncMonitor.noDevices")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.device")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.user")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.appVersion")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.status")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.lastSync")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.pending")}</th>
                <th className="text-left p-2 whitespace-nowrap">{t("syncMonitor.transfers24h")}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const status = statusOf(d);
                return (
                  <tr key={d.device_id} className="border-b hover:bg-muted/50 align-top">
                    <td className="p-2">
                      <div className="font-mono text-[10px] whitespace-nowrap">{d.device_id}</div>
                      <div className="text-[10px] text-muted-foreground">{d.platform || "—"}</div>
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">
                      {d.display_name || d.email || "—"}
                      {d.user_id && (
                        <div className="font-mono text-[10px] text-muted-foreground">{d.user_id.slice(0, 8)}…</div>
                      )}
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">{d.app_version || "—"}</td>
                    <td className="p-2">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                        status.tone === "good" && "bg-success/10 text-success",
                        status.tone === "warn" && "bg-amber-500/10 text-amber-600",
                        status.tone === "bad" && "bg-destructive/10 text-destructive",
                        status.tone === "neutral" && "bg-muted text-muted-foreground"
                      )}>
                        <Clock className="w-3 h-3" />
                        {status.label}
                      </span>
                      {d.last_sync_error && (
                        <div className="text-[10px] text-destructive mt-0.5 max-w-[200px] truncate" title={d.last_sync_error}>
                          {d.last_sync_error}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">
                      {d.last_sync_at ? formatDateTime(d.last_sync_at) : "—"}
                    </td>
                    <td className="p-2 text-xs">
                      {d.pending_sync_count > 0 ? (
                        <span className="font-bold text-amber-600">{d.pending_sync_count}</span>
                      ) : "0"}
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">{d.transfers_24h}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
