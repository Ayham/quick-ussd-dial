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
      toast.error(isArabic ? "فشل تحميل بيانات المستخدمين" : "Failed to load users");
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
      toast.success(isArabic ? "تم تحديث الترخيص" : "License updated");
      setShowLicenseDialog(false);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (userId: string, status: string) => {
    setActionLoading("suspend_" + userId);
    try {
      const { error } = await supabase.rpc("admin_suspend_user", { _target_user_id: userId, _status: status, _reason: null });
      if (error) throw error;
      toast.success(isArabic ? "تم تحديث حالة الحساب" : "Account status updated");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendTrial = async (userId: string, days: number) => {
    setActionLoading("extend_" + userId);
    try {
      const { error } = await supabase.rpc("admin_extend_trial", { _target_user_id: userId, _extra_days: days });
      if (error) throw error;
      toast.success(isArabic ? "تم تمديد الفترة التجريبية" : "Trial extended");
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
        toast.success(isArabic ? "تم إصلاح الصلاحيات، أعد التحميل" : "Permissions fixed, reloading...");
        setLoadError(null);
        loadUsers();
      } else {
        toast.error(result.error || (isArabic ? "فشل الإصلاح" : "Repair failed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isArabic ? "فشل الإصلاح" : "Repair failed"));
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
            placeholder={isArabic ? "بحث بالاسم أو البريد أو الهاتف..." : "Search by name, email, or phone..."}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-10 ps-9 rounded-xl"
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute end-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 rounded-lg"
            onClick={loadUsers}
            title={isArabic ? "تحديث" : "Refresh"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl">
            <SelectValue placeholder={isArabic ? "الحالة" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isArabic ? "الكل" : "All"}</SelectItem>
            <SelectItem value="trial">{isArabic ? "تجريبي" : "Trial"}</SelectItem>
            <SelectItem value="active">{isArabic ? "نشط" : "Active"}</SelectItem>
            <SelectItem value="expired">{isArabic ? "منتهي" : "Expired"}</SelectItem>
            <SelectItem value="pending">{isArabic ? "معلق" : "Pending"}</SelectItem>
            <SelectItem value="permanent">{isArabic ? "دائم" : "Permanent"}</SelectItem>
            <SelectItem value="suspended">{isArabic ? "موقوف" : "Suspended"}</SelectItem>
            <SelectItem value="blocked">{isArabic ? "محظور" : "Blocked"}</SelectItem>
            <SelectItem value="rejected">{isArabic ? "مرفوض" : "Rejected"}</SelectItem>
          </SelectContent>
        </Select>
        {loadError && (
          <Button variant="destructive" size="sm" className="h-10 rounded-xl" onClick={handleAdminRepair} disabled={repairing}>
            <Wrench className="w-4 h-4 me-1" />{isArabic ? "إصلاح الصلاحيات" : "Fix Permissions"}
          </Button>
        )}
      </div>

      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-destructive font-medium">
            {isArabic ? "خطأ في تحميل البيانات" : "Error loading data"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">{loadError}</p>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "المستخدم" : "User"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "البريد" : "Email"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "الهاتف" : "Phone"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "الحالة" : "Status"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "نوع الترخيص" : "License Type"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "المتبقي" : "Remaining"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "الجهاز" : "Device"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "آخر دخول" : "Last Login"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "تاريخ الإنشاء" : "Created"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "الإجراءات" : "Actions"}</th>
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
                    {isArabic ? "لا يوجد مستخدمين" : "No users found"}
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
                    <td className="p-3"><LicenseBadge status={u.license_status} isArabic={isArabic} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{formatLicenseType(u.license_type, isArabic)}</td>
                    <td className="p-3 text-xs">
                      {u.trial_remaining_days !== null
                        ? <span className={u.trial_remaining_days <= 1 ? "text-destructive font-bold" : ""}>{u.trial_remaining_days} {isArabic ? "ي" : "d"}</span>
                        : u.expiry_date
                          ? <span className="text-xs">{formatDate(u.expiry_date)}</span>
                          : "-"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[100px]" dir="ltr">{u.current_device || "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{u.last_login ? formatDate(u.last_login) : "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{u.created_at ? formatDate(u.created_at) : "-"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={isArabic ? "تعديل الترخيص" : "Edit license"}
                          onClick={() => { setSelectedUser(u); setLicenseStatus(u.license_status); setLicenseType(u.license_type); setShowLicenseDialog(true); }}>
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-warning" title={isArabic ? "تمديد التجربة 7 أيام" : "Extend trial 7 days"}
                          onClick={() => handleExtendTrial(u.user_id, 7)} disabled={actionLoading === "extend_" + u.user_id}>
                          <Clock className="w-4 h-4" />
                        </Button>
                        {u.account_status === "active" ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title={isArabic ? "إيقاف" : "Suspend"}
                            onClick={() => handleSuspend(u.user_id, "suspended")} disabled={actionLoading === "suspend_" + u.user_id}>
                            <Ban className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-success" title={isArabic ? "تفعيل" : "Activate"}
                            onClick={() => handleSuspend(u.user_id, "active")} disabled={actionLoading === "suspend_" + u.user_id}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={isArabic ? "السجل" : "History"}
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
            <DialogTitle>{isArabic ? "إدارة الترخيص" : "License Management"}</DialogTitle>
            <DialogDescription>{selectedUser?.display_name || selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{isArabic ? "حالة الترخيص" : "License status"}</Label>
              <Select value={licenseStatus} onValueChange={setLicenseStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {licenseStatus === "active" && (
              <>
                <div className="space-y-2">
                  <Label>{isArabic ? "نوع الترخيص" : "License type"}</Label>
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
                    <Label>{isArabic ? "المدة (أيام)" : "Duration (days)"}</Label>
                    <Input type="number" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className="rounded-xl" />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>{isArabic ? "ملاحظات" : "Notes"}</Label>
              <Textarea value={licenseNotes} onChange={(e) => setLicenseNotes(e.target.value)} className="rounded-xl" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLicenseDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSetLicense} disabled={actionLoading?.startsWith("set_")}>
              {isArabic ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isArabic ? "سجل التفعيلات" : "Activation History"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {historyLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{isArabic ? "لا يوجد سجل" : "No history found"}</p>
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
};

function formatLicenseType(type: string, isArabic: boolean): string {
  const map: Record<string, string> = {
    trial: isArabic ? "تجريبي" : "Trial",
    days_30: isArabic ? "30 يوم" : "30 Days",
    days_90: isArabic ? "90 يوم" : "90 Days",
    days_180: isArabic ? "180 يوم" : "180 Days",
    days_365: isArabic ? "365 يوم" : "365 Days",
    permanent: isArabic ? "دائم" : "Permanent",
  };
  return map[type] ?? type;
}

function LicenseBadge({ status, isArabic }: { status: string; isArabic: boolean }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    trial: { label: isArabic ? "تجريبي" : "Trial", variant: "secondary" },
    active: { label: isArabic ? "نشط" : "Active", variant: "default" },
    expired: { label: isArabic ? "منتهي" : "Expired", variant: "destructive" },
    pending: { label: isArabic ? "معلق" : "Pending", variant: "secondary" },
    rejected: { label: isArabic ? "مرفوض" : "Rejected", variant: "destructive" },
    permanent: { label: isArabic ? "دائم" : "Permanent", variant: "default" },
    suspended: { label: isArabic ? "موقوف" : "Suspended", variant: "destructive" },
    blocked: { label: isArabic ? "محظور" : "Blocked", variant: "destructive" },
  };
  const c = config[status] || { label: status, variant: "outline" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export default LicenseManagement;
