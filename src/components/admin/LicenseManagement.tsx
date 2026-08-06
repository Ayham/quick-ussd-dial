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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Shield, CheckCircle2, XCircle, Ban, Clock, UserCheck, History, ArrowUpDown, Wrench, RefreshCw } from "lucide-react";

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
  const map: Record<string, string> = {
    trial: t("adminLicenses.trial"),
    days_30: t("activation.days30"),
    days_90: t("activation.days90"),
    days_180: t("activation.days180"),
    days_365: t("activation.yearType"),
    permanent: t("adminActivationRequests.permanent"),
  };
  return map[type] ?? type;
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
  const pageSize = 20;

  const [selectedUser, setSelectedUser] = useState<UserLicense | null>(null);
  const [showLicenseDialog, setShowLicenseDialog] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [licenseNotes, setLicenseNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [activationId, setActivationId] = useState<string | null>(null);
  const [activationAction, setActivationAction] = useState<"approve" | "reject" | null>(null);
  const [activationDuration, setActivationDuration] = useState("30");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

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
      let expiryDate: string | null = null;
      if (licenseStatus === "active" && !isNaN(parseInt(expiryDays))) {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expiryDays));
        expiryDate = date.toISOString().split("T")[0];
      }
      const { error } = await supabase.rpc("admin_set_license", {
        _target_user_id: selectedUser.user_id,
        _license_status: licenseStatus,
        _license_type: licenseType || null,
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
      toast.error(err instanceof Error ? err.message : "Failed");
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

  const handleAdminRepair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.rpc("admin_repair_self");
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (result.success) {
        toast.success(t("adminLicenses.permissionsFixed"));
        setLoadError(null);
        loadUsers();
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
            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
            <SelectItem value="permanent">{t("adminActivationRequests.permanent")}</SelectItem>
            <SelectItem value="suspended">{t("adminLicenses.suspended")}</SelectItem>
            <SelectItem value="blocked">{t("adminLicenses.blocked")}</SelectItem>
            <SelectItem value="rejected">{t("admin.rejected")}</SelectItem>
          </SelectContent>
        </Select>
        {loadError && (
          <Button variant="destructive" size="sm" className="h-10 rounded-xl" onClick={handleAdminRepair} disabled={repairing}>
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
                    <td className="p-3"><Skeleton className="h-8 w-32" /></td>
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
                        <span className="font-medium text-sm truncate max-w-[120px]">{u.display_name || u.email}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{u.email}</td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{u.phone || "-"}</td>
                    <td className="p-3"><LicenseBadge status={u.license_status} isArabic={isArabic} t={t} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{formatLicenseType(u.license_type, isArabic, t)}</td>
                    <td className="p-3 text-xs">
                      {u.trial_remaining_days !== null
                        ? <span className={u.trial_remaining_days <= 1 ? "text-destructive font-bold" : ""}>{u.trial_remaining_days} {t("adminActivationRequests.daysUnit")}</span>
                        : u.expiry_date
                          ? <span className="text-xs">{formatDate(u.expiry_date)}</span>
                          : "-"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[100px]" dir="ltr">{u.current_device || "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{u.last_login ? formatDate(u.last_login) : "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{u.created_at ? formatDate(u.created_at) : "-"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={t("adminLicenses.editLicense")}
                          onClick={() => { setSelectedUser(u); setLicenseStatus(u.license_status); setLicenseType(u.license_type); setShowLicenseDialog(true); }}>
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-warning" title={t("adminLicenses.extendTrial")}
                          onClick={() => handleExtendTrial(u.user_id, 7)} disabled={actionLoading === "extend_" + u.user_id}>
                          <Clock className="w-4 h-4" />
                        </Button>
                        {u.account_status === "active" ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title={t("adminLicenses.suspend")}
                            onClick={() => handleSuspend(u.user_id, "suspended")} disabled={actionLoading === "suspend_" + u.user_id}>
                            <Ban className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-success" title={t("adminLicenses.activate")}
                            onClick={() => handleSuspend(u.user_id, "active")} disabled={actionLoading === "suspend_" + u.user_id}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={t("adminLicenses.history")}
                          onClick={() => loadHistory(u.user_id)}>
                          <History className="w-4 h-4" />
                        </Button>
                      </div>
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
                      <SelectItem value="days_30">30 Days</SelectItem>
                      <SelectItem value="days_90">90 Days</SelectItem>
                      <SelectItem value="days_180">180 Days</SelectItem>
                      <SelectItem value="days_365">365 Days</SelectItem>
                      <SelectItem value="permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {licenseType !== "permanent" && (
                  <div className="space-y-2">
                    <Label>{t("adminActivationRequests.durationDays")}</Label>
                    <Input type="number" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className="rounded-xl" />
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
    </div>
  );
}

export default LicenseManagement;