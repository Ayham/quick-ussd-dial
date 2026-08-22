import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getLicenseStatus, checkPendingActivation, getTrialRemainingDays, type LicenseInfo, type LicenseStatus, type AccountStatus } from "@/lib/license";
import { getDeviceId } from "@/lib/device";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, Phone, User, Info, ArrowLeftFromLine, WifiOff, Star, CreditCard, MessageCircle, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeLicenseDecision } from "@/lib/license-decision";
import { getCachedValidation, type ValidationResult } from "@/lib/license-cache";

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  duration_days: number;
  price: number;
  currency: string;
  max_devices: number;
  is_featured: boolean;
}

interface PaymentMethod {
  id: string;
  title: string;
  description: string | null;
  details: string | null;
  qr_image_url: string | null;
  whatsapp_number: string | null;
}

const DEFAULT_PLANS: SubscriptionPlan[] = [
  { id: "p-month", code: "monthly", name: "الباقة الشهرية", description: "اشتراك لمدة 30 يوم مع كافة الميزات", duration_days: 30, price: 50000, currency: "SYP", max_devices: 2, is_featured: true },
  { id: "p-quarter", code: "quarterly", name: "الباقة الربع سنوية", description: "اشتراك لمدة 3 أشهر", duration_days: 90, price: 135000, currency: "SYP", max_devices: 3, is_featured: false },
  { id: "p-year", code: "yearly", name: "الباقة السنوية", description: "اشتراك لمدة سنة كاملة وتوفير أكثر", duration_days: 365, price: 480000, currency: "SYP", max_devices: 5, is_featured: false },
  { id: "p-lifetime", code: "lifetime", name: "الباقة الدائمة", description: "ترخيص مدى الحياة بدون تجديد", duration_days: 36500, price: 1500000, currency: "SYP", max_devices: 10, is_featured: false },
];

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: "m-syriatel", title: "شام كاش (Syriatel Cash)", description: "تحويل فوري عبر سيرياتيل كاش", details: "رقم الحساب: 0930000000\nاسم الحساب: Quick USSD Dial", whatsapp_number: "+963930000000", qr_image_url: null },
  { id: "m-mtn", title: "ام تى ان كاش (MTN Cash)", description: "تحويل فوري عبر إم تي إن كاش", details: "رقم الحساب: 0940000000\nاسم الحساب: Quick USSD Dial", whatsapp_number: "+963940000000", qr_image_url: null },
];

const Activation = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [decision, setDecision] = useState<ReturnType<typeof computeLicenseDecision> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pendingData, setPendingData] = useState<{ has_pending: boolean; id?: string; status?: string; payment_status?: string } | null>(null);

  const [step, setStep] = useState<"select_plan" | "select_payment" | "pending_review">("select_plan");
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_PLANS);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(DEFAULT_PLANS[0].id);
  const [requestNote, setRequestNote] = useState("");
  const [isRenewal, setIsRenewal] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(DEFAULT_PAYMENT_METHODS[0].id);
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const applyLicense = (lic: LicenseInfo | null) => {
    if (lic === null) {
      setError(t("activation.loadError"));
      setLicense(null);
      setDecision(null);
      return;
    }
    setError(null);
    setLicense(lic);
    const authState = { authenticated: true, userId: lic.user_id };
    setDecision(computeLicenseDecision(authState, lic));
  };

  const loadData = async () => {
    if (!navigator.onLine) {
      setOffline(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [lic, pending] = await Promise.all([
        getLicenseStatus(),
        checkPendingActivation(),
      ]);

      setOffline(false);
      applyLicense(lic);
      setPendingData(pending);
      if (pending?.has_pending) {
        setRequestId(pending.id || null);
        if (pending.status) {
          setStep("pending_review");
        }
      }

      // Try loading plans from Supabase, fallback to defaults if table doesn't exist yet
      try {
        const { data: plansData } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("display_order", { ascending: true });
        if (plansData && plansData.length > 0) {
          setPlans(plansData);
          const featured = plansData.find((p) => p.is_featured) || plansData[0];
          if (featured) setSelectedPlanId(featured.id);
        }
      } catch (e) {
        console.warn("Using default plans (table not migrated yet)");
      }

      // Try loading payment methods from Supabase, fallback to defaults if table doesn't exist yet
      try {
        const { data: methodsData } = await supabase.from("payment_methods").select("*").eq("is_active", true).order("display_order", { ascending: true });
        if (methodsData && methodsData.length > 0) {
          setPaymentMethods(methodsData);
          setSelectedPaymentMethodId(methodsData[0].id);
        }
      } catch (e) {
        console.warn("Using default payment methods (table not migrated yet)");
      }

    } catch (err) {
      setError("فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRequestActivation = async () => {
    if (!navigator.onLine) {
      toast.error("يرجى الاتصال بالإنترنت لطلب التفعيل.");
      return;
    }
    if (!selectedPlanId) {
      toast.error("يرجى اختيار باقة واحدة على الأقل.");
      return;
    }

    setSubmitting(true);
    try {
      const deviceId = getDeviceId();
      const reqType = isRenewal ? "renewal" : "activation";
      
      // Try RPC request_activation, fallback to direct insert if RPC signature is old or missing
      let res: { success: boolean; error?: string; request_id?: string; request_token?: string } = { success: false };
      try {
        const { data, error } = await supabase.rpc("request_activation", {
          _device_id: deviceId,
          _plan_id: selectedPlanId,
          _request_type: reqType,
          _contact_name: license?.display_name || null,
          _contact_phone: license?.phone || null,
          _notes: requestNote || null,
          _ussd_numbers: [],
        });
        if (!error && data) {
          res = data as any;
        }
      } catch (rpcErr) {
        // Fallback direct insert into activations if RPC fails
        const token = Math.random().toString(36).substring(2);
        const { data: insertData, error: insertError } = await supabase.from("activations").insert({
          request_token: token,
          device_id: deviceId,
          user_id: license?.user_id || null,
          plan_id: selectedPlanId,
          request_type: reqType,
          contact_name: license?.display_name || null,
          contact_phone: license?.phone || null,
          notes: requestNote || null,
          status: 'pending'
        }).select().single();
        if (!insertError && insertData) {
          res = { success: true, request_id: insertData.id };
        } else {
          res = { success: false, error: insertError?.message || "Failed to create request" };
        }
      }

      if (res.success) {
        toast.success("تم إنشاء طلب التفعيل بنجاح. يرجى اختيار طريقة الدفع.");
        if (res.request_id) setRequestId(res.request_id);
        setStep("select_payment");
      } else if (res.error === "pending_request_exists") {
        toast.info("يوجد لديك طلب قيد المراجعة بالفعل.");
        setStep("pending_review");
      } else {
        toast.error(res.error || "فشل إرسال الطلب");
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendPaymentInfo = async () => {
    if (!navigator.onLine) {
      toast.error("يرجى الاتصال بالإنترنت لإرسال تفاصيل الدفع.");
      return;
    }
    if (!requestId) {
      toast.error("رقم الطلب غير موجود.");
      return;
    }
    if (!selectedPaymentMethodId) {
      toast.error("يرجى اختيار طريقة الدفع.");
      return;
    }
    if (!payerName || !payerPhone) {
      toast.error("يرجى إدخال اسم صاحب عملية الدفع ورقم الهاتف المستخدم.");
      return;
    }

    setSubmitting(true);
    try {
      try {
        await supabase.rpc("submit_activation_payment", {
          _request_id: requestId,
          _payment_method_id: selectedPaymentMethodId,
          _payer_name: payerName,
          _payer_phone: payerPhone,
          _payment_note: paymentNote || null,
          _transaction_reference: transactionRef || null,
        });
      } catch {
        // Fallback update
        await supabase.from("activations").update({
          payment_method_id: selectedPaymentMethodId,
          payer_name: payerName,
          payer_phone: payerPhone,
          payment_note: paymentNote || null,
          transaction_reference: transactionRef || null,
          payment_status: 'submitted'
        }).eq("id", requestId);
      }

      toast.success("تم إرسال تفاصيل الدفع بنجاح.");
      setStep("pending_review");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  const openWhatsApp = () => {
    const method = paymentMethods.find((m) => m.id === selectedPaymentMethodId);
    const phone = method?.whatsapp_number || "+963930000000";
    const selectedPlan = plans.find((p) => p.id === selectedPlanId);
    const msg = encodeURIComponent(
      `السلام عليكم، لقد قمت بطلب تفعيل / تجديد ترخيص في تطبيق Quick USSD Dial.\n` +
      `- الباقة: ${selectedPlan?.name || "-"}\n` +
      `- المبلغ: ${selectedPlan?.price || "-"} ${selectedPlan?.currency || "SYP"}\n` +
      `- اسم المرسل: ${payerName}\n` +
      `- رقم الهاتف المستخدم: ${payerPhone}\n` +
      `- رقم المرجع / العملية: ${transactionRef || "-"}\n` +
      `- ملاحظات: ${paymentNote || "-"}`
    );
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${msg}`, "_blank");
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

  if (offline) {
    return (
      <div className="min-h-dvh bg-background p-6 flex flex-col items-center justify-center text-center space-y-4" dir={isArabic ? "rtl" : "ltr"}>
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
          <WifiOff className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold">غير متصل بالإنترنت</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          يرجى الاتصال بالإنترنت لعرض الباقات وطلب التفعيل.
        </p>
        <Button onClick={loadData} className="mt-2 rounded-xl">
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const remainingDays = license ? (decision?.daysRemaining ?? 0) : 0;
  const isTrialActive = decision?.licenseStatus === "trial" && decision?.canTransfer;
  const isTrialExpired = decision?.licenseStatus === "trial" && !decision?.canTransfer;
  const isActive = decision?.licenseStatus === "active" && decision?.canTransfer;
  const isPermanent = decision?.licenseStatus === "permanent";
  const isLicensed = isActive || isPermanent;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedPaymentMethod = paymentMethods.find((m) => m.id === selectedPaymentMethodId);

  return (
    <div className="min-h-dvh bg-background safe-area-insets pb-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2 pt-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t("activation.title")}</h1>
          <p className="text-sm text-muted-foreground">
            شراء، تفعيل أو تجديد الترخيص بكل سهولة
          </p>
        </div>

        {renderStatusBanner(decision, license, remainingDays, isArabic, t)}

        {license && renderUserInfoCard(license, isArabic, t)}

        {(step === "pending_review" || pendingData?.has_pending) ? (
          <div className="bg-warning/10 border border-warning/20 rounded-2xl p-6 text-center space-y-4">
            <Clock className="w-12 h-12 mx-auto text-warning" />
            <h3 className="text-lg font-bold">طلبك قيد المعالجة</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              تم إرسال طلبك بنجاح. طلبك قيد المعالجة من قبل الإدارة. سيتم تفعيل الباقة فور مراجعة الدفع.
            </p>
            <Button variant="outline" size="sm" onClick={() => setStep("select_plan")} className="rounded-xl">
              عرض الباقات وطرق الدفع
            </Button>
          </div>
        ) : step === "select_payment" ? (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" /> اختر طريقة الدفع
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setStep("select_plan")} className="text-xs">
                العودة للباقات
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {paymentMethods.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedPaymentMethodId(m.id)}
                  className={cn(
                    "p-4 rounded-2xl border cursor-pointer transition-all space-y-2",
                    selectedPaymentMethodId === m.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border/60 bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">{m.title}</span>
                    {selectedPaymentMethodId === m.id && <Check className="w-5 h-5 text-primary" />}
                  </div>
                  {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  {selectedPaymentMethodId === m.id && m.details && (
                    <div className="bg-muted/50 p-3 rounded-xl font-mono text-xs whitespace-pre-line text-foreground/90 border">
                      {m.details}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedPaymentMethod && (
              <Card className="p-5 space-y-4 border border-border/60 rounded-2xl">
                <h4 className="font-semibold text-sm">أدخل معلومات عملية الدفع</h4>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">اسم صاحب عملية الدفع *</Label>
                    <Input
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="الاسم الثلاثي أو اسم الحساب المرسل"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">رقم الهاتف المستخدم في الدفع *</Label>
                    <Input
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      placeholder="09xxxxxxxx"
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">رقم أو مرجع العملية (إن وجد)</Label>
                    <Input
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="رقم الحوالة أو مرجع التحويل"
                      className="rounded-xl font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">ملاحظة إضافية (اختياري)</Label>
                    <Textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="أي تفاصيل أخرى..."
                      className="rounded-xl h-20"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2.5">
                  {selectedPaymentMethod.whatsapp_number && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 rounded-xl border-emerald-500/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold gap-2"
                      onClick={openWhatsApp}
                    >
                      <MessageCircle className="w-5 h-5 text-emerald-600" /> إرسال الإشعار عبر واتساب
                    </Button>
                  )}

                  <Button
                    onClick={handleSendPaymentInfo}
                    disabled={submitting}
                    className="w-full h-12 rounded-xl font-bold shadow-sm gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    إرسال معلومات الدفع للمراجعة
                  </Button>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">اختر الباقة المناسبة</h3>
              {isLicensed && (
                <Button variant="outline" size="sm" onClick={() => setIsRenewal(!isRenewal)} className="text-xs rounded-xl">
                  {isRenewal ? "إلغاء وضع التجديد" : "تجديد الترخيص الحالي"}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {plans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={cn(
                    "relative p-5 rounded-2xl border cursor-pointer transition-all space-y-3",
                    selectedPlanId === p.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                      : "border-border/60 bg-card hover:border-primary/40"
                  )}
                >
                  {p.is_featured && (
                    <div className="absolute -top-3 right-4">
                      <Badge className="bg-amber-500 text-white font-bold gap-1 shadow-sm px-3 py-0.5">
                        <Star className="w-3 h-3 fill-white" /> عرض خاص
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-base">{p.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description || `${p.duration_days} يوم تفعيل`}</p>
                    </div>
                    <div className="text-left">
                      <span className="text-xl font-black text-primary">{Number(p.price).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1">{p.currency || "SYP"}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2.5">
                    <span>المدة: {p.duration_days >= 36500 ? "مدى الحياة" : `${p.duration_days} يوم`}</span>
                    <span>الأجهزة: {p.max_devices}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">ملاحظة للطلب (اختياري)</Label>
              <Input
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="أي ملاحظة أو استفسار للإدارة..."
                className="rounded-xl"
              />
            </div>

            <Button
              onClick={handleRequestActivation}
              disabled={submitting || !selectedPlanId}
              className="w-full h-12 font-bold rounded-xl shadow-sm text-base"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>طلب {isRenewal ? "التجديد" : "التفعيل"} الان</>
              )}
            </Button>
          </div>
        )}

        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => nav("/")} className="rounded-xl">
            <ArrowLeftFromLine className="w-4 h-4 ml-2" />
            {t("activation.backToApp")}
          </Button>
        </div>
      </div>
    </div>
  );
};

function renderStatusBanner(decision: ReturnType<typeof computeLicenseDecision> | null, license: LicenseInfo | null, remainingDays: number, isArabic: boolean, t: any) {
  if (!decision || !license) return null;

  const isTrialActive = decision.licenseStatus === "trial" && decision.canTransfer;
  const isTrialExpired = decision.licenseStatus === "trial" && !decision.canTransfer;
  const isActive = decision.licenseStatus === "active" && decision.canTransfer;
  const isPermanent = decision.licenseStatus === "permanent";

  if (isTrialActive) {
    if (license.trial_end === null) {
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
          {t("activation.trialRange", { start: formatDate(license.trial_start!), end: formatDate(license.trial_end!) })}
        </p>
      </div>
    );
  }
  if (isTrialExpired) return <StatusBanner type="error" icon={AlertTriangle} title={t("auth.trialExpired")} subtitle={t("activation.trialExpiredDesc")} />;
  if (isActive) return <StatusBanner type="success" icon={CheckCircle2} title={t("activation.activated")} subtitle={license.expiry_date ? `${t("auth.expiryDate")} ${formatDate(license.expiry_date)}` : t("activation.licenseActive")} />;
  if (isPermanent) return <StatusBanner type="success" icon={CheckCircle2} title={t("activation.permanent")} subtitle={t("activation.noExpiry")} />;
  if (decision.licenseStatus === "pending") return <StatusBanner type="warning" icon={Clock} title={t("activation.pendingReview")} subtitle={t("activation.pendingReviewDesc")} />;
  if (decision.licenseStatus === "rejected") return <StatusBanner type="error" icon={XCircle} title={t("activation.rejected")} subtitle={t("activation.rejectedDesc")} />;
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
          <p className="text-xs text-muted-foreground truncate" dir="ltr">{license.email}</p>
        </div>
      </div>

      {license.phone && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span dir="ltr">{license.phone}</span>
        </div>
      )}

      <div className="border-t border-border/60 pt-4 space-y-3">
        {license.expiry_date && <InfoRow label={t("auth.expiryDate")} value={formatDate(license.expiry_date)} />}
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

export default Activation;
