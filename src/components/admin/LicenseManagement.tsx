import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { calculateExpiryDate, formatLicenseTypeLabel } from "@/lib/license";
import { Search, ChevronLeft, ChevronRight, Shield, CheckCircle2, XCircle, Ban, Clock, UserCheck, History, ArrowUpDown, Wrench, RefreshCw, Smartphone, MonitorSmartphone, Loader2, Eye, Trash2, ShieldCheck, ShieldOff, Wallet, MoreVertical } from "lucide-react";
import { PaymentsDialog } from "@/components/admin/PaymentsDialog";

interface UserLicense {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  trial_start: string | null;
  trial_end: string | null;
  license_status: string;
  license_type: string;
  expiry_date: string | null;
  current_device: string | null;
  last_login: string | null;
  last_sync: string | null;
  account_status: string;
  trial_remaining_days: number | null;
  activation_status: string | null;
  activation_processed_at: string | null;
  activation_processed_by: string | null;
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
  commission_min: number | null;
  commission_max: number | null;
  credit_limit: number | null;
  emergency_phone: string | null;
  service_type: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
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

interface ActivationRequest {
  id: string;
  user_id: string;
  status: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
}

function formatLicenseType(type: string, isArabic: boolean, t: any): string {
  return formatLicenseTypeLabel(type as any, t);
}

function LicenseBadge({ status, isArabic, t }: { status: string; isArabic: boolean; t: any }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    trial: { label: t("adminLicenses.trial"), variant: "secondary" },
    active: { label: t("admin.active"), variant: "default" },
    expired: { label: t("adminLicenses.expired"), variant: "destructive" },
    pending: { label: t("admin.pending"), variant: "secondary" },
    rejected: { label: t("admin.rejected"), variant: "destructive" },
    permanent: { label: t("adminActivationRequests.permanent"), variant: "default" },
    suspended: { label: t("adminLicenses.suspended"), variant: "destructive" },
    blocked: { label: t("adminLicenses.blocked"), variant: "destructive" },
  };
  const c = config[status] || { label: status, variant: "outline" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

const LicenseManagement = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [users, setUsers] = useState<UserLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetDeviceUser, setResetDeviceUser] = useState<UserLicense | null>(null);
  const pageSize = 20;

  const [selectedUser, setSelectedUser] = useState<UserLicense | null>(null);
  const [showLicenseDialog, setShowLicenseDialog] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
  const [licenseNotes, setLicenseNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesUser, setDevicesUser] = useState<UserLicense | null>(null);

  const [deleteUserTarget, setDeleteUserTarget] = useState<UserLicense | null>(null);
  const [blockTarget, setBlockTarget] = useState<UserLicense | null>(null);
  const [blockAction, setBlockAction] = useState<"block" | "unblock">("block");
  const [showDetails, setShowDetails] = useState(false);
  const [detailsUser, setDetailsUser] = useState<UserLicense | null>(null);
  const [showPayments, setShowPayments] = useState(false);
  const [paymentsUser, setPaymentsUser] = useState<UserLicense | null>(null);

  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [activationId, setActivationId] = useState<string | null>(null);
  const [activationAction, setActivationAction] = useState<"approve" | "reject" | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_all_users_license", {
        _search: search || null,
        _status: statusFilter !== "all" ? statusFilter : null,
        _page: page,
        _page_size: pageSize,
      });
      if (error) throw error;
      const result = data as unknown as { users: UserLicense[]; total: number };
      setUsers(result.users || []);
      setTotal(result.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
      toast.error(t("adminLicenses.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, isArabic]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSetLicense = async () => {
    if (!selectedUser) return;
    setActionLoading("set_" + selectedUser.user_id);
    try {
      // Normalize the (status, type, expiry) triple so a contradictory combo
      // (e.g. permanent + trial, or active + lifetime) can never be sent.
      let effectiveStatus = licenseStatus;
      let effectiveType = licenseType || null;
      let expiryDate: string | null = null;
      if (effectiveStatus === "active" && effectiveType === "lifetime") {
        effectiveStatus = "permanent";
      }
      if (effectiveStatus === "permanent") {
        effectiveType = "lifetime";
      } else if (effectiveStatus === "trial") {
        effectiveType = "trial";
      } else if (effectiveStatus === "active") {
        if (effectiveType === "trial") effectiveType = "year_1";
        expiryDate = calculateExpiryDate(effectiveType as any, customExpiryDate || undefined);
      }
      const { error } = await supabase.rpc("admin_set_license", {
        _target_user_id: selectedUser.user_id,
        _license_status: effectiveStatus,
        _license_type: effectiveType,
        _expiry_date: expiryDate,
        _notes: licenseNotes || null,
      });
      if (error) throw error;
      toast.success(t("adminLicenses.updated"));
      setShowLicenseDialog(false);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (userId: string, status: string) => {
    setActionLoading("suspend_" + userId);
    try {
      const { error } = await supabase.rpc("admin_suspend_user", { _target_user_id: userId, _status: status, _reason: null });
      if (error) throw error;
      toast.success(t("adminLicenses.accountStatusUpdated"));
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendTrial = async (userId: string, days: number) => {
    setActionLoading("extend_" + userId);
    try {
      const { error } = await supabase.rpc("admin_extend_trial", { _target_user_id: userId, _extra_days: days });
      if (error) throw error;
      toast.success(t("adminLicenses.trialExtended"));
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.updateFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setActionLoading("delete_" + deleteUserTarget.user_id);
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
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.deleteUserFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlockToggle = async () => {
    if (!blockTarget) return;
    setActionLoading("block_" + blockTarget.user_id);
    try {
      const { error } = await supabase.rpc("admin_suspend_user", {
        _target_user_id: blockTarget.user_id,
        _status: blockAction === "block" ? "blocked" : "active",
        _reason: blockAction === "block" ? "admin_block" : null,
      });
      if (error) throw error;
      toast.success(blockAction === "block" ? t("adminLicenses.blockUserSuccess") : t("adminLicenses.accountStatusUpdated"));
      setBlockTarget(null);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.blockUserFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const loadHistory = async (userId: string) => {
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_activation_history", { _target_user_id: userId });
      if (error) throw error;
      setHistory((data as unknown as { history: any[] })?.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadDevices = async (user: UserLicense) => {
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

  const handleAdminRepair = () => {
    // admin_repair_self was revoked from authenticated callers (security
    // hardening): first-admin bootstrap is operator/service-role only, so the
    // self-promotion path is intentionally dead.
    toast.error(t("adminLicenses.repairUnavailable"));
  };

  const handleResetDevice = async () => {
    if (!resetDeviceUser) return;
    setActionLoading("reset_" + resetDeviceUser.user_id);
    try {
      const { data, error } = await supabase.rpc("admin_reset_user_device", { _user_id: resetDeviceUser.user_id });
      if (error) throw error;
      const result = data as unknown as { ok?: boolean; error?: string; reason?: string };
      if (!result?.ok) throw new Error(result?.error || result?.reason || "failed");
      toast.success(t("adminLicenses.resetDeviceSuccess"));
      setResetDeviceUser(null);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminLicenses.resetDeviceFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("adminLicenses.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-10 ps-9 rounded-xl"
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute end-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 rounded-lg"
            onClick={loadUsers}
            title={t("common.refresh")}
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
            <SelectItem value="expiring_soon">{t("adminLicenses.expiringSoon")}</SelectItem>
            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
            <SelectItem value="permanent">{t("adminActivationRequests.permanent")}</SelectItem>
            <SelectItem value="suspended">{t("adminLicenses.suspended")}</SelectItem>
            <SelectItem value="blocked">{t("adminLicenses.blocked")}</SelectItem>
            <SelectItem value="rejected">{t("admin.rejected")}</SelectItem>
          </SelectContent>
        </Select>
        {loadError && (
          <Button variant="destructive" size="sm" className="h-10 rounded-xl" onClick={handleAdminRepair}>
            <Wrench className="w-4 h-4 me-1" />{t("adminLicenses.fixPermissions")}
          </Button>
        )}
      </div>

      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-destructive font-medium">
            {t("adminLicenses.errorLoading")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">{loadError}</p>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.user")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.email")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.phone")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.status")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminLicenses.licenseType")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminLicenses.remaining")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminLicenses.device")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminLicenses.lastLogin")}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminLicenses.created")}</th>
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
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-10" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                    {t("adminLicenses.noUsers")}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
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
                    <td className="p-3"><LicenseBadge status={u.license_status} isArabic={isArabic} t={t} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{formatLicenseType(u.license_type, isArabic, t)}</td>
                    <td className="p-3 text-xs">
                      {u.trial_remaining_days !== null
                        ? <span className={u.trial_remaining_days <= 1 ? "text-destructive font-bold" : ""}>{u.trial_remaining_days} {t("adminActivationRequests.daysUnit")}</span>
                        : u.expiry_date
                          ? <span className="text-xs">{formatDate(u.expiry_date)}</span>
                          : "-"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground break-all min-w-[140px]" dir="ltr">{u.current_device || "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{u.last_login ? formatDate(u.last_login) : "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{u.created_at ? formatDate(u.created_at) : "-"}</td>
                    <td className="p-3">
                      <DropdownMenu dir={isArabic ? "rtl" : "ltr"}>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" title={t("adminLicenses.options")} aria-label={t("adminLicenses.options")}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => { setDetailsUser(u); setShowDetails(true); }}
                          >
                            <Eye className="w-3.5 h-3.5 me-1" />
                            {t("adminLicenses.viewDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => { setSelectedUser(u); setLicenseStatus(u.license_status); setLicenseType(u.license_type); setCustomExpiryDate(u.expiry_date || ""); setShowLicenseDialog(true); }}
                          >
                            <Shield className="w-3.5 h-3.5 me-1" />
                            {t("adminLicenses.editShort")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => handleExtendTrial(u.user_id, 7)} disabled={actionLoading === "extend_" + u.user_id}
                          >
                            {actionLoading === "extend_" + u.user_id
                              ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                              : <Clock className="w-3.5 h-3.5 me-1 text-warning" />}
                            {t("adminLicenses.extendShort")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.account_status === "active" ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => handleSuspend(u.user_id, "suspended")} disabled={actionLoading === "suspend_" + u.user_id}
                            >
                              {actionLoading === "suspend_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <Ban className="w-3.5 h-3.5 me-1" />}
                              {t("adminLicenses.suspend")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => handleSuspend(u.user_id, "active")} disabled={actionLoading === "suspend_" + u.user_id}
                            >
                              {actionLoading === "suspend_" + u.user_id
                                ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5 me-1 text-success" />}
                              {t("adminLicenses.activate")}
                            </DropdownMenuItem>
                          )}
                          {u.account_status === "blocked" ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setBlockTarget(u); setBlockAction("unblock"); }}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 me-1 text-success" />
                              {t("adminLicenses.unblockUser")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => { setBlockTarget(u); setBlockAction("block"); }} disabled={actionLoading === "block_" + u.user_id}
                            >
                              <ShieldOff className="w-3.5 h-3.5 me-1 text-destructive" />
                              {t("adminLicenses.blockUser")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => loadDevices(u)}
                          >
                            <MonitorSmartphone className="w-3.5 h-3.5 me-1" />
                            {t("adminLicenses.viewDevices")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => loadHistory(u.user_id)}
                          >
                            <History className="w-3.5 h-3.5 me-1" />
                            {t("adminLicenses.history")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => { setPaymentsUser(u); setShowPayments(true); }}
                          >
                            <Wallet className="w-3.5 h-3.5 me-1" />
                            {t("adminPayments.title")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setResetDeviceUser(u)} disabled={actionLoading === "reset_" + u.user_id}
                          >
                            {actionLoading === "reset_" + u.user_id
                              ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                              : <Smartphone className="w-3.5 h-3.5 me-1 text-warning" />}
                            {t("adminLicenses.resetDevice")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setDeleteUserTarget(u)} disabled={actionLoading === "delete_" + u.user_id}
                          >
                            {actionLoading === "delete_" + u.user_id
                              ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5 me-1" />}
                            {t("adminLicenses.deleteUser")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
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

      <Dialog open={showLicenseDialog} onOpenChange={setShowLicenseDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.title")}</DialogTitle>
            <DialogDescription>{selectedUser?.display_name || selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("adminLicenses.licenseStatus")}</Label>
              <Select value={licenseStatus} onValueChange={setLicenseStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
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
            </div>
             {licenseStatus === "active" && (
               <>
                 <div className="space-y-2">
                   <Label>{t("adminLicenses.licenseType")}</Label>
                   <Select value={licenseType} onValueChange={setLicenseType}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="year_1">{t("activation.year1")}</SelectItem>
                       <SelectItem value="year_2">{t("activation.year2")}</SelectItem>
                       <SelectItem value="year_3">{t("activation.year3")}</SelectItem>
                       <SelectItem value="custom_date">{t("activation.customDate")}</SelectItem>
                       <SelectItem value="lifetime">{t("adminActivationRequests.permanent")}</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 {licenseType === "custom_date" && (
                   <div className="space-y-2">
                     <Label>{t("adminActivationRequests.customExpiryDate")}</Label>
                     <Input type="date" value={customExpiryDate} onChange={(e) => setCustomExpiryDate(e.target.value)} className="rounded-xl" />
                   </div>
                 )}
                 {licenseType !== "lifetime" && licenseType !== "custom_date" && licenseType !== "" && (
                   <div className="space-y-2">
                     <Label>{t("adminActivationRequests.expectedExpiry")}</Label>
                     <div className="flex h-10 w-full rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm items-center">
                       {calculateExpiryDate(licenseType as any, customExpiryDate || undefined)}
                     </div>
                   </div>
                 )}
               </>
             )}
            <div className="space-y-2">
              <Label>{t("adminLicenses.notes")}</Label>
              <Textarea value={licenseNotes} onChange={(e) => setLicenseNotes(e.target.value)} className="rounded-xl" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLicenseDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSetLicense} disabled={actionLoading?.startsWith("set_")}>
              {t("adminLicenses.save")}
            </Button>
          </DialogFooter>
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
              history.map((h: any, i: number) => (
                <div key={i} className="bg-muted/30 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">{h.action}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.details && typeof h.details === "object" && (
                    <p className="text-xs text-muted-foreground">{JSON.stringify(h.details)}</p>
                  )}
                </div>
              ))
            )}
          </div>
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

      <Dialog open={!!resetDeviceUser} onOpenChange={(open) => { if (!open) setResetDeviceUser(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.resetDeviceConfirm")}</DialogTitle>
            <DialogDescription>{resetDeviceUser?.display_name || resetDeviceUser?.email}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("adminLicenses.resetDeviceDescription")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetDeviceUser(null)} disabled={!!actionLoading?.startsWith("reset_")}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleResetDevice} disabled={!!actionLoading?.startsWith("reset_")}>
              {t("adminLicenses.resetDevice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("adminLicenses.viewDetails")}</DialogTitle>
            <DialogDescription>{detailsUser?.display_name || detailsUser?.email}</DialogDescription>
          </DialogHeader>
          {detailsUser && (
            <div className="max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Detail label={t("adminActivationRequests.user")} value={detailsUser.display_name || "-"} ltr />
                <Detail label={t("adminLicenses.fullName")} value={detailsUser.full_name || "-"} ltr />
                <Detail label={t("adminActivationRequests.email")} value={detailsUser.email || "-"} ltr />
                <Detail label={t("adminActivationRequests.phone")} value={detailsUser.phone || "-"} ltr />
                <Detail label={t("adminLicenses.emergencyPhone")} value={detailsUser.emergency_phone || "-"} ltr />
                <Detail label={t("adminLicenses.userRole")} value={detailsUser.role || "-"} />
                <Detail label={t("adminLicenses.language")} value={detailsUser.language || "-"} />
                <Detail label={t("adminLicenses.shopName")} value={detailsUser.shop_name || "-"} />
                <Detail label={t("adminLicenses.city")} value={detailsUser.city || "-"} />
                <Detail label={t("adminLicenses.address")} value={detailsUser.address || "-"} />
                <Detail label={t("adminLicenses.serviceType")} value={detailsUser.service_type || "-"} />
                <Detail label={t("adminLicenses.customerStatus")} value={detailsUser.customer_status || "-"} />
                <Detail label={t("adminLicenses.commissionType")} value={detailsUser.commission_type || "-"} />
                <Detail label={t("adminLicenses.commissionValue")} value={detailsUser.commission_value != null ? String(detailsUser.commission_value) : "-"} />
                <Detail label={t("adminLicenses.creditLimit")} value={detailsUser.credit_limit != null ? String(detailsUser.credit_limit) : "-"} />
                <Detail label={t("adminLicenses.notes")} value={detailsUser.notes || "-"} />
              </div>
              <div className="mt-4 pt-3 border-t space-y-2 text-sm">
                <Detail label={t("adminLicenses.licenseStatus")} value={detailsUser.license_status || "-"} />
                <Detail label={t("adminLicenses.licenseType")} value={detailsUser.license_type || "-"} />
                <Detail label={t("adminLicenses.expiry")} value={detailsUser.expiry_date ? formatDate(detailsUser.expiry_date) : "-"} />
                <Detail label={t("adminLicenses.device")} value={detailsUser.current_device || "-"} ltr />
                <Detail label={t("adminLicenses.lastLogin")} value={detailsUser.last_login ? formatDateTime(detailsUser.last_login) : "-"} />
                <Detail label={t("adminLicenses.lastSignIn")} value={detailsUser.last_sign_in_at ? formatDateTime(detailsUser.last_sign_in_at) : "-"} />
                <Detail label={t("adminLicenses.lastSync")} value={detailsUser.last_sync ? formatDateTime(detailsUser.last_sync) : "-"} />
                <Detail label={t("adminLicenses.created")} value={detailsUser.created_at ? formatDateTime(detailsUser.created_at) : "-"} />
                <Detail label={t("adminLicenses.activationStatus")} value={detailsUser.activation_status || "-"} />
                <Detail label={t("adminLicenses.emailConfirmed")} value={detailsUser.email_confirmed_at ? formatDateTime(detailsUser.email_confirmed_at) : "-"} />
                <Detail label={t("adminLicenses.phoneConfirmed")} value={detailsUser.phone_confirmed_at ? formatDateTime(detailsUser.phone_confirmed_at) : "-"} />
                <Detail label={t("adminLicenses.bannedUntil")} value={detailsUser.banned_until ? formatDateTime(detailsUser.banned_until) : "-"} />
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground font-mono break-all" dir="ltr">{detailsUser.user_id}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockTarget} onOpenChange={(open) => { if (!open) setBlockTarget(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{blockAction === "block" ? t("adminLicenses.blockUser") : t("adminLicenses.unblockUser")}</DialogTitle>
            <DialogDescription>{blockTarget?.display_name || blockTarget?.email}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockTarget(null)} disabled={!!actionLoading?.startsWith("block_")}>
              {t("common.cancel")}
            </Button>
            <Button variant={blockAction === "block" ? "destructive" : "default"} onClick={handleBlockToggle} disabled={!!actionLoading?.startsWith("block_")}>
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
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)} disabled={!!actionLoading?.startsWith("delete_")}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={!!actionLoading?.startsWith("delete_")}>
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

export default LicenseManagement;