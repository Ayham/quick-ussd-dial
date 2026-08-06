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
        setError(t("activation.loadError"));
      }
      setLicense(lic);
      setHasPending(pending.has_pending);
    } catch (err) {
      setError(t("activation.loadDataError"));
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
        toast.success(t("activation.requestSent"));
        setHasPending(true);
      } else if (result.error === "pending_request_exists") {
        toast.info(t("activation.pendingRequest"));
        setHasPending(true);
      } else {
        toast.error(result.error || t("activation.requestFailed"));
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
          <h1 className="text-2xl font-bold">{t("activation.title")}</h1>
<p className="text-sm text-muted-foreground">
	            {t("activation.subtitle")}
	          </p>
        </div>

        {/* Status Banners */}
        {renderStatusBanner(license, remainingDays, isArabic, isTrialActive, isTrialExpired, isActive, isPermanent, t)}

        {/* User Info Card */}
        {license && renderUserInfoCard(license, isArabic, t)}

        {hasPending && !isLicensed && (
          <div className="bg-warning/10 border border-warning/20 rounded-2xl p-5 text-center space-y-3">
            <Clock className="w-10 h-10 mx-auto text-warning" />
            <h3 className="font-bold">{t("auth.activationPending")}</h3>
<p className="text-sm text-muted-foreground">
	                {t("activation.pendingReviewDesc")}
	              </p>
          </div>
        )}

        {!hasPending && !isLicensed && !error && (
          <div className="space-y-3">
            <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleRequestActivation} disabled={requesting}>
{requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
	                <> {t("activation.requestNow")} </>
	              )}
            </Button>
<p className="text-xs text-muted-foreground text-center">
	              <Info className="w-3 h-3 inline mr-1" />
	              {t("activation.requestAnyTime")}
	            </p>
          </div>
        )}

        {isLicensed && (
<p className="text-xs text-muted-foreground text-center">
	            <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />
	            {t("activation.licenseActive")}
	          </p>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => nav("/")} className="rounded-xl">
            <ArrowLeftFromLine className="w-4 h-4 ml-2" />
            {t("activation.backToApp")}
          </Button>
        </div>
      </div>
    </div>
  );
};

function renderStatusBanner(license: any, remainingDays: number, isArabic: boolean, isTrialActive: boolean, isTrialExpired: boolean, isActive: boolean, isPermanent: boolean, t: any) {
  if (isTrialActive) {
    if (license?.trial_end === null) {
      return <StatusBanner type="success" icon={CheckCircle2} title={t("activation.trialActive")} subtitle={t("activation.trialNoExpiry")} />;
    }
    const isUrgent = remainingDays <= 1;
    return (
      <div className={cn(
        "rounded-2xl p-5 text-center space-y-3 border",
        isUrgent ? "bg-destructive/10 border-destructive/20" : "bg-warning/10 border-warning/20"
      )}>
        <Clock className={cn("w-10 h-10 mx-auto", isUrgent ? "text-destructive" : "text-warning")} />
        <h3 className="font-bold text-lg">{t("activation.trialPeriod")}</h3>
        <p className={cn("text-3xl font-black", isUrgent ? "text-destructive" : "text-warning")}>
          {remainingDays} <span className="text-lg">{t("activation.daysRemainingShort")}</span>
        </p>
<p className="text-sm text-muted-foreground">
	            {t("activation.trialRange", { start: formatDate(license!.trial_start!), end: formatDate(license!.trial_end!) })}
	          </p>
      </div>
    );
  }
  if (isTrialExpired) return <StatusBanner type="error" icon={AlertTriangle} title={t("auth.trialExpired")} subtitle={t("activation.trialExpiredDesc")} />;
  if (isActive) return <StatusBanner type="success" icon={CheckCircle2} title={t("activation.activated")} subtitle={license?.expiry_date ? `${t("auth.expiryDate")} ${formatDate(license.expiry_date)}` : t("activation.licenseActive")} />;
  if (isPermanent) return <StatusBanner type="success" icon={CheckCircle2} title={t("activation.permanent")} subtitle={t("activation.noExpiry")} />;
  if (license?.license_status === "pending") return <StatusBanner type="warning" icon={Clock} title={t("activation.pendingReview")} subtitle={t("activation.pendingReviewDesc")} />;
  if (license?.license_status === "rejected") return <StatusBanner type="error" icon={XCircle} title={t("activation.rejected")} subtitle={t("activation.rejectedDesc")} />;
  if (license?.license_status === "suspended") return <StatusBanner type="error" icon={XCircle} title={t("activation.suspended")} />;
  if (license?.license_status === "blocked") return <StatusBanner type="error" icon={XCircle} title={t("activation.blocked")} />;
  if (license?.license_status === "expired") return <StatusBanner type="error" icon={AlertTriangle} title={t("activation.licenseExpired")} subtitle={t("activation.licenseExpiredDesc")} />;
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

function renderUserInfoCard(license: LicenseInfo, isArabic: boolean, t: any) {
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
        <LicenseBadge status={license.license_status} isArabic={isArabic} t={t} />
      </div>

      {license.phone && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span dir="ltr">{license.phone}</span>
        </div>
      )}

      <div className="border-t border-border/60 pt-4 space-y-3">
        <InfoRow label={t("auth.licenseType")} value={formatLicenseType(license.license_type, isArabic, t)} />
        <InfoRow label={t("auth.accountStatus")} value={<AccountBadge status={license.account_status} isArabic={isArabic} t={t} />} />
        {license.trial_start && <InfoRow label={t("activation.trialStart")} value={formatDate(license.trial_start)} />}
        {license.trial_end && <InfoRow label={t("activation.trialEnd")} value={formatDate(license.trial_end)} />}
        {license.expiry_date && <InfoRow label={t("auth.expiryDate")} value={formatDate(license.expiry_date)} />}
        {license.last_login && <InfoRow label={t("activation.lastLogin")} value={formatDateTime(license.last_login)} />}
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

function LicenseBadge({ status, isArabic, t }: { status: string; isArabic: boolean; t: any }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    trial: { label: t("activation.trialBadge"), variant: "secondary" },
    active: { label: t("activation.activeBadge"), variant: "default" },
    expired: { label: t("activation.expiredBadge"), variant: "destructive" },
    pending: { label: t("activation.pendingBadge"), variant: "secondary" },
    rejected: { label: t("activation.rejectedBadge"), variant: "destructive" },
    permanent: { label: t("activation.permanentBadge"), variant: "default" },
    suspended: { label: t("activation.suspendedBadge"), variant: "destructive" },
    blocked: { label: t("activation.blockedBadge"), variant: "destructive" },
  };
  const c = config[status] || { label: status, variant: "outline" as const };
  return <Badge variant={c.variant} className="rounded-full px-3 py-0.5">{c.label}</Badge>;
}

function AccountBadge({ status, isArabic, t }: { status: string; isArabic: boolean; t: any }) {
  if (status === "active") return <Badge variant="default" className="rounded-full px-3 py-0.5">{t("activation.activeBadge")}</Badge>;
  if (status === "suspended") return <Badge variant="destructive" className="rounded-full px-3 py-0.5">{t("activation.suspendedBadge")}</Badge>;
  if (status === "blocked") return <Badge variant="destructive" className="rounded-full px-3 py-0.5">{t("activation.blockedBadge")}</Badge>;
  return <Badge variant="outline" className="rounded-full px-3 py-0.5">{status}</Badge>;
}

function formatLicenseType(type: string, isArabic: boolean, t: any): string {
  const map: Record<string, string> = {
    trial: t("activation.trialType"),
    days_30: t("activation.days30"),
    days_90: t("activation.days90"),
    days_180: t("activation.days180"),
    days_365: t("activation.yearType"),
    permanent: t("activation.permanentType"),
  };
  return map[type] || type;
}

export default Activation;
