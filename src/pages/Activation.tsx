import { useState } from "react";
import { Copy, Key, Smartphone, CheckCircle, AlertTriangle, Clock, Shield, ShieldCheck, MessageCircle, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDeviceId } from "@/lib/device-id";
import { validateLicense, saveLicense, type AppLicenseStatus } from "@/lib/license";

interface ActivationProps {
  status: AppLicenseStatus;
  onActivated: () => void;
}

const Activation = ({ status, onActivated }: ActivationProps) => {
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const deviceId = getDeviceId();

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      toast.success("تم نسخ معرف الجهاز");
    } catch {
      const el = document.createElement("textarea");
      el.value = deviceId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("تم نسخ معرف الجهاز");
    }
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error("الرجاء إدخال مفتاح الترخيص");
      return;
    }
    setLoading(true);
    try {
      const result = await validateLicense(licenseKey.trim());
      if (result.valid) {
        saveLicense(licenseKey.trim());
        toast.success("تم تفعيل التطبيق بنجاح!");
        onActivated();
      } else {
        toast.error(result.error || "مفتاح الترخيص غير صالح");
      }
    } catch {
      toast.error("حدث خطأ أثناء التحقق");
    } finally {
      setLoading(false);
    }
  };

  const isExpired = status.status === 'trial_expired' || status.status === 'license_expired';
  const isTampered = status.status === 'clock_tampered';
  const isTrial = status.status === 'trial';
  const isLicensed = status.status === 'licensed';

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets" dir="rtl">
      <header className="bg-primary px-4 py-4 flex items-center gap-3 shadow-md pt-safe">
        <Shield className="w-6 h-6 text-primary-foreground" />
        <h1 className="text-primary-foreground text-xl font-bold">تفعيل التطبيق</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center gap-5">
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
              <h2 className="text-lg font-bold text-destructive">تم اكتشاف تلاعب بالتاريخ</h2>
              <p className="text-sm text-muted-foreground mt-2">
                يرجى ضبط تاريخ الجهاز بشكل صحيح وإعادة تشغيل التطبيق
              </p>
            </>
          ) : status.status === 'trial_expired' ? (
            <>
              <Clock className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">انتهت الفترة التجريبية</h2>
              <p className="text-sm text-muted-foreground mt-2">
                يرجى إدخال مفتاح الترخيص لمتابعة استخدام التطبيق
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-sm font-mono text-foreground font-bold" dir="ltr">0991214570</span>
                <a
                  href="https://wa.me/963991214570"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-green-500/15 text-green-600 hover:bg-green-500/25 transition-colors"
                >
                  <MessageCircle className="w-4.5 h-4.5" />
                </a>
                <a
                  href="tel:0991214570"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                >
                  <PhoneCall className="w-4.5 h-4.5" />
                </a>
              </div>
            </>
          ) : status.status === 'license_expired' ? (
            <>
              <AlertTriangle className="w-14 h-14 mx-auto mb-3 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">انتهت صلاحية الترخيص</h2>
              <p className="text-sm text-muted-foreground mt-2">
                يرجى تجديد الترخيص لمتابعة استخدام التطبيق
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-sm font-mono text-foreground font-bold" dir="ltr">0991214570</span>
                <a
                  href="https://wa.me/963991214570"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-green-500/15 text-green-600 hover:bg-green-500/25 transition-colors"
                >
                  <MessageCircle className="w-4.5 h-4.5" />
                </a>
                <a
                  href="tel:0991214570"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                >
                  <PhoneCall className="w-4.5 h-4.5" />
                </a>
              </div>
            </>
          ) : isLicensed ? (
            <>
              <ShieldCheck className="w-14 h-14 mx-auto mb-3 text-green-500" />
              <h2 className="text-lg font-bold text-foreground">التطبيق مفعّل</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {(status as { permanent?: boolean }).permanent ? (
                  <span className="font-bold text-green-500">ترخيص دائم ✨</span>
                ) : (
                  <>
                    ينتهي الترخيص بتاريخ {(status as { expiryDate: string }).expiryDate}
                    <br />
                    متبقي {(status as { daysLeft: number }).daysLeft} يوم
                  </>
                )}
              </p>
            </>
          ) : isTrial ? (
            <>
              <CheckCircle className="w-14 h-14 mx-auto mb-3 text-primary" />
              <h2 className="text-lg font-bold text-foreground">الفترة التجريبية</h2>
              <div className="mt-3">
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.max(5, ((status as { daysLeft: number }).daysLeft / 30) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  متبقي <span className="font-bold text-foreground">{(status as { daysLeft: number }).daysLeft}</span> يوم
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Device ID */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            معرف الجهاز
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
            أرسل هذا المعرف للمسؤول للحصول على مفتاح الترخيص
          </p>
        </div>

        {/* License Input */}
        {!isTampered && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key className="w-4 h-4" />
              مفتاح الترخيص
            </label>
            <Input
              placeholder="الصق مفتاح الترخيص هنا..."
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              className="text-left text-sm h-12 font-mono"
              dir="ltr"
            />
            <Button
              onClick={handleActivate}
              disabled={loading || !licenseKey.trim()}
              className="w-full h-12 text-lg font-bold rounded-xl"
            >
              {loading ? "جاري التحقق..." : "تفعيل"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Activation;
