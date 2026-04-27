import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, ShieldCheck, Clock, AlertTriangle, Copy, Smartphone, Key,
  CreditCard, Share2, CheckCircle, QrCode, ChevronDown, ChevronUp,
  MessageCircle, PhoneCall
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDeviceId } from "@/lib/device-id";
import {
  getAppStatus, getSavedLicense, saveLicense, validateLicense,
  type AppLicenseStatus,
} from "@/lib/license";
import { getPaymentMethods, type PaymentMethod } from "@/lib/payment-config";
import { logActivity } from "@/lib/activity-logger";
import { QRCodeCanvas } from "qrcode.react";

const Subscription = () => {
  const [licenseStatus, setLicenseStatus] = useState<AppLicenseStatus | null>(null);
  const [newLicenseKey, setNewLicenseKey] = useState("");
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState("0991214570");
  const deviceId = getDeviceId();
  const qrRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  useEffect(() => {

    async function loadStatus(){
      const s = await getAppStatus();
      setLicenseStatus(s);
    }

    loadStatus();

  }, []);
  // useEffect(() => {
  //   getAppStatus().then(setLicenseStatus);
  //   setPaymentMethods(getPaymentMethods());
  //   const config = getAppConfig();
  //   if (config.supportPhone) setSupportPhone(config.supportPhone);
  //   logActivity('activation_page_access');
  // }, []);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`تم نسخ ${label}`);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success(`تم نسخ ${label}`);
    }
  };

  const handleActivateLicense = async () => {
    if (!newLicenseKey.trim()) {
      toast.error("الرجاء إدخال مفتاح الترخيص");
      return;
    }
    setLicenseLoading(true);
    try {
      const result = await validateLicense(newLicenseKey.trim());
      if (result.valid) {
        saveLicense(newLicenseKey.trim());
        toast.success("تم تفعيل الترخيص بنجاح!");
        setNewLicenseKey("");
        const s = await getAppStatus();
        setLicenseStatus(s);
      } else {
        toast.error(result.error || "مفتاح غير صالح");
      }
    } catch {
      toast.error("حدث خطأ أثناء التحقق");
    } finally {
      setLicenseLoading(false);
    }
  };

  const shareQrCode = useCallback(async (method: PaymentMethod) => {
    logActivity('qr_shared', { method: method.id });
    
    // Find the QR canvas
    const canvas = qrRefs.current[method.id];
    if (!canvas) {
      toast.error("تعذر إنشاء صورة QR");
      return;
    }

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to create blob');

      const file = new File([blob], `payment-${method.nameEn}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `دفع عبر ${method.name}`,
          text: `ادفع إلى الرقم: ${method.phone}\nعبر ${method.name}`,
          files: [file],
        });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payment-${method.nameEn}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("تم تنزيل صورة QR");
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error("تعذرت مشاركة QR");
      }
    }
  }, []);

  const getStatusConfig = (status: AppLicenseStatus) => {
    switch (status.status) {
      case 'licensed':
        return {
          icon: <ShieldCheck className="w-6 h-6 text-success" />,
          bg: 'bg-success/10 border-success/30',
          title: 'مفعّل',
          subtitle: status.permanent
            ? 'ترخيص دائم ✨'
            : `ينتهي: ${status.expiryDate} (${status.daysLeft} يوم)`,
        };
      case 'trial':
        return {
          icon: <Clock className="w-6 h-6 text-primary" />,
          bg: 'bg-primary/10 border-primary/30',
          title: 'فترة تجريبية',
          subtitle: `متبقي ${status.daysLeft} يوم`,
        };
      case 'trial_expired':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-destructive" />,
          bg: 'bg-destructive/10 border-destructive/30',
          title: 'انتهت الفترة التجريبية',
          subtitle: 'يرجى تفعيل الترخيص',
        };
      case 'license_expired':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-destructive" />,
          bg: 'bg-destructive/10 border-destructive/30',
          title: 'انتهى الترخيص',
          subtitle: 'يرجى تجديد الترخيص',
        };
      case 'clock_tampered':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-destructive" />,
          bg: 'bg-destructive/10 border-destructive/30',
          title: 'تلاعب بالتاريخ',
          subtitle: 'يرجى ضبط تاريخ الجهاز',
        };
    }
  };

  return (
    <AppLayout title="التفعيل والاشتراك" titleIcon={
      <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
        <Shield className="w-4.5 h-4.5 text-primary-foreground" />
      </div>
    }>
      <div className="flex-1 overflow-y-auto pb-safe" dir="rtl">
        <div className="p-4 space-y-4 max-w-lg mx-auto">

          {/* License Status Card */}
          {licenseStatus && (() => {
            const cfg = getStatusConfig(licenseStatus);
            return (
              <div className={`rounded-2xl border-2 p-4 ${cfg.bg}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-card/80 flex items-center justify-center shrink-0">
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-foreground">{cfg.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{cfg.subtitle}</p>
                  </div>
                </div>
                {licenseStatus.status === 'trial' && (
                  <div className="mt-3">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${Math.max(5, (licenseStatus.daysLeft / 30) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Device ID */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              معرف الجهاز
            </label>
            <div className="flex gap-2">
              <Input value={deviceId} readOnly className="text-left text-[11px] h-10 font-mono flex-1 bg-muted" dir="ltr" />
              <Button onClick={() => copyToClipboard(deviceId, 'معرف الجهاز')} variant="outline" size="icon" className="shrink-0 h-10 w-10">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              أرسل هذا المعرف للمسؤول للحصول على مفتاح الترخيص
            </p>
          </div>

          {/* License Key Input */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              {getSavedLicense() ? "تجديد الترخيص" : "تفعيل الترخيص"}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="الصق مفتاح الترخيص..."
                value={newLicenseKey}
                onChange={(e) => setNewLicenseKey(e.target.value)}
                className="text-left text-xs h-10 font-mono flex-1"
                dir="ltr"
              />
              <Button
                onClick={handleActivateLicense}
                disabled={licenseLoading || !newLicenseKey.trim()}
                size="sm"
                className="h-10 px-4 text-xs"
              >
                {licenseLoading ? "..." : "تفعيل"}
              </Button>
            </div>
          </div>

          {/* Support Contact */}
          <div className="flex items-center justify-center gap-3 py-2">
            <span className="text-xs text-muted-foreground">الدعم الفني:</span>
            <span className="text-sm font-mono text-foreground font-bold" dir="ltr">{supportPhone}</span>
            <a
              href={`https://wa.me/${supportPhone.replace(/^0/, "963")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success/15 text-success hover:bg-success/25 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
            <a
              href={`tel:${supportPhone}`}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
            >
              <PhoneCall className="w-4 h-4" />
            </a>
          </div>

          {/* Payment Methods Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">تجديد الاشتراك</h2>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              اختر وسيلة الدفع وأرسل المبلغ إلى الرقم المعروض. بعد التحقق من الدفع، سيتم تفعيل الترخيص تلقائياً.
            </p>

            {paymentMethods.map((method) => {
              const isExpanded = expandedPayment === method.id;
              return (
                <div key={method.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
                  {/* Header */}
                  <button
                    onClick={() => {
                      setExpandedPayment(isExpanded ? null : method.id);
                      if (!isExpanded) logActivity('payment_info_viewed', { method: method.id });
                    }}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-2xl">{method.icon}</span>
                    <div className="flex-1 text-right">
                      <p className="text-sm font-bold text-foreground">{method.name}</p>
                      <p className="text-[11px] text-muted-foreground">{method.nameEn}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4">
                      {/* Phone Number */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">رقم الدفع</label>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-muted rounded-xl px-4 py-3 text-center">
                            <span className="text-lg font-mono font-bold text-foreground tracking-wider" dir="ltr">
                              {method.phone}
                            </span>
                          </div>
                          <Button
                            onClick={() => copyToClipboard(method.phone, 'رقم الدفع')}
                            variant="outline"
                            size="icon"
                            className="shrink-0 h-12 w-12"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* QR Code */}
                      <div className="flex flex-col items-center gap-3">
                        <div className="bg-card p-3 rounded-xl border border-border">
                          <QRCodeCanvas
                            value={method.phone}
                            size={160}
                            level="M"
                            marginSize={2}
                            ref={(el: any) => {
                              if (el) {
                                // QRCodeCanvas renders a canvas element
                                const canvas = el instanceof HTMLCanvasElement ? el : el?.querySelector?.('canvas') || el;
                                qrRefs.current[method.id] = canvas;
                              }
                            }}
                          />
                        </div>
                        <Button
                          onClick={() => shareQrCode(method)}
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          مشاركة QR عبر واتساب
                        </Button>
                      </div>

                      {/* Instructions */}
                      <div className="bg-muted/50 rounded-xl p-3 space-y-2">
                        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-primary" />
                          طريقة الدفع:
                        </p>
                        <ol className="text-[11px] text-foreground space-y-1.5 pr-4 list-decimal list-inside">
                          <li>أرسل المبلغ عبر {method.name} إلى الرقم أعلاه</li>
                          <li>بعد إرسال المبلغ، انتظر تأكيد المسؤول</li>
                          <li>سيتم تحديث الترخيص تلقائياً عند الاتصال بالإنترنت</li>
                        </ol>
                        <p className="text-[10px] text-muted-foreground italic mt-1">
                          {method.instructions}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="h-6" />
        </div>
      </div>
    </AppLayout>
  );
};

export default Subscription;
