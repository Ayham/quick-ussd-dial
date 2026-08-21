import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Shield, ShieldOff, Search, AlertTriangle, RefreshCw, Eye, Trash2, ShieldCheck, Ban, CheckCircle2, MonitorSmartphone, History, Smartphone, Loader2, ChevronLeft, ChevronRight, Wrench, Wallet, MoreVertical, Users, ChevronDown } from "lucide-react";
import { PaymentsDialog } from "@/components/admin/PaymentsDialog";

interface UserInfo {
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  license_status: string;
  license_type: string;
  expiry_date: string | null;
  current_device: string | null;
  last_login: string | null;
  last_sync: string | null;
  account_status: string;
  language: string | null;
  updated_at: string | null;
  role: string | null;
  roles: string | null;
  is_admin: boolean;
  notes: string | null;
  customer_status: string | null;
  shop_name: string | null;
  city: string | null;
  address: string | null;
  commission_type: string | null;
  commission_value: number | null;
  credit_limit: number | null;
  emergency_phone: string | null;
  service_type: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  trial_remaining_days: number | null;
  activation_status: string | null;
  activation_processed_at: string | null;
  activation_processed_by: string | null;
  payments_summary: Array<{ currency: string; total: number; count: number }> | null;
  notifications_summary: { total: number; delivered: number; failed: number; pending: number; unread: number } | null;
  activations_summary: { pending: number; approved: number; rejected: number; latest_status: string; latest_at: string } | null;
  // Distributor assignment fields
  distributor_id: string | null;
  distributor_code: string | null;
  distributor_name: string | null;
  distributor_assignment_status: string | null;
}

interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  device_model: string | null;
  platform: string | null;
  app_version: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_active: boolean;
  is_blocked: boolean;
  is_banned: boolean;
  lifecycle_state: string | null;
  session_count: number;
  revoked_count: number;
  has_active_session: boolean;
  is_current: boolean;
  status: "active" | "registered" | "revoked" | "blocked";
}

interface ActivationHistoryEntry {
  id: string;
  user_id: string;
  status: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const config: Record<string, { label: string; cls: string }> = {
    active: { label: t("admin.active"), cls: "bg-green-500/10 text-green-600" },
    trial: { label: t("adminLicenses.trial"), cls: "bg-blue-500/10 text-blue-600" },
    suspended: { label: t("adminLicenses.suspended"), cls: "bg-amber-500/10 text-amber-600" },
    blocked: { label: t("adminLicenses.blocked"), cls: "bg-red-500/10 text-red-600" },
    expired: { label: t("adminLicenses.expired"), cls: "bg-muted text-muted-foreground" },
    pending: { label: t("admin.pending"), cls: "bg-muted text-muted-foreground" },
    rejected: { label: t("admin.rejected"), cls: "bg-muted text-muted-foreground" },
    permanent: { label: t("adminActivationRequests.permanent"), cls: "bg-green-500/10 text-green-600" },
  };
  const c = config[status] || { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={"text-xs px-2 py-0.5 rounded-full whitespace-nowrap " + c.cls}>{c.label}</span>;
}

export function UsersRolesManager() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [rows, setRows] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [accountStatusFilter, setAccountStatusFilter] = useState<string | null>(null);
  const [activationStatusFilter, setActivationStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [showDetails, setShowDetails] = useState(false);
  const [detailsUser, setDetailsUser] = useState<UserInfo | null>(null);
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesUser, setDevicesUser] = useState<UserInfo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ActivationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserInfo | null>(null);
  const [blockTarget, setBlockTarget] = useState<UserInfo | null>(null);
  const [blockAction, setBlockAction] = useState<"block" | "unblock">("block");
  const [resetDeviceUser, setResetDeviceUser] = useState<UserInfo | null>(null);
  const [showPayments, setShowPayments] = useState(false);
  const [paymentsUser, setPaymentsUser] = useState<UserInfo | null>(null);
  const [showAssignDistributor, setShowAssignDistributor] = useState(false);
  const [assignDistributorUser, setAssignDistributorUser] = useState<UserInfo | null>(null);
  const [assignDistributorLoading, setAssignDistributorLoading] = useState(false);
  const [availableDistributors, setAvailableDistributors] = useState<Array<{id: string; user_id: string; code: string; display_name: string | null; commission_rate: number}>>([]);
  const [selectedDistributorId, setSelectedDistributorId] = useState<string>("");

  const [settingsMap, setSettingsMap] = useState<Record<string, { mtnSecret: string; syriatelSerial: string; syriatelDistributor: string; updated_at?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("admin_get_users_admin", {
        _search: q.trim() || null,
        _status: statusFilter !== "all" ? statusFilter : null,
        _account_status: accountStatusFilter || null,
        _role: roleFilter || null,
        _activation_status: activationStatusFilter || null,
        _page: page,
        _page_size: pageSize,
      });
      if (error) throw error;
      const result = data as unknown as { users: UserInfo[]; total: number };
      setRows(result.users || []);
      setTotal(result.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
      toast.error(t("adminUsers.failedToLoad", { error: msg }));
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, page, roleFilter, accountStatusFilter, activationStatusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (rows.length === 0) return;
    const userIds = rows.map((u) => u.user_id);
    supabase
      .from("app_settings")
      .select("user_id, key, value, updated_at")
      .in("user_id", userIds)
      .eq("key", "ussd_credentials")
      .then(({ data, error }) => {
        if (error) { console.error("[UsersRolesManager] app_settings query error:", error); return; }
        console.log("[UsersRolesManager] fetched app_settings:", data);
        if (!data) return;
        const map: Record<string, { mtnSecret: string; syriatelSerial: string; syriatelDistributor: string; updated_at?: string }> = {};
        for (const row of data) {
          const v = (typeof row.value === "object" && row.value !== null ? row.value : {}) as Record<string, string>;
          map[row.user_id] = {
            mtnSecret: v.mtnSecret || "",
            syriatelSerial: v.syriatelSerial || "",
            syriatelDistributor: v.syriatelDistributor || "",
            updated_at: row.updated_at,
          };
        }
        setSettingsMap(map);
      })
      .catch((err) => { console.error("[UsersRolesManager] app_settings fetch failed:", err); });
  }, [rows]);

  const loadDistributors = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("admin_get_distributors", {
        _search: null,
        _status: "active",
        _page: 1,
        _page_size: 100,
      });
      if (error) throw error;
      const result = data as { distributors: Array<{id: string; user_id: string; code: string; display_name: string | null; commission_rate: number}>; total: number };
      setAvailableDistributors(result.distributors || []);
    } catch {
      setAvailableDistributors([]);
    }
  }, []);

  useEffect(() => {
    if (showAssignDistributor) loadDistributors();
  }, [showAssignDistributor, loadDistributors]);

  const handleAssignDistributor = async () => {
    if (!assignDistributorUser || !selectedDistributorId) return;
    setBusy("assignDist_" + assignDistributorUser.user_id);
    setAssignDistributorLoading(true);
    try {
      let error, data;
      if (selectedDistributorId === "__direct_locked__") {
        const res = await supabase.rpc("admin_set_customer_assignment_status", {
          _customer_id: assignDistributorUser.user_id,
          _assignment_status: "direct_locked",
          _distributor_user_id: null,
        });
        data = res.data;
        error = res.error;
      } else if (selectedDistributorId === "__unassigned__") {
        const res = await supabase.rpc("admin_set_customer_assignment_status", {
          _customer_id: assignDistributorUser.user_id,
          _assignment_status: "unassigned",
          _distributor_user_id: null,
        });
        data = res.data;
        error = res.error;
      } else {
        const res = await supabase.rpc("admin_assign_customer_to_distributor", {
          _customer_id: assignDistributorUser.user_id,
          _distributor_user_id: selectedDistributorId,
        });
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (result?.ok) {
        toast.success(t("adminUsers.distributorAssigned"));
        setShowAssignDistributor(false);
        setAssignDistributorUser(null);
        setSelectedDistributorId("");
        load();
      } else {
        toast.error(result?.error || t("admin.failed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.failed"));
    } finally {
      setBusy(null);
      setAssignDistributorLoading(false);
    }
  };

  const handleRemoveDistributor = async (userId: string) => {
    setBusy("removeDist_" + userId);
    try {
      const { data, error } = await supabase.rpc("admin_remove_customer_from_distributor", {
        _customer_id: userId,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (result.ok) {
        toast.success(t("adminUsers.distributorRemoved"));
        load();
      } else {
        toast.error(result.error || t("admin.failed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.failed"));
    } finally {
      setBusy(null);
    }
  };

  const toggleAdmin = async (userId: string, grant: boolean) => {
    setBusy("role_" + userId);
    const { data, error } = await supabase.rpc("admin_set_role", {
      _target_user: userId, _role: "admin", _grant: grant,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok: boolean; reason?: string } | null;
    if (!res?.ok) {
      toast.error(res?.reason === "last_admin" ? t("adminUsers.cannotRemoveLastAdmin") : (res?.reason || t("admin.failed")));
      return;
    }
    toast.success(grant ? t("adminUsers.adminGranted") : t("adminUsers.adminRevoked"));
    load();
  };

  const handleSuspend = async (userId: string, status: string) => {
    setBusy("suspend_" + userId);
    try {
      const { error } = await supabase.rpc("admin_suspend_user", { _target_user_id: userId, _status: status, _reason: null });
      if (error) throw error;
      toast.success(t("adminLicenses.accountStatusUpdated"));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.failed"));
    } finally {
      setBusy(null);
    }
  };

  const handleBlockToggle = async () => {
    if (!blockTarget) return;
    setBusy("block_" + blockTarget.user_id);
    try {
      const { error } = await supabase.rpc("admin_suspend_user", {
        _target_user_id: blockTarget.user_id,
        _status: blockAction === "block" ? "blocked" : "active",
        _reason: blockAction === "block" ? "admin_block" : null,
      });
      if (error) throw error;
      toast.success(blockAction === "block" ? t("adminLicenses.blockUserSuccess") : t("adminLicenses.accountStatusUpdated"));
      setBlockTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.blockUserFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setBusy("delete_" + deleteUserTarget.user_id);
    try {
      const { data, error } = await supabase.rpc("admin_delete_user", { _target_user_id: deleteUserTarget.user_id });
      if (error) throw error;
      const result = data as unknown as { ok?: boolean; reason?: string } | null;
      if (!result?.ok) {
        const reason = result?.reason;
        if (reason === "cannot_delete_self") throw new Error(t("adminLicenses.cannotDeleteSelf"));
        throw new Error(reason || "failed");
      }
      toast.success(t("adminLicenses.deleteUserSuccess"));
      setDeleteUserTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.deleteUserFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleResetDevice = async () => {
    if (!resetDeviceUser) return;
    setBusy("reset_" + resetDeviceUser.user_id);
    try {
      const { data, error } = await supabase.rpc("admin_reset_user_device", { _user_id: resetDeviceUser.user_id });
      if (error) throw error;
      const result = data as unknown as { ok?: boolean; error?: string; reason?: string };
      if (!result?.ok) throw new Error(result?.error || result?.reason || "failed");
      toast.success(t("adminLicenses.resetDeviceSuccess"));
      setResetDeviceUser(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.resetDeviceFailed"));
    } finally {
      setBusy(null);
    }
  };

  const loadDevices = async (user: UserInfo) => {
    setDevicesUser(user);
    setDevicesLoading(true);
    setShowDevices(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_user_devices", { _user_id: user.user_id });
      if (error) throw error;
      const result = data as unknown as { ok: boolean; devices?: DeviceInfo[] };
      setDevices(result?.devices || []);
    } catch {
      setDevices([]);
      toast.error(t("adminLicenses.devicesError"));
    } finally {
      setDevicesLoading(false);
    }
  };

  const loadHistory = async (userId: string) => {
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_activation_history", { _target_user_id: userId });
      if (error) throw error;
      setHistory((data as unknown as { history: ActivationHistoryEntry[] })?.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAdminRepair = () => {
    // admin_repair_self was revoked from authenticated callers (security
    // hardening): first-admin bootstrap is operator/service-role only, so the
    // self-promotion path is intentionally dead.
    toast.error(t("adminLicenses.repairUnavailable"));
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      {loadError && (
        <div className="border border-destructive/20 bg-destructive/10 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive flex-wrap">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="min-w-0 break-all" dir="ltr">{loadError}</span>
          <Button variant="destructive" size="sm" className="ms-auto rounded-xl" onClick={handleAdminRepair}>
            <Wrench className="w-4 h-4 me-1" />{t("adminLicenses.fixPermissions")}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9 h-10 rounded-xl"
            placeholder={t("adminUsers.searchPlaceholder")}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute end-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 rounded-lg"
            onClick={load}
            title={t("adminUsers.refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl">
            <SelectValue placeholder={t("adminLicenses.statusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="trial">{t("adminLicenses.trial")}</SelectItem>
            <SelectItem value="active">{t("admin.active")}</SelectItem>
            <SelectItem value="expired">{t("adminLicenses.expired")}</SelectItem>
            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
            <SelectItem value="permanent">{t("adminActivationRequests.permanent")}</SelectItem>
            <SelectItem value="suspended">{t("adminLicenses.suspended")}</SelectItem>
            <SelectItem value="blocked">{t("adminLicenses.blocked")}</SelectItem>
            <SelectItem value="rejected">{t("admin.rejected")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v || null)}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl">
            <SelectValue placeholder={t("adminUsers.filterByRole")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("adminUsers.allRoles")}</SelectItem>
            <SelectItem value="admin">{t("adminUsers.adminRole")}</SelectItem>
            <SelectItem value="distributor">{t("adminUsers.role_distributor")}</SelectItem>
            <SelectItem value="user">{t("adminUsers.userRole")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountStatusFilter} onValueChange={(v) => setAccountStatusFilter(v || null)}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl">
            <SelectValue placeholder={t("adminUsers.filterByAccountStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="active">{t("admin.active")}</SelectItem>
            <SelectItem value="suspended">{t("adminLicenses.suspended")}</SelectItem>
            <SelectItem value="blocked">{t("adminLicenses.blocked")}</SelectItem>
            <SelectItem value="inactive">{t("adminUsers.inactiveStatus")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activationStatusFilter} onValueChange={(v) => setActivationStatusFilter(v || null)}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl">
            <SelectValue placeholder={t("adminUsers.filterByActivationStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="pending">{t("adminUsers.activationPending")}</SelectItem>
            <SelectItem value="approved">{t("adminUsers.activationApproved")}</SelectItem>
            <SelectItem value="rejected">{t("adminUsers.activationRejected")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground min-w-[220px]">{t("adminActivationRequests.user")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.accountStatus")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.licenseStatus")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.businessNameHeader")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.phoneHeader")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.mtnSecretHeader")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.syriatelSerialHeader")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminUsers.syriatelDistributorHeader")}</th>
                <th className="text-start p-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">{t("adminActivationRequests.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <div className="space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-36" /></div>
                      </div>
                    </td>
                    <td className="p-2.5"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="h-8 w-8" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">{t("adminUsers.noUsers")}</td></tr>
              ) : (
                rows.map((u) => {
                  const hasRole = u.roles && u.roles.includes("admin");
                  return (
                    <tr
                      key={u.user_id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-smooth cursor-pointer"
                      onClick={() => { setDetailsUser(u); setShowDetails(true); }}
                    >
                      <td className="p-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {(u.display_name || u.email || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm truncate max-w-[180px]">{u.display_name || u.email || "—"}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[180px]" dir="ltr">{u.email || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${
                          u.account_status === "active" ? "bg-green-500/10 text-green-600" :
                          u.account_status === "suspended" ? "bg-amber-500/10 text-amber-600" :
                          u.account_status === "blocked" ? "bg-red-500/10 text-red-600" :
                          "bg-muted text-muted-foreground"
                        }`}>{u.account_status || "—"}</span>
                      </td>
                      <td className="p-2.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${
                          u.license_status === "active" ? "bg-green-500/10 text-green-600" :
                          u.license_status === "suspended" ? "bg-amber-500/10 text-amber-600" :
                          u.license_status === "blocked" ? "bg-red-500/10 text-red-600" :
                          u.license_status === "expired" ? "bg-muted text-muted-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>{u.license_status || "—"}</span>
                      </td>
                      <td className="p-2.5 text-xs whitespace-nowrap">{u.shop_name || "—"}</td>
                      <td className="p-2.5 text-xs whitespace-nowrap" dir="ltr">{u.phone || "—"}</td>
                      <td className="p-2.5 text-xs font-mono whitespace-nowrap" dir="ltr">{settingsMap[u.user_id]?.mtnSecret || "—"}</td>
                      <td className="p-2.5 text-xs font-mono whitespace-nowrap" dir="ltr">{settingsMap[u.user_id]?.syriatelSerial || "—"}</td>
                      <td className="p-2.5 text-xs font-mono whitespace-nowrap" dir="ltr">{settingsMap[u.user_id]?.syriatelDistributor || "—"}</td>
                      <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu dir={isArabic ? "rtl" : "ltr"}>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" title={t("adminUsers.options")} aria-label={t("adminUsers.options")}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-xl">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => { setDetailsUser(u); setShowDetails(true); }}>
                              <Eye className="w-3.5 h-3.5 me-1" />{t("adminUsers.viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => toggleAdmin(u.user_id, !hasRole)} disabled={busy === "role_" + u.user_id}>
                              {busy === "role_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : hasRole ? <ShieldOff className="w-3.5 h-3.5 me-1" /> : <Shield className="w-3.5 h-3.5 me-1" />}
                              {hasRole ? t("adminUsers.revoke") : t("adminUsers.makeAdmin")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => loadDevices(u)}>
                              <MonitorSmartphone className="w-3.5 h-3.5 me-1" />{t("adminUsers.viewDevices")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => loadHistory(u.user_id)}>
                              <History className="w-3.5 h-3.5 me-1" />{t("adminUsers.history")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => { setAssignDistributorUser(u); setShowAssignDistributor(true); }} disabled={busy === "assignDist_" + u.user_id}>
                              <Users className="w-3.5 h-3.5 me-1" />{t("adminUsers.assignDistributor")}
                            </DropdownMenuItem>
                            {u.distributor_id && (
                              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => handleRemoveDistributor(u.user_id)} disabled={busy === "removeDist_" + u.user_id}>
                                {busy === "removeDist_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 me-1" />}{t("adminUsers.removeDistributor")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleSuspend(u.user_id, "suspended")} disabled={busy === "suspend_" + u.user_id}>
                              {busy === "suspend_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Ban className="w-3.5 h-3.5 me-1" />}{t("adminUsers.suspend")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleSuspend(u.user_id, "active")} disabled={busy === "suspend_" + u.user_id}>
                              {busy === "suspend_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 me-1 text-success" />}{t("adminUsers.activate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => { setBlockTarget(u); setBlockAction("block"); }} disabled={busy === "block_" + u.user_id}>
                              <ShieldOff className="w-3.5 h-3.5 me-1 text-destructive" />{t("adminUsers.blockUser")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => { setBlockTarget(u); setBlockAction("unblock"); }}>
                              <ShieldCheck className="w-3.5 h-3.5 me-1 text-success" />{t("adminUsers.unblockUser")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setResetDeviceUser(u)} disabled={busy === "reset_" + u.user_id}>
                              {busy === "reset_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Smartphone className="w-3.5 h-3.5 me-1" />}{t("adminUsers.resetDevice")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeleteUserTarget(u)} disabled={busy === "delete_" + u.user_id}>
                              {busy === "delete_" + u.user_id ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 me-1" />}{t("adminUsers.deleteUser")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-xl"
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-xl"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Drawer open={showDetails} onOpenChange={setShowDetails}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{detailsUser?.display_name || detailsUser?.email}</DrawerTitle>
            <DrawerDescription>{detailsUser?.email}</DrawerDescription>
          </DrawerHeader>
          {detailsUser && (
            <div className="px-4 pb-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Detail label={t("adminUsers.fullName")} value={detailsUser.full_name || "-"} ltr />
                <Detail label={t("adminActivationRequests.phone")} value={detailsUser.phone || "-"} ltr />
                <Detail label={t("adminUsers.businessNameHeader")} value={detailsUser.shop_name || "-"} />
                <Detail label={t("adminUsers.role")} value={detailsUser.role || "-"} />
                <Detail label={t("adminUsers.accountStatus")} value={detailsUser.account_status || "-"} />
                <Detail label={t("adminUsers.licenseStatus")} value={detailsUser.license_status || "-"} />
                <Detail label={t("adminUsers.mtnSecretHeader")} value={settingsMap[detailsUser.user_id]?.mtnSecret || "-"} ltr />
                <Detail label={t("adminUsers.syriatelSerialHeader")} value={settingsMap[detailsUser.user_id]?.syriatelSerial || "-"} ltr />
                <Detail label={t("adminUsers.syriatelDistributorHeader")} value={settingsMap[detailsUser.user_id]?.syriatelDistributor || "-"} ltr />
                <Detail label={t("adminUsers.emergencyPhone")} value={detailsUser.emergency_phone || "-"} ltr />
                <Detail label={t("adminUsers.paymentsTotal")} value={t("adminUsers.paymentsCount", { count: (detailsUser.payments_summary || []).length })} />
                <Detail label={t("adminUsers.notificationsSummary")} value={t("adminUsers.notificationsSummaryLine", { total: (detailsUser.notifications_summary || {}).total || 0, unread: (detailsUser.notifications_summary || {}).unread || 0 })} />
                <Detail label={t("adminUsers.activationStatus")} value={detailsUser.activation_status || "-"} />
                <Detail label={t("adminUsers.distributor")} value={detailsUser.distributor_name ? `${detailsUser.distributor_name} (${detailsUser.distributor_code})` : detailsUser.distributor_assignment_status === "direct_locked" ? t("adminUsers.directCustomerLockedText") : t("adminUsers.noDistributor")} />
                <Detail label={t("adminUsers.lastLogin")} value={detailsUser.last_login ? formatDateTime(detailsUser.last_login) : "-"} />
                <Detail label={t("adminUsers.created")} value={detailsUser.created_at ? formatDateTime(detailsUser.created_at) : "-"} />
                <Detail label={t("adminUsers.emailConfirmed")} value={detailsUser.email_confirmed_at ? formatDateTime(detailsUser.email_confirmed_at) : "-"} />
                <Detail label={t("adminUsers.phoneConfirmed")} value={detailsUser.phone_confirmed_at ? formatDateTime(detailsUser.phone_confirmed_at) : "-"} />
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground font-mono break-all" dir="ltr">{detailsUser.user_id}</p>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Dialog open={showDevices} onOpenChange={setShowDevices}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.devicesTitle")}</DialogTitle>
            <DialogDescription>{devicesUser?.display_name || devicesUser?.email || ""}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto space-y-3">
            {devicesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : devices.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{t("adminLicenses.devicesEmpty")}</p>
            ) : (
              devices.map((d) => {
                const statusConfig: Record<DeviceInfo["status"], { label: string; cls: string }> = {
                  active: { label: t("adminLicenses.activeDevice"), cls: "bg-green-500/10 text-green-600" },
                  registered: { label: t("adminLicenses.registeredDevice"), cls: "bg-blue-500/10 text-blue-600" },
                  revoked: { label: t("adminLicenses.revokedDevice"), cls: "bg-muted text-muted-foreground" },
                  blocked: { label: t("adminLicenses.blockedDevice"), cls: "bg-red-500/10 text-red-600" },
                };
                const cfg = statusConfig[d.status] || statusConfig.registered;
                return (
                  <div key={d.device_id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <MonitorSmartphone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm break-all min-w-0" dir="ltr">
                          {d.device_name || d.device_id}
                        </span>
                      </div>
                      <span className={"text-xs px-2 py-0.5 rounded-full " + cfg.cls}>
                        {d.is_current ? cfg.label + " ✓" : cfg.label}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t("adminLicenses.devicePlatform")}: <span dir="ltr">{d.platform || "-"}</span></span>
                      <span>{t("adminLicenses.deviceVersion")}: <span dir="ltr">{d.app_version || "-"}</span></span>
                      <span>{t("adminLicenses.deviceModel")}: <span dir="ltr">{d.device_model || "-"}</span></span>
                      <span>{t("adminLicenses.deviceSessions")}: {d.session_count} ({t("adminLicenses.deviceActiveSessions")}: {d.session_count - d.revoked_count} / {t("adminLicenses.deviceRevokedSessions")}: {d.revoked_count})</span>
                      <span>{t("adminLicenses.deviceFirstSeen")}: {d.first_seen_at ? formatDateTime(d.first_seen_at) : "-"}</span>
                      <span>{t("adminLicenses.deviceLastSeen")}: {d.last_seen_at ? formatDateTime(d.last_seen_at) : "-"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.activationHistory")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {historyLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("adminLicenses.noHistory")}</p>
            ) : (
              history.map((h: ActivationHistoryEntry, i: number) => (
                <div key={h.id || i} className="bg-muted/30 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs break-all">{h.action || h.status}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.details && typeof h.details === "object" && (
                    <p className="text-xs text-muted-foreground break-all">{JSON.stringify(h.details)}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetDeviceUser} onOpenChange={(open) => { if (!open) setResetDeviceUser(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.resetDeviceConfirm")}</DialogTitle>
            <DialogDescription>{resetDeviceUser?.display_name || resetDeviceUser?.email}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("adminLicenses.resetDeviceDescription")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetDeviceUser(null)} disabled={busy === "reset_" + resetDeviceUser?.user_id}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleResetDevice} disabled={busy === "reset_" + resetDeviceUser?.user_id}>
              {t("adminLicenses.resetDevice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockTarget} onOpenChange={(open) => { if (!open) setBlockTarget(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{blockAction === "block" ? t("adminLicenses.blockUser") : t("adminLicenses.unblockUser")}</DialogTitle>
            <DialogDescription>{blockTarget?.display_name || blockTarget?.email}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockTarget(null)} disabled={busy === "block_" + blockTarget?.user_id}>
              {t("common.cancel")}
            </Button>
            <Button variant={blockAction === "block" ? "destructive" : "default"} onClick={handleBlockToggle} disabled={busy === "block_" + blockTarget?.user_id}>
              {blockAction === "block" ? t("adminLicenses.blockUser") : t("adminLicenses.unblockUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteUserTarget} onOpenChange={(open) => { if (!open) setDeleteUserTarget(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.deleteUserConfirm")}</DialogTitle>
            <DialogDescription>{deleteUserTarget?.display_name || deleteUserTarget?.email}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("adminLicenses.deleteUserDescription")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)} disabled={busy === "delete_" + deleteUserTarget?.user_id}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={busy === "delete_" + deleteUserTarget?.user_id}>
              <Trash2 className="w-4 h-4 me-1" />
              {t("adminLicenses.deleteUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paymentsUser && (
        <PaymentsDialog
          open={showPayments}
          onOpenChange={setShowPayments}
          userId={paymentsUser.user_id}
          userName={paymentsUser.display_name || paymentsUser.email || ""}
        />
      )}

      {/* Assign Distributor Dialog */}
      <Dialog open={showAssignDistributor} onOpenChange={setShowAssignDistributor}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminUsers.assignDistributor")}</DialogTitle>
            <DialogDescription>{assignDistributorUser?.display_name || assignDistributorUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {assignDistributorUser?.distributor_name ? (
              <div className="bg-amber-50 text-amber-700 rounded-xl p-3 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{t("adminUsers.currentlyAssigned", { name: assignDistributorUser.distributor_name, code: assignDistributorUser.distributor_code })}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("adminUsers.noDistributorAssigned")}</p>
            )}
            <div>
              <label className="text-sm font-medium">{t("adminUsers.selectDistributor")} *</label>
              <Select value={selectedDistributorId} onValueChange={setSelectedDistributorId}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder={t("adminUsers.selectDistributorPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">
                    {t("adminUsers.unassignedNormal")}
                  </SelectItem>
                  <SelectItem value="__direct_locked__" className="text-destructive font-medium">
                    {t("adminUsers.unassignedDirectLocked")}
                  </SelectItem>
                  {availableDistributors.map((d) => (
                    <SelectItem key={d.id} value={d.user_id}>
                      {d.code} — {d.display_name || d.user_id} ({d.commission_rate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowAssignDistributor(false); setAssignDistributorUser(null); setSelectedDistributorId(""); }} disabled={assignDistributorLoading}>
                {t("common.cancel")}
              </Button>
               <Button onClick={handleAssignDistributor} disabled={assignDistributorLoading || !selectedDistributorId}>
                 {assignDistributorLoading && <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />}
                 {t("adminUsers.assignDistributor")}
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all" dir={ltr ? "ltr" : undefined}>{value || "-"}</span>
    </div>
  );
}
