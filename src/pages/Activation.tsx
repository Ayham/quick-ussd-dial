import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getLicenseStatus, requestActivation, checkPendingActivation, getTrialRemainingDays, type LicenseInfo } from "@/lib/license";
import { getDeviceId } from "@/lib/device";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, Phone, User, Info, ArrowLeftFromLine, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const Activation = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lic, pending] = await Promise.all([
        getLicenseStatus(),
        checkPendingActivation(),
      ]);
      if (lic === null) {
        setError(isArabic ? "تعذر تحميل بيانات الترخيص" : "Could not load license data");
      }
      setLicense(lic);
      setHasPending(pending.has_pending);
    } catch (err) {
      setError(isArabic ? "حدث خطأ في تحميل البيانات" : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRequestActivation = async () => {
    setRequesting(true);
    try {
      const deviceId = getDeviceId();
      const result = await requestActivation(deviceId, license?.display_name || undefined, license?.phone || undefined);
      if (result.success) {
        toast.success(isArabic ? "تم إرسال طلب التفعيل" : "Activation request sent");
        setHasPending(true);
      } else if (result.error === "pending_request_exists") {
        toast.info(isArabic ? "لديك طلب تفعيل معلق بالفعل" : "You already have a pending request");
        setHasPending(true);
      } else {
        toast.error(result.error || (isArabic ? "فشل إرسال الطلب" : "Request failed"));
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
        <div className="max-w-md mx-auto space-y-6 pt-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const remainingDays = license ? getTrialRemainingDays(license.trial_end) : 0;
  const isTrialActive = license?.license_status === "trial" && (license.trial_end === null || remainingDays > 0);
  const isTrialExpired = license?.license_status === "trial" && license.trial_end !== null && remainingDays === 0;
  const isActive = license?.license_status === "active";
  const isPermanent = license?.license_status === "permanent";
  const isLicensed = isActive || isPermanent;
  const isLocked = license?.is_locked === true;

  return (
    <div className="min-h-dvh bg-background safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2 pt-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{isArabic ? "حالة التفعيل" : "Activation Status"}</h1>
          <p className="text-sm text-muted-foreground">
            {isArabic ? "حالة ترخيص التطبيق والمعلومات الخاصة بك" : "Your application license status and information"}
          </p>
        </div>

        {/* Status Banners */}
        {renderStatusBanner(license, remainingDays, isArabic, isTrialActive, isTrialExpired, isActive, isPermanent)}

        {/* User Info Card */}
        {license && renderUserInfoCard(license, isArabic)}

        {hasPending && !isLicensed && (
          <div className="bg-warning/10 border border-warning/20 rounded-2xl p-5 text-center space-y-3">
            <Clock className="w-10 h-10 mx-auto text-warning" />
            <h3 className="font-bold">{isArabic ? "طلب التفعيل قيد المراجعة" : "Activation request pending"}</h3>
            <p className="text-sm text-muted-foreground">
              {isArabic ? "تم استلام طلبك وهو قيد المراجعة من قبل الإدارة. سيتم إعلامك عند الموافقة." : "Your request has been received and is under review. You will be notified once approved."}
            </p>
          </div>
        )}

        {!hasPending && !isLicensed && !error && (
          <div className="space-y-3">
            <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleRequestActivation} disabled={requesting}>
              {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>{isArabic ? "طلب التفعيل الآن" : "Request activation now"}</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              <Info className="w-3 h-3 inline mr-1" />
              {isArabic ? "يمكنك طلب التفعيل في أي وقت حتى أثناء الفترة التجريبية" : "You can request activation at any time, even during the trial period"}
            </p>
          </div>
        )}

        {isLicensed && (
          <p className="text-xs text-muted-foreground text-center">
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />
            {isArabic ? "ترخيصك نشط. لا حاجة لاتخاذ أي إجراء." : "Your license is active. No action needed."}
          </p>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => nav("/")} className="rounded-xl">
            <ArrowLeftFromLine className="w-4 h-4 ml-2" />
            {isArabic ? "العودة إلى التطبيق" : "Back to app"}
          </Button>
        </div>
      </div>
    </div>
  );
};

function renderStatusBanner(license: any, remainingDays: number, isArabic: boolean, isTrialActive: boolean, isTrialExpired: boolean, isActive: boolean, isPermanent: boolean) {
  if (isTrialActive) {
    if (license?.trial_end === null) {
      return <StatusBanner type="success" icon={CheckCircle2} title={isArabic ? "الفترة التجريبية نشطة" : "Trial Active"} subtitle={isArabic ? "الترخيص التجريبي لا ينتهي" : "Trial license with no expiry"} />;
    }
    const isUrgent = remainingDays <= 1;
    return (
      <div className={cn(
        "rounded-2xl p-5 text-center space-y-3 border",
        isUrgent ? "bg-destructive/10 border-destructive/20" : "bg-warning/10 border-warning/20"
      )}>
        <Clock className={cn("w-10 h-10 mx-auto", isUrgent ? "text-destructive" : "text-warning")} />
        <h3 className="font-bold text-lg">{isArabic ? "الفترة التجريبية" : "Trial Period"}</h3>
        <p className={cn("text-3xl font-black", isUrgent ? "text-destructive" : "text-warning")}>
          {remainingDays} <span className="text-lg">{isArabic ? "يوم متبقي" : "days remaining"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? `من ${formatDate(license!.trial_start!)} إلى ${formatDate(license!.trial_end!)}`
            : `From ${formatDate(license!.trial_start!)} to ${formatDate(license!.trial_end!)}`}
        </p>
      </div>
    );
  }
  if (isTrialExpired) return <StatusBanner type="error" icon={AlertTriangle} title={isArabic ? "انتهت الفترة التجريبية" : "Trial Period Expired"} subtitle={isArabic ? "انتهت الفترة التجريبية. يرجى طلب التفعيل للمتابعة." : "Your trial has ended. Please request activation to continue."} />;
  if (isActive) return <StatusBanner type="success" icon={CheckCircle2} title={isArabic ? "مفعل" : "Activated"} subtitle={license?.expiry_date ? `${isArabic ? "صالح حتى" : "Valid until"} ${formatDate(license.expiry_date)}` : isArabic ? "الترخيص نشط" : "License is active"} />;
  if (isPermanent) return <StatusBanner type="success" icon={CheckCircle2} title={isArabic ? "مفعل بشكل دائم" : "Permanently Activated"} subtitle={isArabic ? "الترخيص لا ينتهي" : "License does not expire"} />;
  if (license?.license_status === "pending") return <StatusBanner type="warning" icon={Clock} title={isArabic ? "قيد المراجعة" : "Pending Review"} subtitle={isArabic ? "طلب التفعيل قيد المراجعة من قبل الإدارة" : "Your activation request is under review"} />;
  if (license?.license_status === "rejected") return <StatusBanner type="error" icon={XCircle} title={isArabic ? "تم رفض الطلب" : "Request Rejected"} subtitle={isArabic ? "لم تتم الموافقة على طلب التفعيل. يمكنك تقديم طلب جديد." : "Your activation request was not approved. You can submit a new request."} />;
  if (license?.license_status === "suspended") return <StatusBanner type="error" icon={XCircle} title={isArabic ? "الحساب موقوف" : "Account Suspended"} />;
  if (license?.license_status === "blocked") return <StatusBanner type="error" icon={XCircle} title={isArabic ? "الحساب محظور" : "Account Blocked"} />;
  if (license?.license_status === "expired") return <StatusBanner type="error" icon={AlertTriangle} title={isArabic ? "انتهى الترخيص" : "License Expired"} subtitle={isArabic ? "انتهت صلاحية الترخيص. يرجى الاتصال بالإدارة للتجديد." : "Your license has expired. Please contact administration."} />;
  return null;
}

function StatusBanner({ type, icon: Icon, title, subtitle }: { type: "success" | "warning" | "error"; icon: any; title: string; subtitle?: string }) {
  const colors = {
    success: "bg-success/10 border-success/20 text-success",
    warning: "bg-warning/10 border-warning/20 text-warning",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };
  return (
    <div className={cn("rounded-2xl p-5 text-center space-y-2 border", colors[type])}>
      <Icon className="w-10 h-10 mx-auto" />
      <h3 className="font-bold text-lg">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function renderUserInfoCard(license: LicenseInfo, isArabic: boolean) {
  return (
    <Card className="rounded-2xl p-5 space-y-4 shadow-sm border border-border/60">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{license.display_name || license.email}</p>
          <p className="text-xs text-muted-foreground truncate">{license.email}</p>
        </div>
        <LicenseBadge status={license.license_status} isArabic={isArabic} />
      </div>

      {license.phone && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span dir="ltr">{license.phone}</span>
        </div>
      )}

      <div className="border-t border-border/60 pt-4 space-y-3">
        <InfoRow label={isArabic ? "نوع الترخيص" : "License type"} value={formatLicenseType(license.license_type, isArabic)} />
        <InfoRow label={isArabic ? "حالة الحساب" : "Account status"} value={<AccountBadge status={license.account_status} isArabic={isArabic} />} />
        {license.trial_start && <InfoRow label={isArabic ? "بداية التجربة" : "Trial start"} value={formatDate(license.trial_start)} />}
        {license.trial_end && <InfoRow label={isArabic ? "نهاية التجربة" : "Trial end"} value={formatDate(license.trial_end)} />}
        {license.expiry_date && <InfoRow label={isArabic ? "تاريخ الانتهاء" : "Expiry date"} value={formatDate(license.expiry_date)} />}
        {license.last_login && <InfoRow label={isArabic ? "آخر تسجيل دخول" : "Last login"} value={formatDateTime(license.last_login)} />}
      </div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
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
  return <Badge variant={c.variant} className="rounded-full px-3 py-0.5">{c.label}</Badge>;
}

function AccountBadge({ status, isArabic }: { status: string; isArabic: boolean }) {
  if (status === "active") return <Badge variant="default" className="rounded-full px-3 py-0.5">{isArabic ? "نشط" : "Active"}</Badge>;
  if (status === "suspended") return <Badge variant="destructive" className="rounded-full px-3 py-0.5">{isArabic ? "موقوف" : "Suspended"}</Badge>;
  if (status === "blocked") return <Badge variant="destructive" className="rounded-full px-3 py-0.5">{isArabic ? "محظور" : "Blocked"}</Badge>;
  return <Badge variant="outline" className="rounded-full px-3 py-0.5">{status}</Badge>;
}

function formatLicenseType(type: string, isArabic: boolean): string {
  const map: Record<string, string> = {
    trial: isArabic ? "تجريبي (15 يوم)" : "Trial (15 days)",
    days_30: isArabic ? "30 يوم" : "30 Days",
    days_90: isArabic ? "90 يوم" : "90 Days",
    days_180: isArabic ? "180 يوم" : "180 Days",
    days_365: isArabic ? "سنة" : "1 Year",
    permanent: isArabic ? "دائم" : "Permanent",
  };
  return map[type] || type;
}

export default Activation;
