import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { onDeviceBanned, onDeviceMismatch, registerDeviceLogin } from "@/lib/device";
import { validateDeviceSession } from "@/lib/license-cache";

export default function DeviceMismatchDialog() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [show, setShow] = useState(false);
  const [banned, setBanned] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onDeviceMismatch(() => {
      setBanned(false);
      setError(null);
      setShow(true);
    });
  }, []);

  useEffect(() => {
    return onDeviceBanned(() => {
      setBanned(true);
      setError(null);
      setShow(true);
    });
  }, []);

  const handleForceLogin = async () => {
    setResolving(true);
    setError(null);
    try {
      const result = await registerDeviceLogin(true);
      if (result.success) {
        await validateDeviceSession().catch(() => {});
        setShow(false);
      } else {
        setError(t("deviceMismatch.failed"));
      }
    } catch {
      setError(t("deviceMismatch.failed"));
    } finally {
      setResolving(false);
    }
  };

  const handleCancel = async () => {
    setResolving(true);
    await supabase.auth.signOut().catch(() => {});
    setShow(false);
    nav("/auth", { replace: true });
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6 safe-area-insets"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <Card className="w-full max-w-sm rounded-2xl p-8 shadow-card text-center space-y-5 animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-warning/10 mx-auto flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-warning" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">
            {banned ? t("deviceBanned.title") : t("deviceMismatch.title")}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {banned ? t("deviceBanned.description") : t("deviceMismatch.description")}
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-3 pt-2">
          {!banned && (
            <Button onClick={handleForceLogin} disabled={resolving} className="w-full h-12 font-bold rounded-xl">
              <LogOut className="w-4 h-4 mr-2" />
              {t("deviceMismatch.logoutOther")}
            </Button>
          )}

          <Button variant="ghost" className="w-full" onClick={handleCancel} disabled={resolving}>
            {t("common.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
