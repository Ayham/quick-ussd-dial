import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Key, Smartphone, CheckCircle, AlertTriangle, Clock, Shield, ShieldCheck, MessageCircle, PhoneCall, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getDeviceId } from "@/lib/device-id";
import { validateLicense, saveLicense, type AppLicenseStatus } from "@/lib/license";
import { activateLicenseKey, formatLicenseKey, isShortFormat } from "@/lib/license-key";
import { createActivationRequest, getActivationRequestLink, getLocalActivationRequest } from "@/lib/activation-request";

interface ActivationProps {
  status: AppLicenseStatus;
  onActivated: () => void;
}

const Activation = ({ status, onActivated }: ActivationProps) => {
  const { t, i18n } = useTranslation();
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [showActivationRequest, setShowActivationRequest] = useState(false);
  const [activationLink, setActivationLink] = useState("");
  const [supportPhone, setSupportPhone] = useState("0991214570");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  
  const deviceId = getDeviceId();
  const navigate = useNavigate();
  const titleTapCountRef = useRef(0);
  const iconTapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isArabic = i18n.language === 'ar';
  const isExpired = status.status === 'trial_expired' || status.status === 'license_expired';
  const isTampered = status.status === 'clock_tampered';
  const isTrial = status.status === 'trial';
  const isLicensed = status.status === 'licensed';

  // Hidden admin login - 7 taps on title
  const handleTitleTap = () => {
    titleTapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (titleTapCountRef.current >= 7) {
      titleTapCountRef.current = 0;
      setShowAdminPanel(true);
      toast.success("Admin panel unlocked");
    } else {
      tapTimerRef.current = setTimeout(() => { titleTapCountRef.current = 0; }, 2000);
    }
  };

  // Hidden admin login - 7 taps on icon
  const handleIconTap = () => {
    iconTapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (iconTapCountRef.current >= 7) {
      iconTapCountRef.current = 0;
      setShowAdminPanel(true);
      toast.success("Admin panel unlocked");
    } else {
      tapTimerRef.current = setTimeout(() => { iconTapCountRef.current = 0; }, 2000);
    }
  };

  const handleAdminLogin = () => {
    // For demo: password is "admin" or any 4-character password
    if (adminPassword.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    // In production, verify against actual admin password
    navigate("/sys-panel");
  };

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      toast.success(isArabic ? "تم نسخ معرف الجهاز" : "Device ID copied");
    } catch {
      const el = document.createElement("textarea");
      el.value = deviceId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success(isArabic ? "تم نسخ معرف الجهاز" : "Device ID copied");
    }
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error(isArabic ? "الرجاء إدخال مفتاح الترخيص" : "Please enter a license key");
      return;
    }
    setLoading(true);
    try {
      // Try new short format first (cloud-validated, supports legacy fallback inside)
      const result = await activateLicenseKey(licenseKey.trim());
      if (result.ok) {
        // For legacy keys, also save via legacy path
        if (!isShortFormat(licenseKey.trim())) saveLicense(licenseKey.trim());
        toast.success(isArabic ? "تم تفعيل التطبيق بنجاح!" : "App activated successfully!");
        onActivated();
      } else {
        toast.error(result.reason === "network"
          ? (isArabic ? "تحقق من الاتصال بالإنترنت" : "Check your internet connection")
          : (isArabic ? "مفتاح الترخيص غير صالح" : "Invalid license key"));
      }
    } catch {
      toast.error(isArabic ? "حدث خطأ أثناء التحقق" : "Verification error");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestActivation = async () => {
    const request = await createActivationRequest(contactName || undefined, contactPhone || undefined);
    if (request) {
      const link = getActivationRequestLink(request.requestToken);
      setActivationLink(link);
      setShowActivationRequest(true);
      toast.success(isArabic ? "تم إنشاء رابط التفعيل" : "Activation link created");
    } else {
      toast.error(isArabic ? "فشل إنشاء الرابط" : "Failed to create link");
    }
  };

  const copyActivationLink = async () => {
    try {
      await navigator.clipboard.writeText(activationLink);
      toast.success(isArabic ? "تم نسخ رابط التفعيل" : "Link copied");
    } catch {
      const el = document.createElement("textarea");
      el.value = activationLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success(isArabic ? "تم نسخ رابط التفعيل" : "Link copied");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>

      <header className="bg-primary px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center backdrop-blur-sm cursor-pointer select-none"
            onClick={handleIconTap}
          >
            <Shield className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <h1 
            className="text-primary-foreground text-lg font-bold select-none cursor-pointer"
            onClick={handleTitleTap}
          >
            {t('activation.title')}
          </h1>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center gap-5">
        {/* Admin Panel Login */}
        {showAdminPanel && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3 fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-background rounded-2xl p-6 w-full max-w-sm space-y-4">
              <h2 className="text-lg font-bold text-center">{isArabic ? "لوحة المسؤول" : "Admin Panel"}</h2>
              <Input
                type="password"
                placeholder={isArabic ? "كلمة المرور" : "Password"}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="h-10"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAdminLogin}
                  className="flex-1"
                >
                  {isArabic ? "دخول" : "Login"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdminPanel(false);
                    setAdminPassword("");
                  }}
                  className="flex-1"
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Activation Request Dialog */}
        {showActivationRequest && activationLink && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3 fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-background rounded-2xl p-6 w-full max-w-sm space-y-4">
              <h2 className="text-lg font-bold text-center">{isArabic ? "رابط التفعيل" : "Activation Link"}</h2>
              <p className="text-sm text-muted-foreground text-center">
                {t('activation.copyLink')}
              </p>
              <Input
                value={activationLink}
                readOnly
                className="text-left text-xs h-10 font-mono bg-muted"
                dir="ltr"
              />
              <Button
                onClick={copyActivationLink}
                className="w-full"
              >
                <Copy className="w-4 h-4 mr-2" />
                {isArabic ? "نسخ الرابط" : "Copy Link"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowActivationRequest(false);
                  setActivationLink("");
                }}
                className="w-full"
              >
                {isArabic ? "إغلاق" : "Close"}
              </Button>
            </div>
          </div>
        )}

        {/* Status Card */}
        <div className={`rounded-2xl p-5 text-center shadow-sm ${
          isTampered
            ? "bg-destructive/10 border-2 border-destructive/30"
            : isExpired
              ? "bg-destructive/10 border-2 border-destructive/20"
              : isLicensed
                ? "bg-green-500/10 border-2 border-green-500/30"
                : "bg-primary/10 border-2 border-primary/30"
        }`}>
          {isTampered ? (
            <>
              <AlertTriangle className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-destructive">
                {isArabic ? "تم اكتشاف تلاعب بالتاريخ" : "Date Tampering Detected"}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic ? "يرجى ضبط تاريخ الجهاز بشكل صحيح وإعادة تشغيل التطبيق" : "Please set the correct date and restart the app"}
              </p>
            </>
          ) : status.status === 'trial_expired' ? (
            <>
              <Clock className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">
                {t('activation.trialExpired')}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic ? "يرجى إدخال مفتاح الترخيص لمتابعة استخدام التطبيق" : "Enter a license key to continue using the app"}
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-sm font-mono text-foreground font-bold" dir="ltr">{supportPhone}</span>
                <a
                  href={`https://wa.me/${supportPhone.replace(/^0/, "963")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-success/15 text-success hover:bg-success/25 transition-colors"
                >
                  <MessageCircle className="w-4.5 h-4.5" />
                </a>
                <a
                  href={`tel:${supportPhone}`}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                >
                  <PhoneCall className="w-4.5 h-4.5" />
                </a>
              </div>
            </>
          ) : status.status === 'license_expired' ? (
            <>
              <AlertTriangle className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">
                {t('activation.licenseExpired')}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic ? "يرجى تجديد الترخيص لمتابعة استخدام التطبيق" : "Please renew your license to continue"}
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-sm font-mono text-foreground font-bold" dir="ltr">{supportPhone}</span>
                <a
                  href={`https://wa.me/${supportPhone.replace(/^0/, "963")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-success/15 text-success hover:bg-success/25 transition-colors"
                >
                  <MessageCircle className="w-4.5 h-4.5" />
                </a>
                <a
                  href={`tel:${supportPhone}`}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                >
                  <PhoneCall className="w-4.5 h-4.5" />
                </a>
              </div>
            </>
          ) : isLicensed ? (
            <>
              <ShieldCheck className="w-14 h-14 mx-auto mb-3 text-green-500" />
              <h2 className="text-lg font-bold text-foreground">{isArabic ? "التطبيق مفعّل" : "App Activated"}</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {(status as { permanent?: boolean }).permanent ? (
                  <span className="font-bold text-green-500">{isArabic ? "ترخيص دائم ✨" : "Permanent License ✨"}</span>
                ) : (
                  <>
                    {isArabic ? "ينتهي الترخيص بتاريخ" : "Expires on"} {(status as { expiryDate: string }).expiryDate}
                    <br />
                    {isArabic ? "متبقي" : "Days left"}: {(status as { daysLeft: number }).daysLeft}
                  </>
                )}
              </p>
            </>
          ) : isTrial ? (
            <>
              <CheckCircle className="w-14 h-14 mx-auto mb-3 text-primary" />
              <h2 className="text-lg font-bold text-foreground">{isArabic ? "الفترة التجريبية" : "Trial Period"}</h2>
              <div className="mt-3">
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.max(5, ((status as { daysLeft: number }).daysLeft / 30) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {isArabic ? "متبقي" : "Days left"}: <span className="font-bold text-foreground">{(status as { daysLeft: number }).daysLeft}</span>
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Device ID */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            {t('activation.deviceId')}
          </label>
          <div className="flex gap-2">
            <Input
              value={deviceId}
              readOnly
              className="text-left text-xs h-10 font-mono flex-1 bg-muted"
              dir="ltr"
            />
            <Button
              onClick={copyDeviceId}
              variant="outline"
              size="icon"
              className="shrink-0 h-10 w-10"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isArabic ? "أرسل هذا المعرف للمسؤول للحصول على مفتاح الترخيص" : "Send this to the administrator to get a license key"}
          </p>
        </div>

        {/* Activation Request (for expired trials) */}
        {isExpired && !showActivationRequest && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-foreground">
              {t('activation.requestActivation')}
            </label>
            <Input
              placeholder={isArabic ? "الاسم (اختياري)" : "Name (optional)"}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="h-10"
            />
            <Input
              placeholder={isArabic ? "الهاتف (اختياري)" : "Phone (optional)"}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-10"
              dir="ltr"
            />
            <Button
              onClick={handleRequestActivation}
              className="w-full h-11"
            >
              <Send className="w-4 h-4 mr-2" />
              {isArabic ? "إرسال طلب التفعيل" : "Request Activation"}
            </Button>
          </div>
        )}

        {/* License Input */}
        {!isTampered && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key className="w-4 h-4" />
              {t('activation.enterKey')}
            </label>
            <Input
              placeholder={t('activation.keyPlaceholder')}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              className="text-left text-sm h-12 font-mono"
              dir="ltr"
            />
            <Button
              onClick={handleActivate}
              disabled={loading || !licenseKey.trim()}
              className="w-full h-12 text-lg font-bold rounded-xl"
            >
              {loading ? t('activation.verifying') : t('activation.activate')}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Activation;
