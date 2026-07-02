import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Copy,
  Info,
  Key,
  LogIn,
  MessageCircle,
  PhoneCall,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createActivationRequest, getLocalActivationRequest, checkActivationStatus } from "@/lib/activation-request";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getDeviceId } from "@/lib/device-id";
import { getAppStatus, type AppLicenseStatus } from "@/lib/license";
import { activateLicenseKey } from "@/lib/license-key";
import { flush } from "@/lib/supabase-sync";

interface ActivationProps {
  status: AppLicenseStatus;
  onActivated: () => void;
}

type RequestStatus = "idle" | "pending" | "approved" | "rejected";

const HANDLED_ACTIVATION_KEY = "handled_activation_request_id";

const Activation = ({ status, onActivated }: ActivationProps) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const navigate = useNavigate();
  const deviceId = getDeviceId();

  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [activationToken, setActivationToken] = useState("");
  const [activationRequestStatus, setActivationRequestStatus] = useState<RequestStatus>("idle");
  const [supportPhone] = useState("0991214570");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);
  const activationHandledRef = useRef(false);

  const isExpired = status.status === "trial_expired" || status.status === "license_expired";
  const isBlocked = status.status === "blocked";
  const isSuspended = status.status === "suspended";
  const isTrial = status.status === "trial";
  const isLicensed = status.status === "licensed";

  const finishActivationIfLicensed = useCallback(async (requestToken?: string) => {
    const token = requestToken || activationToken;
    if (activationHandledRef.current) {
      await onActivated();
      navigate("/", { replace: true });
      return true;
    }
    if (token && localStorage.getItem(HANDLED_ACTIVATION_KEY) === token) {
      activationHandledRef.current = true;
      await onActivated();
      navigate("/", { replace: true });
      return true;
    }

    await flush({ force: true });
    const current = await getAppStatus();
    if (current.status !== "licensed") return false;

    activationHandledRef.current = true;
    if (token) localStorage.setItem(HANDLED_ACTIVATION_KEY, token);
    setActivationRequestStatus("approved");
    toast.success(isArabic ? "تم تفعيل التطبيق تلقائياً" : "App activated automatically");
    await onActivated();
    navigate("/", { replace: true });
    return true;
  }, [activationToken, isArabic, navigate, onActivated]);

  useEffect(() => {
    if (status.status === "licensed") {
      onActivated();
      navigate("/", { replace: true });
    }
  }, [status.status, navigate, onActivated]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setSignedIn(!!user);
      if (user) {
        const p = await getProfile();
        if (p) {
          setContactName(p.display_name || "");
          setContactPhone(p.phone || "");
          setContactEmail(p.email || "");
        }
      }

      const local = getLocalActivationRequest();
      if (local && isExpired) {
        setActivationToken(local.requestToken);
        activationHandledRef.current = localStorage.getItem(HANDLED_ACTIVATION_KEY) === local.requestToken;
        setActivationRequestStatus(local.status === "rejected" ? "rejected" : "pending");
      }
    })();
  }, [isExpired]);

  useEffect(() => {
    if (!activationToken || !isExpired) return;

    let stopped = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const s = await checkActivationStatus(activationToken);
      if (stopped) return;

      if (s === "approved") {
        const activated = await finishActivationIfLicensed(activationToken);
        if (activated) {
          stopped = true;
          if (id) window.clearInterval(id);
        }
      } else if (s === "rejected") {
        setActivationRequestStatus("rejected");
        stopped = true;
        if (id) window.clearInterval(id);
      } else if (s === "pending") {
        setActivationRequestStatus("pending");
      }
      if (attempts >= 30) {
        stopped = true;
        window.clearInterval(id);
      }
    };

    poll();
    const id = window.setInterval(poll, 10_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [activationToken, isExpired, finishActivationIfLicensed]);

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
      const result = await activateLicenseKey(licenseKey.trim());
      if (result.ok) {
        toast.success(isArabic ? "تم تفعيل التطبيق بنجاح!" : "App activated successfully!");
        await flush({ force: true });
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
    if (!signedIn) {
      toast.error(isArabic ? "سجّل الدخول أولاً لإرسال الطلب" : "Sign in first to send the request");
      navigate("/auth?next=/activation");
      return;
    }
    if (!contactName.trim() || !contactPhone.trim()) {
      toast.error(isArabic ? "الاسم ورقم الهاتف مطلوبان" : "Name and phone are required");
      return;
    }

    setRequesting(true);
    try {
      const request = await createActivationRequest(contactName.trim(), contactPhone.trim());
      if (request) {
        setActivationToken(request.requestToken);
        setActivationRequestStatus("pending");
        toast.success(isArabic
          ? "تم إرسال طلب التفعيل. سيتم تفعيل التطبيق تلقائياً بعد موافقة الإدارة."
          : "Activation request sent. The app will activate automatically after admin approval.");
      } else {
        toast.error(isArabic ? "تعذر إنشاء الطلب. تحقق من الاتصال" : "Could not create request. Check connection");
      }
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <header className="bg-primary px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center backdrop-blur-sm">
            <Shield className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <h1 className="text-primary-foreground text-lg font-bold select-none">
            {t("activation.title")}
          </h1>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center gap-5">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex gap-2 items-start">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            {isArabic
              ? "الترخيص مرتبط بهذا الجهاز فقط. تغيير الجهاز يتطلب طلب تفعيل جديد. التراخيص لا تنتقل تلقائياً."
              : "This license is bound to this device. Changing devices requires a new activation. Licenses are not transferred automatically."}
          </p>
        </div>

        <div className={`rounded-2xl p-5 text-center shadow-sm ${
          isExpired || isBlocked || isSuspended
              ? "bg-destructive/10 border-2 border-destructive/20"
              : isLicensed
                ? "bg-green-500/10 border-2 border-green-500/30"
                : "bg-primary/10 border-2 border-primary/30"
        }`}>
          {isBlocked || isSuspended ? (
            <>
              <AlertTriangle className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">
                {isSuspended
                  ? (isArabic ? "تم تعليق الترخيص مؤقتاً" : "License Suspended")
                  : (isArabic ? "تم إلغاء الترخيص" : "License Revoked")}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic
                  ? "يرجى مراجعة الإدارة لاستعادة استخدام التطبيق."
                  : "Contact the administrator to restore app access."}
              </p>
            </>
          ) : status.status === "trial_expired" ? (
            <>
              <Clock className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">{t("activation.trialExpired")}</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic
                  ? "أرسل طلب التفعيل وسيتم تفعيل التطبيق تلقائياً بعد موافقة الإدارة."
                  : "Send an activation request. The app will activate automatically after admin approval."}
              </p>
              <SupportActions supportPhone={supportPhone} />
            </>
          ) : status.status === "license_expired" ? (
            <>
              <AlertTriangle className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">{t("activation.licenseExpired")}</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isArabic
                  ? "أرسل طلب تجديد وسيتم تفعيل التطبيق تلقائياً بعد موافقة الإدارة."
                  : "Send a renewal request. The app will activate automatically after admin approval."}
              </p>
              <SupportActions supportPhone={supportPhone} />
            </>
          ) : isLicensed ? (
            <>
              <ShieldCheck className="w-14 h-14 mx-auto mb-3 text-green-500" />
              <h2 className="text-lg font-bold text-foreground">{isArabic ? "التطبيق مفعّل" : "App Activated"}</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {(status as { permanent?: boolean }).permanent ? (
                  <span className="font-bold text-green-500">{isArabic ? "ترخيص دائم" : "Permanent License"}</span>
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

        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            {t("activation.deviceId")}
          </label>
          <div className="flex gap-2">
            <Input value={deviceId} readOnly className="text-left text-xs h-10 font-mono flex-1 bg-muted" dir="ltr" />
            <Button onClick={copyDeviceId} variant="outline" size="icon" className="shrink-0 h-10 w-10">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isArabic
              ? "يُستخدم هذا المعرّف لربط الترخيص بهذا الجهاز تلقائياً."
              : "This ID is used to bind the license to this device automatically."}
          </p>
        </div>

        {isExpired && activationRequestStatus === "rejected" && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-3 text-center">
            <p className="text-sm font-semibold text-destructive">
              {isArabic ? "تم رفض طلب التفعيل" : "Activation request rejected"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isArabic ? "يمكنك مراجعة الإدارة ثم إرسال طلب جديد." : "Contact the administrator, then send a new request."}
            </p>
          </div>
        )}

        {isExpired && activationRequestStatus === "pending" && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 text-center">
            <p className="text-sm font-semibold text-foreground">
              {isArabic ? "تم إرسال طلب التفعيل" : "Activation request sent"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isArabic
                ? "سيتم تفعيل التطبيق تلقائياً بعد موافقة الإدارة."
                : "The app will activate automatically after admin approval."}
            </p>
          </div>
        )}

        {isExpired && activationRequestStatus !== "pending" && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">{t("activation.requestActivation")}</label>
              {signedIn === false && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <LogIn className="w-3 h-3" />
                  {isArabic ? "يتطلب تسجيل الدخول" : "Login required"}
                </span>
              )}
            </div>

            {signedIn === false ? (
              <Button onClick={() => navigate("/auth?next=/activation")} className="w-full h-11">
                <LogIn className="w-4 h-4 mr-2" />
                {isArabic ? "تسجيل الدخول لإرسال الطلب" : "Sign in to request activation"}
              </Button>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {isArabic ? "بياناتك مأخوذة من حسابك. عدّلها إذا لزم." : "Pre-filled from your account. Edit if needed."}
                </p>
                <Input placeholder={isArabic ? "الاسم" : "Name"} value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-10" />
                <Input placeholder={isArabic ? "الهاتف" : "Phone"} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="h-10" dir="ltr" />
                {contactEmail && (
                  <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> {contactEmail}
                  </p>
                )}
                <Button onClick={handleRequestActivation} disabled={requesting} className="w-full h-11">
                  <Send className="w-4 h-4 mr-2" />
                  {requesting
                    ? (isArabic ? "جاري الإرسال..." : "Sending...")
                    : (isArabic ? "إرسال طلب التفعيل" : "Request Activation")}
                </Button>
              </>
            )}
          </div>
        )}

        {!isBlocked && !isSuspended && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key className="w-4 h-4" />
              {t("activation.enterKey")}
            </label>
            <Input
              placeholder={t("activation.keyPlaceholder")}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              className="text-left text-sm h-12 font-mono"
              dir="ltr"
            />
            <Button onClick={handleActivate} disabled={loading || !licenseKey.trim()} className="w-full h-12 text-lg font-bold rounded-xl">
              {loading ? t("activation.verifying") : t("activation.activate")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

function SupportActions({ supportPhone }: { supportPhone: string }) {
  return (
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
  );
}

export default Activation;

