import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getActualDeductedAmount } from "@/lib/amount-utils";
import { formatDateTime } from "@/lib/format-date";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Transfer {
  id: string;
  device_id: string;
  user_id?: string;
  phone: string;
  amount: number;
  operator: string;
  status: string;
  created_at: string;
  synced_at: string;
  package_price?: number | null;
  package_name?: string | null;
  sync_status?: string | null;
  profile_email?: string | null;
  profile_name?: string | null;
}

export function TransfersViewer() {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [userFilter, setUserFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data || []) as Transfer[];
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))] as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id,email,display_name").in("user_id", userIds)
        : { data: [] };
      const profileMap = Object.fromEntries(((profiles || []) as Array<{ user_id: string; email?: string | null; display_name?: string | null }>).map((profile) => [profile.user_id, profile]));
      setTransfers(rows.map((row) => ({
        ...row,
        profile_email: row.user_id ? profileMap[row.user_id]?.email ?? null : null,
        profile_name: row.user_id ? profileMap[row.user_id]?.display_name ?? null : null,
        sync_status: row.synced_at ? "synced" : "pending",
      })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransfers();
    const interval = setInterval(loadTransfers, 60000);
    return () => clearInterval(interval);
  }, [loadTransfers]);

  const filteredTransfers = useMemo(() => transfers.filter((t) => {
    const matchesSearch = [t.phone, t.device_id, t.operator, t.profile_email, t.profile_name].some((value) => (value || "").toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;
    if (userFilter !== "all" && t.user_id !== userFilter) return false;
    if (deviceFilter !== "all" && t.device_id !== deviceFilter) return false;
    if (dateRange.start) {
      const transferDate = new Date(t.created_at).toISOString().split("T")[0];
      if (transferDate < dateRange.start) return false;
    }
    if (dateRange.end) {
      const transferDate = new Date(t.created_at).toISOString().split("T")[0];
      if (transferDate > dateRange.end) return false;
    }
    return true;
  }), [dateRange.end, dateRange.start, deviceFilter, search, transfers, userFilter]);

  const stats = {
    total: transfers.length,
    succeeded: transfers.filter((t) => t.status === "success" || t.status === "completed").length,
    failed: transfers.filter((t) => t.status === "failed").length,
    pending: transfers.filter((t) => t.status === "pending").length,
    totalAmount: transfers.reduce((sum, t) => sum + getActualDeductedAmount(t.operator, t.amount !== undefined ? t.amount : 0), 0),
    mtn: transfers.filter((t) => (t.operator || "").toLowerCase() === "mtn").length,
    syriatel: transfers.filter((t) => (t.operator || "").toLowerCase() === "syriatel").length,
  };

  const userOptions = useMemo(() => [...new Set(transfers.map((row) => row.user_id).filter(Boolean))].sort(), [transfers]);
  const deviceOptions = useMemo(() => [...new Set(transfers.map((row) => row.device_id))].sort(), [transfers]);

  if (loading && transfers.length === 0) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
<Button variant="outline" size="sm" onClick={loadTransfers}>
	             {t("common.retry")}
	           </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input placeholder={t("adminTransfers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
<Button
	           size="sm"
	           variant="ghost"
	           className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 rounded-lg"
	           onClick={loadTransfers}
	           title={t("adminTransfers.refresh")}
	         >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
        <div className="flex gap-2">
<Input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="h-10" placeholder={t("adminTransfers.fromDate")} />
	           <Input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="h-10" placeholder={t("adminTransfers.toDate")} />
        </div>
        <div className="flex gap-2">
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">{t("adminTransfers.allUsers")}</option>
            {userOptions.map((userId) => <option key={userId} value={userId}>{userId}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">{t("adminTransfers.allDevices")}</option>
            {deviceOptions.map((deviceId) => <option key={deviceId} value={deviceId}>{deviceId}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <div className="bg-card rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold">{stats.total}</div>
	           <div className="text-xs text-muted-foreground">{t("adminTransfers.total")}</div>
        </div>
        <div className="bg-success/10 rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold text-success">{stats.succeeded}</div>
	           <div className="text-xs text-muted-foreground">{t("adminTransfers.success")}</div>
        </div>
        <div className="bg-destructive/10 rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold text-destructive">{stats.failed}</div>
	           <div className="text-xs text-muted-foreground">{t("adminTransfers.failed")}</div>
        </div>
        <div className="bg-info/10 rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold text-info">{stats.pending}</div>
	           <div className="text-xs text-muted-foreground">{t("admin.pending")}</div>
        </div>
        <div className="bg-operator-mtn/10 rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold text-operator-mtn">{stats.mtn}</div>
	           <div className="text-xs text-muted-foreground">{t("operator.mtn")}</div>
        </div>
        <div className="bg-primary/10 rounded-2xl p-2 text-center shadow-card">
<div className="text-sm font-semibold text-primary">{stats.totalAmount.toLocaleString()}</div>
	           <div className="text-xs text-muted-foreground">{t("adminTransfers.totalAmount")}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
<th className="text-left p-3 font-semibold">{t("adminActivationRequests.user")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminTransfers.device")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminActivationRequests.phone")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminTransfers.operator")}</th>
	                <th className="text-left p-3 font-semibold">{t("adminTransfers.price")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminTransfers.package")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminTransfers.sync")}</th>
	               <th className="text-left p-3 font-semibold">{t("adminActivationRequests.date")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransfers.map((transfer) => (
              <tr key={transfer.id} className="border-b hover:bg-muted/50">
                <td className="p-3 text-xs">{transfer.profile_name || transfer.profile_email || transfer.user_id || "—"}</td>
                <td className="p-3 text-xs font-mono whitespace-nowrap">{transfer.device_id}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">{transfer.phone}</td>
                <td className="p-3 text-xs">{transfer.operator === "mtn" ? t("adminTransfers.mtn") : transfer.operator === "syriatel" ? t("adminTransfers.syriatel") : t("adminTransfers.unknown")}</td>
                <td className="p-3 font-semibold">{(transfer.package_price ?? getActualDeductedAmount(transfer.operator, transfer.amount)).toLocaleString()} {t("adminTransfers.currency")}</td>
                <td className="p-3 text-xs">{transfer.package_name ? `${transfer.package_name} / ${transfer.package_price ?? 0}` : "—"}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${transfer.sync_status === "synced" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    {transfer.sync_status === "synced" ? t("adminTransfers.synced") : t("admin.pending")}
                  </span>
                </td>
                <td className="p-3 text-xs">{formatDateTime(transfer.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

{filteredTransfers.length === 0 && (
	         <div className="text-center py-8 text-muted-foreground">{t("adminTransfers.noTransfers")}</div>
	       )}

<div className="text-xs text-muted-foreground pt-4">
	         {t("adminTransfers.showing", { count: filteredTransfers.length, total: stats.total })}
	       </div>
    </div>
  );
}
