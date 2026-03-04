import { useState } from "react";
import { Copy, Key, Smartphone, CheckCircle, AlertTriangle, Clock } from "lucide-react";
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
      // Fallback for environments without clipboard API
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

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <header className="bg-primary px-4 py-5 flex items-center gap-3 shadow-md">
        <Key className="w-6 h-6 text-primary-foreground" />
        <h1 className="text-primary-foreground text-xl font-bold">تفعيل التطبيق</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center">
        {/* Status Banner */}
        <div className={`rounded-xl p-4 mb-6 text-center ${
          isTampered 
            ? "bg-destructive/10 border border-destructive/30" 
            : isExpired 
              ? "bg-destructive/10 border border-destructive/20" 
              : "bg-primary/10 border border-primary/30"
        }`}>
          {isTampered ? (
            <>
              <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-destructive" />
              <h2 className="text-lg font-bold text-destructive">تم اكتشاف تلاعب بالتاريخ</h2>
              <p className="text-sm text-muted-foreground mt-1">
                يرجى ضبط تاريخ الجهاز بشكل صحيح وإعادة تشغيل التطبيق
              </p>
            </>
          ) : status.status === 'trial_expired' ? (
            <>
              <Clock className="w-12 h-12 mx-auto mb-2 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">انتهت الفترة التجريبية</h2>
              <p className="text-sm text-muted-foreground mt-1">
                يرجى إدخال مفتاح الترخيص لمتابعة استخدام التطبيق
              </p>
            </>
          ) : status.status === 'license_expired' ? (
            <>
              <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">انتهت صلاحية الترخيص</h2>
              <p className="text-sm text-muted-foreground mt-1">
                يرجى تجديد الترخيص لمتابعة استخدام التطبيق
              </p>
            </>
          ) : status.status === 'trial' ? (
            <>
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-primary" />
              <h2 className="text-lg font-bold text-foreground">الفترة التجريبية</h2>
              <p className="text-sm text-muted-foreground mt-1">
                متبقي {status.daysLeft} يوم من الفترة التجريبية المجانية
              </p>
            </>
          ) : null}
        </div>

        {/* Device ID */}
        <div className="space-y-2 mb-6">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            معرف الجهاز (Device ID)
          </label>
          <div className="flex gap-2">
            <Input
              value={deviceId}
              readOnly
              className="text-left text-xs h-10 font-mono flex-1"
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
          <p className="text-xs text-muted-foreground">
            أرسل هذا المعرف للمسؤول للحصول على مفتاح الترخيص
          </p>
        </div>

        {/* License Input */}
        {!isTampered && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key className="w-4 h-4" />
              مفتاح الترخيص (License Key)
            </label>
            <Input
              placeholder="أدخل مفتاح الترخيص هنا..."
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
