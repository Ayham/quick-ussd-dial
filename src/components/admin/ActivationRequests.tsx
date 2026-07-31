import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Search, Clock, Mail, Phone, User, RefreshCw } from "lucide-react";

interface ActivationRequest {
  id: string;
  user_id: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  display_name: string | null;
  email: string | null;
  profile_phone: string | null;
  license_status: string | null;
  trial_end: string | null;
  trial_start: string | null;
}

const ActivationRequests = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadRequestsError, setLoadRequestsError] = useState<string | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ActivationRequest | null>(null);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject" | "modify" | "revoke">("approve");
  const [licenseType, setLicenseType] = useState("days_30");
  const [expiryDays, setExpiryDays] = useState("30");
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoadRequestsError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_activation_requests", { _status: filter !== "all" ? filter : null });
      if (error) throw error;
      const result = data as unknown as { requests: ActivationRequest[] };
      setRequests(result.requests || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadRequestsError(msg);
      toast.error(isArabic ? "فشل تحميل الطلبات" : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [filter, isArabic]);

  useEffect(() => { load(); }, [load]);

  const handleOpenDialog = (req: ActivationRequest, action: "approve" | "reject" | "modify" | "revoke") => {
    setSelectedRequest(req);
    setDialogAction(action);
    setLicenseType((req.license_type as string) || "days_30");
    setExpiryDays("30");
    setRejectReason("");
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!selectedRequest) return;
    setActionLoading(dialogAction + "_" + selectedRequest.id);
    try {
      if (dialogAction === "approve") {
        const { error } = await supabase.rpc("admin_approve_activation", {
          _request_id: selectedRequest.id,
          _license_type: licenseType,
          _duration_days: licenseType !== "permanent" ? parseInt(expiryDays) : 30,
          _notes: null,
        });
        if (error) throw error;
        toast.success(isArabic ? "تمت الموافقة على الطلب" : "Request approved");
      } else if (dialogAction === "reject") {
        const { error } = await supabase.rpc("admin_reject_activation", {
          _request_id: selectedRequest.id,
          _reason: rejectReason || null,
        });
        if (error) throw error;
        toast.success(isArabic ? "تم رفض الطلب" : "Request rejected");
      } else if (dialogAction === "modify") {
        const { error } = await supabase.rpc("admin_modify_activation", {
          _request_id: selectedRequest.id,
          _license_type: licenseType,
          _duration_days: licenseType !== "permanent" ? parseInt(expiryDays) : 30,
          _notes: null,
        });
        if (error) throw error;
        toast.success(isArabic ? "تم تعديل التفعيل" : "Activation modified");
      } else if (dialogAction === "revoke") {
        const { error } = await supabase.rpc("admin_revoke_activation", {
          _request_id: selectedRequest.id,
          _reason: rejectReason || null,
        });
        if (error) throw error;
        toast.success(isArabic ? "تم إلغاء التفعيل" : "Activation revoked");
      }
      setShowDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isArabic ? "فشل" : "Failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="secondary"><Clock className="w-3 h-3 me-1" />{isArabic ? "معلق" : "Pending"}</Badge>;
    if (status === "approved") return <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3 me-1" />{isArabic ? "مفعل" : "Active"}</Badge>;
    if (status === "rejected") return <Badge variant="destructive"><XCircle className="w-3 h-3 me-1" />{isArabic ? "مرفوض" : "Rejected"}</Badge>;
    return <Badge>{status}</Badge>;
  };

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl">
            <SelectValue placeholder={isArabic ? "الحالة" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isArabic ? "الكل" : "All"}</SelectItem>
            <SelectItem value="pending">{isArabic ? "معلق" : "Pending"}</SelectItem>
            <SelectItem value="approved">{isArabic ? "موافق عليه" : "Approved"}</SelectItem>
            <SelectItem value="rejected">{isArabic ? "مرفوض" : "Rejected"}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {loading ? "" : `${requests.length} ${isArabic ? "طلب" : "request(s)"}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg"
          onClick={load}
          title={isArabic ? "تحديث" : "Refresh"}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loadRequestsError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-destructive font-medium">
            {isArabic ? "خطأ في تحميل الطلبات" : "Error loading requests"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">{loadRequestsError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={load}>
            {isArabic ? "إعادة المحاولة" : "Retry"}
          </Button>
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
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "التاريخ" : "Date"}</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{isArabic ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-28" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-28" /></td>
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                    {isArabic ? "لا توجد طلبات" : "No requests found"}
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-smooth">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(r.display_name || r.email || "?")[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-sm truncate max-w-[120px]">{r.display_name || r.email}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{r.email}</td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{r.contact_phone || r.profile_phone || "-"}</td>
                    <td className="p-3">{statusBadge(r.status)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      {r.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="default" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "approve")}
                            disabled={!!actionLoading}>
                            <CheckCircle2 className="w-3 h-3 me-1" />{isArabic ? "موافقة" : "Approve"}
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "reject")}
                            disabled={!!actionLoading}>
                            <XCircle className="w-3 h-3 me-1" />{isArabic ? "رفض" : "Reject"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "modify")}
                            disabled={!!actionLoading}>
                            {isArabic ? "تعديل" : "Modify"}
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "revoke")}
                            disabled={!!actionLoading}>
                            {isArabic ? "إلغاء" : "Revoke"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "approve" ? (isArabic ? "الموافقة على الطلب" : "Approve Request")
              : dialogAction === "reject" ? (isArabic ? "رفض الطلب" : "Reject Request")
              : dialogAction === "modify" ? (isArabic ? "تعديل التفعيل" : "Modify Activation")
              : (isArabic ? "إلغاء التفعيل" : "Revoke Activation")}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.display_name || selectedRequest?.email}
              {selectedRequest?.contact_name && <span className="block text-xs mt-1">{isArabic ? "جهة الاتصال: " : "Contact: "}{selectedRequest.contact_name}</span>}
            </DialogDescription>
          </DialogHeader>

          {(dialogAction === "approve" || dialogAction === "modify") ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{isArabic ? "نوع الترخيص" : "License type"}</Label>
                <Select value={licenseType} onValueChange={setLicenseType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days_30">30 {isArabic ? "يوم" : "Days"}</SelectItem>
                    <SelectItem value="days_90">90 {isArabic ? "يوم" : "Days"}</SelectItem>
                    <SelectItem value="days_180">180 {isArabic ? "يوم" : "Days"}</SelectItem>
                    <SelectItem value="days_365">365 {isArabic ? "يوم" : "Days"}</SelectItem>
                    <SelectItem value="permanent">{isArabic ? "دائم" : "Permanent"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {licenseType !== "permanent" && (
                <div className="space-y-2">
                  <Label>{isArabic ? "المدة (أيام)" : "Duration (days)"}</Label>
                  <input
                    type="number"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{dialogAction === "revoke" ? (isArabic ? "سبب الإلغاء" : "Revocation reason") : (isArabic ? "سبب الرفض" : "Rejection reason")}</Label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="flex h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  placeholder={isArabic ? "اختياري" : "Optional"}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t("common.cancel")}</Button>
            <Button
              variant={dialogAction === "approve" || dialogAction === "modify" ? "default" : "destructive"}
              onClick={handleSubmit}
              disabled={actionLoading?.startsWith(dialogAction)}
            >
              {dialogAction === "approve" ? (isArabic ? "موافقة" : "Approve")
              : dialogAction === "reject" ? (isArabic ? "رفض" : "Reject")
              : dialogAction === "modify" ? (isArabic ? "تعديل" : "Modify")
              : (isArabic ? "إلغاء" : "Revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivationRequests;
