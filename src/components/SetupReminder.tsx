import { useTranslation } from "react-i18next";
import { Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetupSnapshot } from "@/lib/setup-wizard";

interface SetupReminderProps {
  snapshot: SetupSnapshot;
  onOpen: () => void;
  onDismiss: () => void;
}

export default function SetupReminder({ snapshot, onOpen, onDismiss }: SetupReminderProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  if (snapshot.requiredComplete) return null;

  const requiredRemaining = snapshot.requiredTotal - snapshot.requiredCompleted;
  const optionalRemaining = snapshot.optionalTotal - snapshot.optionalCompleted;

  let message: string;
  if (requiredRemaining > 0) {
    message = t("setupWizard.reminderRequired", { count: requiredRemaining });
  } else {
    message = t("setupWizard.reminderOptional");
  }

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="fixed top-3 left-3 right-3 z-[90] sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2 animate-slide-down"
      role="status"
    >
      <div className="flex items-center gap-3 p-3 rounded-2xl border border-border/60 bg-background/95 backdrop-blur shadow-xl">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Wand2 className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground">{t("setupWizard.reminderTitle")}</p>
          <p className="text-[11px] text-muted-foreground truncate">{message}</p>
        </div>
        <Button size="sm" onClick={onOpen} className="h-9 rounded-xl text-xs shrink-0">
          {t("setupWizard.completeNow")}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={t("setupWizard.dismiss")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
