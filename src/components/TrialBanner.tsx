import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTrialRemainingDays } from "@/lib/license";
import { getCachedValidation } from "@/lib/license-cache";
import { cn } from "@/lib/utils";

const TrialBanner = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [warning, setWarning] = useState<{ show: boolean; days: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Fully local — reads the cached license verdict, never performs a network call.
  useEffect(() => {
    const check = () => {
      const cached = getCachedValidation();
      if (!cached) {
        setWarning(null);
        return;
      }
      if (cached.license_status !== "trial") {
        setWarning(null);
        return;
      }
      if (cached.account_status === "suspended" || cached.account_status === "blocked") {
        setWarning(null);
        return;
      }
      const days = getTrialRemainingDays(cached.trial_end ?? null);
      if (days > 0 && days <= 3) {
        setWarning({ show: true, days });
      } else {
        setWarning(null);
      }
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);

  if (!warning || !warning.show || dismissed) return null;

  const getMessage = () => {
    if (warning.days === 1) return t("trial.daysRemaining1");
    if (warning.days === 2) return t("trial.daysRemaining2");
    return t("trial.daysRemaining", { days: warning.days });
  };

  return (
    <div className={cn(
      "px-4 py-3 flex items-center gap-3 border-b",
      warning.days <= 1
        ? "bg-destructive/10 border-destructive/20 text-destructive"
        : "bg-warning/10 border-warning/20 text-warning",
    )}>
      {warning.days <= 1
        ? <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        : <Clock className="w-5 h-5 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{getMessage()}</p>
        <p className="text-xs opacity-80">
           {t("trial.activatePrompt")}
         </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-8 px-3 whitespace-nowrap rounded-lg"
          onClick={() => nav("/activation")}
        >
          {t("trial.activateButton")}
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-background/50 transition-smooth"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TrialBanner;
