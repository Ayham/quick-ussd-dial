import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { calculateExpiryDate } from "@/lib/license";
import { CheckCircle2, XCircle, Search, Clock, Mail, Phone, User, RefreshCw, CreditCard, Package } from "lucide-react";

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
  plan_id: string | null;
  request_type: string | null;
  payment_method_id: string | null;
  payer_name: string | null;
  payer_phone: string | null;
  payment_note: string | null;
  transaction_reference: string | null;
  payment_status: string | null;
  receipt_url: string | null;
  plan_name: string | null;
  plan_price: number | null;
  plan_currency: string | null;
  plan_duration_days: number | null;
  payment_method_title: string | null;
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
  const [licenseType, setLicenseType] = useState("year_1");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
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
      toast.error(t("adminActivationRequests.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [filter, isArabic]);

  useEffect(() => { load(); }, [load]);

  const handleOpenDialog = (req: ActivationRequest, action: "approve" | "reject" | "modify" | "revoke") => {
    setSelectedRequest(req);
    setDialogAction(action);
    setLicenseType("year_1");
    setCustomExpiryDate("");
    setRejectReason("");
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!selectedRequest) return;
    setActionLoading(dialogAction + "_" + selectedRequest.id);
    try {
      const computedExpiry = licenseType === "lifetime" ? null : calculateExpiryDate(licenseType as any, customExpiryDate || undefined);
      if (dialogAction === "approve") {
        const { error } = await supabase.rpc("admin_approve_activation", {
          _request_id: selectedRequest.id,
          _license_type: licenseType,
          _expiry_date: computedExpiry,
          _notes: null,
        });
        if (error) throw error;
        toast.success(t("adminActivationRequests.approvedToast"));
      } else if (dialogAction === "reject") {
        const { error } = await supabase.rpc("admin_reject_activation", {
          _request_id: selectedRequest.id,
          _reason: rejectReason || null,
        });
        if (error) throw error;
        toast.success(t("adminActivationRequests.rejectedToast"));
      } else if (dialogAction === "modify") {
        const { error } = await supabase.rpc("admin_modify_activation", {
          _request_id: selectedRequest.id,
          _license_type: licenseType,
          _expiry_date: computedExpiry,
          _notes: null,
        });
        if (error) throw error;
        toast.success(t("adminActivationRequests.modifiedToast"));
      } else if (dialogAction === "revoke") {
        const { error } = await supabase.rpc("admin_revoke_activation", {
          _request_id: selectedRequest.id,
          _reason: rejectReason || null,
        });
        if (error) throw error;
        toast.success(t("adminActivationRequests.revokedToast"));
      }
      setShowDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminActivationRequests.failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string, t: any) => {
    if (status === "pending") return <Badge variant="secondary"><Clock className="w-3 h-3 me-1" />قيد المراجعة</Badge>;
    if (status === "approved") return <Badge className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="w-3 h-3 me-1" />موافق عليه</Badge>;
    if (status === "rejected") return <Badge variant="destructive"><XCircle className="w-3 h-3 me-1" />مرفوض</Badge>;
    return <Badge>{status}</Badge>;
  };

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl">
            <SelectValue placeholder={t("adminActivationRequests.statusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="pending">قيد الانتظار</SelectItem>
            <SelectItem value="approved">موافق عليه</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
           {loading ? "" : `${requests.length} طلبات`}
         </span>
         <Button
           size="sm"
           variant="ghost"
           className="h-7 w-7 p-0 rounded-lg"
           onClick={load}
           title="تحديث"
         >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loadRequestsError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-destructive font-medium">خطأ في تحميل الطلبات</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">{loadRequestsError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={load}>إعادة المحاولة</Button>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">المستخدم</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">النوع / الباقة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">تفاصيل الدفع</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الحالة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">التاريخ</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-28" /></td>
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                    لا توجد طلبات تفعيل.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/35 transition-smooth">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(r.display_name || r.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-sm truncate max-w-[120px] block">{r.display_name || r.email}</span>
                          <span className="text-xs text-muted-foreground truncate block" dir="ltr">{r.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {r.request_type === "renewal" ? "تجديد" : "تفعيل جديد"}
                        </Badge>
                      </div>
                      <div className="font-medium text-xs mt-1 text-primary">
                        {r.plan_name || "الباقة الأساسية"} {r.plan_price ? `(${Number(r.plan_price).toLocaleString()} ${r.plan_currency || "SYP"})` : ""}
                      </div>
                      {r.notes && <div className="text-xs text-muted-foreground italic mt-0.5">ملاحظة: {r.notes}</div>}
                    </td>
                    <td className="p-3 text-xs space-y-0.5">
                      {r.payment_method_title && <div className="font-semibold text-foreground">طريقة: {r.payment_method_title}</div>}
                      {r.payer_name && <div>المرسل: {r.payer_name}</div>}
                      {r.payer_phone && <div dir="ltr">هاتف: {r.payer_phone}</div>}
                      {r.transaction_reference && <div className="font-mono text-muted-foreground">مرجع: {r.transaction_reference}</div>}
                      {r.payment_status === "submitted" && <Badge variant="secondary" className="text-[10px] mt-1">تم إرسال الدفع</Badge>}
                    </td>
                    <td className="p-3">{statusBadge(r.status, t)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="p-3">
                      {r.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="default" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "approve")}
                            disabled={!!actionLoading}>
                            <CheckCircle2 className="w-3 h-3 me-1" />موافقة
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "reject")}
                            disabled={!!actionLoading}>
                            <XCircle className="w-3 h-3 me-1" />رفض
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "modify")}
                            disabled={!!actionLoading}>
                            تعديل
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8 text-xs"
                            onClick={() => handleOpenDialog(r, "revoke")}
                            disabled={!!actionLoading}>
                            إلغاء
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
              {dialogAction === "approve" ? "موافقة على الطلب وتفعيل الترخيص"
              : dialogAction === "reject" ? "رفض طلب التفعيل"
              : dialogAction === "modify" ? "تعديل التفعيل"
              : "إلغاء الترخيص"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.display_name || selectedRequest?.email}
              {selectedRequest?.plan_name && <span className="block text-xs font-semibold mt-1 text-primary">الباقة: {selectedRequest.plan_name} ({selectedRequest.plan_price} {selectedRequest.plan_currency || "SYP"})</span>}
            </DialogDescription>
          </DialogHeader>

          {(dialogAction === "approve" || dialogAction === "modify") ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>نوع الترخيص / مدة الباقة المطبقة</Label>
                <Select value={licenseType} onValueChange={setLicenseType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year_1">سنة واحدة</SelectItem>
                    <SelectItem value="year_2">سنتان</SelectItem>
                    <SelectItem value="year_3">3 سنوات</SelectItem>
                    <SelectItem value="custom_date">تاريخ مخصص</SelectItem>
                    <SelectItem value="lifetime">دائم (مدى الحياة)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {licenseType === "custom_date" && (
                <div className="space-y-2">
                  <Label>تاريخ انتهاء الصلاحية المخصص</Label>
                  <input
                    type="date"
                    value={customExpiryDate}
                    onChange={(e) => setCustomExpiryDate(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{dialogAction === "revoke" ? "سبب الإلغاء" : "سبب الرفض"}</Label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="flex h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  placeholder="اختياري..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button
              variant={dialogAction === "approve" || dialogAction === "modify" ? "default" : "destructive"}
              onClick={handleSubmit}
              disabled={actionLoading?.startsWith(dialogAction)}
            >
              {dialogAction === "approve" ? "تأكيد الموافقة"
              : dialogAction === "reject" ? "تأكيد الرفض"
              : dialogAction === "modify" ? "تعديل"
              : "إلغاء الترخيص"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivationRequests;
