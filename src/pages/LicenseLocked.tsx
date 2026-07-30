import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getLicenseStatus, type LicenseInfo } from "@/lib/license";
import { Lock, AlertTriangle, LogOut, Shield, RefreshCw, Clock } from "lucide-react";

interface LicenseLockedProps {
  reason?: string;
  onUnlock?: () => void;
}

const LicenseLocked = ({ reason: initialReason, onUnlock }: LicenseLockedProps) => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [reason, setReason] = useState(initialReason || "trial_expired");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getLicenseStatus().then((l) => {
      if (l?.is_locked) setLicense(l);
      if (l?.license_status === "trial" && l.trial_end && new Date(l.trial_end) < new Date()) setReason("trial_expired");
      else if (l?.license_status === "expired") setReason("license_expired");
      else if (l?.license_status === "rejected") setReason("activation_rejected");
      else if (l?.license_status === "blocked" || l?.account_status === "blocked") setReason("blocked");
      else if (l?.account_status === "suspended") setReason("suspended");
    });
  }, []);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const lic = await getLicenseStatus();
      if (lic && !lic.is_locked) {
        if (onUnlock) onUnlock();
        nav("/", { replace: true });
      } else {
        setLicense(lic);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  };

  const getLockMessage = () => {
    switch (reason) {
      case "trial_expired":
        return {
          title: isArabic ? "انتهت الفترة التجريبية" : "Trial period ended",
          description: isArabic ? "انتهت الفترة التجريبية لحسابك. يرجى طلب تفعيل التطبيق للمتابعة." : "Your trial period has ended. Please request activation to continue.",
          icon: <Clock className="w-12 h-12 text-destructive" />,
        };
      case "license_expired":
        return {
          title: isArabic ? "انتهى الترخيص" : "License expired",
          description: isArabic ? "انتهت صلاحية الترخيص الخاص بك. يرجى الاتصال بالإدارة للتجديد." : "Your license has expired. Please contact administration for renewal.",
          icon: <AlertTriangle className="w-12 h-12 text-destructive" />,
        };
      case "activation_rejected":
        return {
          title: isArabic ? "تم رفض طلب التفعيل" : "Activation rejected",
          description: isArabic ? "لم تتم الموافقة على طلب التفعيل الخاص بك. يرجى الاتصال بالإدارة." : "Your activation request was not approved. Please contact administration.",
          icon: <Shield className="w-12 h-12 text-destructive" />,
        };
      case "suspended":
        return {
          title: isArabic ? "الحساب موقوف" : "Account suspended",
          description: isArabic ? "تم إيقاف حسابك. يرجى الاتصال بالإدارة للمزيد من المعلومات." : "Your account has been suspended. Please contact administration for more information.",
          icon: <Lock className="w-12 h-12 text-destructive" />,
        };
      case "blocked":
        return {
          title: isArabic ? "الحساب محظور" : "Account blocked",
          description: isArabic ? "تم حظر حسابك. يرجى الاتصال بالإدارة للمزيد من المعلومات." : "Your account has been blocked. Please contact administration.",
          icon: <Lock className="w-12 h-12 text-destructive" />,
        };
      default:
        return {
          title: isArabic ? "التطبيق مقفل" : "Application locked",
          description: isArabic ? "التطبيق يحتاج إلى تفعيل للمتابعة." : "The application requires activation to continue.",
          icon: <Lock className="w-12 h-12 text-destructive" />,
        };
    }
  };

  const msg = getLockMessage();

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-sm space-y-6 animate-scale-in">
        <Card className="rounded-2xl p-8 shadow-card border-destructive/20 text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
            {msg.icon}
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-destructive">{msg.title}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{msg.description}</p>
          </div>

          {license && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isArabic ? "البريد الإلكتروني" : "Email"}</span>
                <span className="font-medium" dir="ltr">{license.email}</span>
              </div>
              {license.trial_end && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isArabic ? "انتهاء التجربة" : "Trial ended"}</span>
                  <span className="font-medium">{new Date(license.trial_end).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <Button onClick={() => nav("/activation")} className="w-full h-12 font-bold rounded-xl">
              <Shield className="w-4 h-4 mr-2" />
              {isArabic ? "طلب التفعيل" : "Request activation"}
            </Button>

            <Button variant="outline" className="w-full h-11 rounded-xl" onClick={handleRecheck} disabled={checking}>
              <RefreshCw className={`w-4 h-4 mr-2 ${checking ? "animate-spin" : ""}`} />
              {isArabic ? "التحقق مرة أخرى" : "Re-check"}
            </Button>

            <Button variant="ghost" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> {t("common.logout")}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LicenseLocked;
