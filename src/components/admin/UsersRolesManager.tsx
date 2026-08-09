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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Shield, ShieldOff, Search, AlertTriangle, RefreshCw, Eye, Trash2, ShieldCheck, Ban, CheckCircle2, MonitorSmartphone, History, Smartphone, Loader2, ChevronLeft, ChevronRight, Wrench, Wallet, MoreVertical } from "lucide-react";
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
  const [repairing, setRepairing] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [paymentsUser, setPaymentsUser] = useState<UserInfo | null>(null);

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

  const handleAdminRepair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.rpc("admin_repair_self");
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (result.success) {
        toast.success(t("adminLicenses.permissionsFixed"));
        setLoadError(null);
        load();
      } else {
        toast.error(result.error || t("adminLicenses.repairFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.repairFailed"));
    } finally {
      setRepairing(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      {loadError && (
        <div className="border border-destructive/20 bg-destructive/10 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive flex-wrap">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="min-w-0 break-all" dir="ltr">{loadError}</span>
          <Button variant="destructive" size="sm" className="ms-auto rounded-xl" onClick={handleAdminRepair} disabled={repairing}>
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
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.user")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.email")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.phone")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.role")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.accountStatus")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.licenseStatus")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.paymentsTotal")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.notificationsSummary")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.activationStatus")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.lastLogin")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminUsers.created")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-28" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-10" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-sm text-muted-foreground">
                    {t("adminUsers.noUsers")}
                  </td>
                </tr>
              ) : (
                rows.map((u) => {
                  const role = u.role || "user";
                  const isAdmin = role === "admin";
                  const paymentCount = (u.payments_summary || []).length;
                  const notificationCount = (u.notifications_summary || {}).total || 0;
                  const notificationUnread = (u.notifications_summary || {}).unread || 0;
                  const activationCounts = (u.activations_summary || {});
                  const hasRole = u.roles && u.roles.includes("admin");
                  return (
                    <tr key={u.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-smooth">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {(u.display_name || u.email || "?")[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-sm break-all min-w-0">{u.display_name || u.email}</span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground break-all" dir="ltr">{u.email}</td>
                      <td className="p-3 text-xs text-muted-foreground break-all" dir="ltr">{u.phone || "-"}</td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold whitespace-nowrap">{role}</span>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          u.account_status === "active" ? "bg-green-500/10 text-green-600" :
                          u.account_status === "suspended" ? "bg-amber-500/10 text-amber-600" :
                          u.account_status === "blocked" ? "bg-red-500/10 text-red-600" :
                          "bg-muted text-muted-foreground"
                        }`}>{u.account_status || "—"}</span>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          u.license_status === "active" ? "bg-green-500/10 text-green-600" :
                          u.license_status === "suspended" ? "bg-amber-500/10 text-amber-600" :
                          u.license_status === "blocked" ? "bg-red-500/10 text-red-600" :
                          u.license_status === "expired" ? "bg-muted text-muted-foreground" :
                          u.license_status === "rejected" ? "bg-muted text-muted-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>{u.license_status || "—"}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{paymentCount} دفعة{paymentCount !== 1 ? "s" : ""}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {notificationUnread > 0 ? `${notificationCount} إشعارة${notificationCount > 1 ? "s" : ""} | ${notificationUnread} غير مقروءة` : notificationCount}
                      </td>
                      <td className="p-3">
                        {activationCounts.latest_status ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                            activationCounts.latest_status === "pending" ? "bg-amber-500/10 text-amber-600" :
                            activationCounts.latest_status === "approved" ? "bg-green-500/10 text-green-600" :
                            activationCounts.latest_status === "rejected" ? "bg-red-500/10 text-red-600" :
                            "bg-muted text-muted-foreground"
                          }`}>{activationCounts.latest_status || "—"}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-whitespace-nowrap">{u.last_login ? formatDate(u.last_login) : "-"}</td>
                      <td className="p-3 text-xs text-muted-whitespace-nowrap">{u.created_at ? formatDate(u.created_at) : "-"}</td>
                      <td className="p-3">
                        <DropdownMenu dir={isArabic ? "rtl" : "ltr"}>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" title={t("adminUsers.options")} aria-label={t("adminUsers.options")}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-xl">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => toggleAdmin(u.user_id, !hasRole)}
                              disabled={busy === "role_" + u.user_id}
                            >
                              {busy === "role_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : hasRole ? <ShieldOff className="w-3.5 h-3.5 me-1" /> : <Shield className="w-3.5 h-3.5 me-1" />}
                              {hasRole ? t("adminUsers.revoke") : t("adminUsers.makeAdmin")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setDetailsUser(u); setShowDetails(true); }}
                            >
                              <Eye className="w-3.5 h-3.5 me-1" />
                              {t("adminUsers.viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setDevicesUser(u); setShowDevices(true); }}
                            >
                              <MonitorSmartphone className="w-3.5 h-3.5 me-1" />
                              {t("adminUsers.viewDevices")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => loadHistory(u.user_id)}
                            >
                              <History className="w-3.5 h-3.5 me-1" />
                              {t("adminUsers.history")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => handleSuspend(u.user_id, "suspended")}
                              disabled={busy === "suspend_" + u.user_id}
                            >
                              {busy === "suspend_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <Ban className="w-3.5 h-3.5 me-1" />}
                              {t("adminUsers.suspend")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => handleSuspend(u.user_id, "active")}
                              disabled={busy === "suspend_" + u.user_id}
                            >
                              {busy === "suspend_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5 me-1 text-success" />}
                              {t("adminUsers.activate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setBlockTarget(u); setBlockAction("block"); }}
                              disabled={busy === "block_" + u.user_id}
                            >
                              <ShieldOff className="w-3.5 h-3.5 me-1 text-destructive" />
                              {t("adminUsers.blockUser")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setBlockTarget(u); setBlockAction("unblock"); }}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 me-1 text-success" />
                              {t("adminUsers.unblockUser")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setResetDeviceUser(u)}
                              disabled={busy === "reset_" + u.user_id}
                            >
                              {busy === "reset_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <Smartphone className="w-3.5 h-3.5 me-1" />}
                              {t("adminUsers.resetDevice")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer text-destructive focus:text-destructive"
                              onClick={() => setDeleteUserTarget(u)}
                              disabled={busy === "delete_" + u.user_id}
                            >
                              {busy === "delete_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5 me-1" />}
                              {t("adminUsers.deleteUser")}
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

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("adminUsers.viewDetails")}</DialogTitle>
            <DialogDescription>{detailsUser?.display_name || detailsUser?.email}</DialogDescription>
          </DialogHeader>
          {detailsUser && (
            <div className="max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Detail label={t("adminActivationRequests.user")} value={detailsUser.display_name || "-"} ltr />
                <Detail label={t("adminUsers.fullName")} value={detailsUser.full_name || "-"} ltr />
                <Detail label={t("adminUsers.email")} value={detailsUser.email || "-"} ltr />
                <Detail label={t("adminActivationRequests.phone")} value={detailsUser.phone || "-"} ltr />
                <Detail label={t("adminUsers.emergencyPhone")} value={detailsUser.emergency_phone || "-"} ltr />
                <Detail label={t("adminUsers.role")} value={detailsUser.role || "-"} />
                <Detail label={t("adminUsers.accountStatus")} value={detailsUser.account_status || "-"} />
                <Detail label={t("adminUsers.licenseStatus")} value={detailsUser.license_status || "-"} />
                <Detail label={t("adminUsers.paymentsTotal")} value={`${(detailsUser.payments_summary || []).length} دفعة${(detailsUser.payments_summary || []).length !== 1 ? "s" : ""}`} />
                <Detail label={t("adminUsers.notificationsSummary")} value={`${(detailsUser.notifications_summary || {}).total || 0} إشعارة | ${(detailsUser.notifications_summary || {}).unread || 0} غير مقروءة`} />
                <Detail label={t("adminUsers.activationStatus")} value={detailsUser.activation_status || "-"} />
                <Detail label={t("adminUsers.lastLogin")} value={detailsUser.last_login ? formatDateTime(detailsUser.last_login) : "-"} />
                <Detail label={t("adminUsers.lastSignIn")} value={detailsUser.last_sign_in_at ? formatDateTime(detailsUser.last_sign_in_at) : "-"} />
                <Detail label={t("adminUsers.lastSync")} value={detailsUser.last_sync ? formatDateTime(detailsUser.last_sync) : "-"} />
                <Detail label={t("adminUsers.created")} value={detailsUser.created_at ? formatDateTime(detailsUser.created_at) : "-"} />
                <Detail label={t("adminUsers.activationStatus")} value={detailsUser.activation_status || "-"} />
                <Detail label={t("adminUsers.emailConfirmed")} value={detailsUser.email_confirmed_at ? formatDateTime(detailsUser.email_confirmed_at) : "-"} />
                <Detail label={t("adminUsers.phoneConfirmed")} value={detailsUser.phone_confirmed_at ? formatDateTime(detailsUser.phone_confirmed_at) : "-"} />
                <Detail label={t("adminUsers.bannedUntil")} value={detailsUser.banned_until ? formatDateTime(detailsUser.banned_until) : "-"} />
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground font-mono break-all" dir="ltr">{detailsUser.user_id}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
