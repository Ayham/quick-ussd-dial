import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Smartphone, Shield, ShieldOff, Search, AlertTriangle, MonitorSmartphone, CheckCircle2, RotateCcw, Info, Users, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface DeviceItem {
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
}

export function DevicesManager() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  // Dialogs
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [blockTarget, setBlockTarget] = useState<DeviceItem | null>(null);
  const [resetTarget, setResetTarget] = useState<DeviceItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeviceItem | null>(null);
  const [showResetAll, setShowResetAll] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_sync_monitor", {});
      if (error) throw error;
      const result = data as unknown as { devices?: DeviceItem[] };
      setDevices(result?.devices || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminDevices.actionFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleBlock = async (deviceId: string, block: boolean) => {
    setBusy("block_" + deviceId);
    try {
      const rpcName = block ? "admin_block_device" : "admin_unblock_device";
      const params = block ? { _device_id: deviceId, _reason: "Blocked by administrator" } : { _device_id: deviceId };
      const { error } = await supabase.rpc(rpcName as any, params);
      if (error) throw error;
      toast.success(block ? t("adminDevices.deviceBlockedSuccess") : t("adminDevices.deviceUnblockedSuccess"));
      setBlockTarget(null);
      await loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminDevices.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleResetDevice = async (userId: string | null) => {
    if (!userId) return;
    setBusy("reset_" + userId);
    try {
      const { error } = await supabase.rpc("admin_reset_user_device", { _user_id: userId });
      if (error) throw error;
      toast.success(t("adminDevices.deviceResetSuccess"));
      setResetTarget(null);
      await loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminDevices.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    setBusy("delete_" + deviceId);
    try {
      const { error } = await supabase.from("devices").delete().eq("device_id", deviceId);
      if (error) throw error;
      toast.success(t("adminDevices.deviceDeletedSuccess"));
      setDeleteTarget(null);
      await loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminDevices.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleResetAllDevices = async () => {
    setBusy("reset_all");
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ current_device: null, updated_at: new Date().toISOString() })
        .not("current_device", "is", null);
      if (profileError) throw profileError;

      const { error: sessionError } = await supabase
        .from("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .is("revoked_at", null);
      if (sessionError) throw sessionError;

      toast.success(t("adminDevices.resetAllSuccess"));
      setShowResetAll(false);
      await loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminDevices.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  // Count devices per user for multi-device detection
  const deviceCountByUser = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of devices) {
      const uid = d.user_id || d.email || "unknown";
      counts[uid] = (counts[uid] || 0) + 1;
    }
    return counts;
  }, [devices]);

  // Filter and sort devices: Grouped by user, and newest first within each user
  const sortedAndFilteredDevices = useMemo(() => {
    const filtered = devices.filter((d) => {
      const matchesSearch = [d.device_id, d.display_name, d.email, d.platform, d.app_version].some((v) =>
        (v || "").toLowerCase().includes(search.toLowerCase())
      );
      if (!matchesSearch) return false;
      if (statusFilter === "active" && (d.is_blocked || !d.is_active)) return false;
      if (statusFilter === "blocked" && !d.is_blocked) return false;
      if (statusFilter === "pending" && d.lifecycle_state !== "pending_activation") return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const userA = a.user_id || a.email || "unknown";
      const userB = b.user_id || b.email || "unknown";
      if (userA !== userB) {
        return userA.localeCompare(userB);
      }
      // Secondary sort: Newest first
      const timeA = new Date(a.last_sync_at || a.last_seen || 0).getTime();
      const timeB = new Date(b.last_sync_at || b.last_seen || 0).getTime();
      return timeB - timeA;
    });
  }, [devices, search, statusFilter]);

  // Assign distinct background color per user group
  let lastUserKey: string | null = null;
  let userGroupToggle = false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">{t("adminDevices.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("adminDevices.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowResetAll(true)}
            disabled={loading || busy === "reset_all"}
            className="h-9 gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {t("adminDevices.resetAllDevices")}
          </Button>
          <Button size="sm" variant="outline" onClick={loadDevices} disabled={loading} className="h-9 gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("adminDevices.searchPlaceholder")}
            className="pl-9 pr-4 h-10 rounded-xl"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-medium"
        >
          <option value="all">{t("adminDevices.allStatuses")}</option>
          <option value="active">{t("adminDevices.active")}</option>
          <option value="blocked">{t("adminDevices.blocked")}</option>
          <option value="pending">{t("adminDevices.pending")}</option>
        </select>
      </div>

      {loading && !devices.length ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : sortedAndFilteredDevices.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("syncMonitor.noDevices")}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left p-3 font-semibold">{t("syncMonitor.device")}</th>
                <th className="text-left p-3 font-semibold">{t("syncMonitor.user")}</th>
                <th className="text-left p-3 font-semibold">{t("adminDevices.platform")}</th>
                <th className="text-left p-3 font-semibold">{t("adminDevices.version")}</th>
                <th className="text-left p-3 font-semibold">{t("syncMonitor.status")}</th>
                <th className="text-left p-3 font-semibold">{t("syncMonitor.lastSync")}</th>
                <th className="text-right p-3 font-semibold">{t("adminUsers.options")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredDevices.map((d) => {
                const userKey = d.user_id || d.email || "unknown";
                if (userKey !== lastUserKey) {
                  lastUserKey = userKey;
                  userGroupToggle = !userGroupToggle;
                }
                const count = deviceCountByUser[userKey] || 1;
                const isMultiDevice = count > 1;

                return (
                  <tr
                    key={d.device_id}
                    className={cn(
                      "border-b transition-colors align-middle",
                      isMultiDevice
                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                        : userGroupToggle
                        ? "bg-white hover:bg-muted/40"
                        : "bg-slate-50/60 hover:bg-muted/40"
                    )}
                  >
                    <td className="p-3">
                      <div className="font-mono text-xs font-semibold flex items-center gap-1.5" dir="ltr">
                        {d.device_id}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{d.lifecycle_state || "normal"}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium flex items-center gap-1.5 flex-wrap">
                        <span>{d.display_name || d.email || "—"}</span>
                        {isMultiDevice && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 border border-amber-500/30">
                            <Users className="w-3 h-3" />
                            {t("adminDevices.multipleDevices")} ({count})
                          </span>
                        )}
                      </div>
                      {d.email && <div className="text-muted-foreground text-[11px]">{d.email}</div>}
                    </td>
                    <td className="p-3 text-xs capitalize">{d.platform || "—"}</td>
                    <td className="p-3 text-xs font-mono">{d.app_version || "—"}</td>
                    <td className="p-3">
                      {d.is_blocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/10 text-destructive">
                          <ShieldOff className="w-3 h-3" />
                          {t("adminDevices.blocked")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/10 text-success">
                          <CheckCircle2 className="w-3 h-3" />
                          {t("adminDevices.active")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {d.last_sync_at ? formatDateTime(d.last_sync_at) : (d.last_seen ? formatDateTime(d.last_seen) : "—")}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => { setSelectedDevice(d); setShowDetails(true); }}
                        >
                          <Info className="w-3.5 h-3.5 mr-1" />
                          {t("adminDevices.details")}
                        </Button>
                        {d.is_blocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs text-success hover:text-success"
                            disabled={busy === "block_" + d.device_id}
                            onClick={() => handleBlock(d.device_id, false)}
                          >
                            <Shield className="w-3.5 h-3.5 mr-1" />
                            {t("adminDevices.unblockDevice")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={busy === "block_" + d.device_id}
                            onClick={() => setBlockTarget(d)}
                          >
                            <ShieldOff className="w-3.5 h-3.5 mr-1" />
                            {t("adminDevices.blockDevice")}
                          </Button>
                        )}
                        {d.user_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={busy === "reset_" + d.user_id}
                            onClick={() => setResetTarget(d)}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            {t("adminUsers.resetDevice")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={busy === "delete_" + d.device_id}
                          onClick={() => setDeleteTarget(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          {t("adminDevices.deleteDevice")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminDevices.details")}</DialogTitle>
            <DialogDescription>{selectedDevice?.display_name || selectedDevice?.email || ""}</DialogDescription>
          </DialogHeader>
          {selectedDevice && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">{t("syncMonitor.device")}:</span>
                <span className="font-mono font-medium break-all" dir="ltr">{selectedDevice.device_id}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">{t("adminDevices.platform")}:</span>
                <span className="capitalize">{selectedDevice.platform || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">{t("adminDevices.version")}:</span>
                <span className="font-mono">{selectedDevice.app_version || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">{t("syncMonitor.status")}:</span>
                <span>{selectedDevice.is_blocked ? t("adminDevices.blocked") : t("adminDevices.active")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">{t("syncMonitor.lastSync")}:</span>
                <span>{selectedDevice.last_sync_at ? formatDateTime(selectedDevice.last_sync_at) : "—"}</span>
              </div>
              {selectedDevice.last_sync_error && (
                <div className="grid grid-cols-2 gap-2 text-destructive">
                  <span>{t("syncMonitor.syncError")}:</span>
                  <span>{selectedDevice.last_sync_error}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetails(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Confirm Dialog */}
      <AlertDialog open={!!blockTarget} onOpenChange={(open) => { if (!open) setBlockTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminDevices.blockConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("adminDevices.blockConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blockTarget && handleBlock(blockTarget.device_id, true)}
            >
              {t("adminDevices.blockDevice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirm Dialog */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminDevices.resetConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("adminDevices.resetConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && handleResetDevice(resetTarget.user_id)}
            >
              {t("adminUsers.resetDevice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminDevices.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("adminDevices.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDeleteDevice(deleteTarget.device_id)}
            >
              {t("adminDevices.deleteDevice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset All Confirm Dialog */}
      <AlertDialog open={showResetAll} onOpenChange={setShowResetAll}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminDevices.resetAllConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("adminDevices.resetAllConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleResetAllDevices}
            >
              {t("adminDevices.resetAllDevices")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
