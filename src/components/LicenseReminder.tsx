import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, RefreshCw, X, AlertTriangle } from "lucide-react";
import { getValidationReminder, type ValidationReminder } from "@/lib/license-cache";
import { cn } from "@/lib/utils";

const REMINDER_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DISMISS_KEY = "app_license_reminder_dismissed_at";

/**
 * Friendly, NON-BLOCKING reminder shown only in the final window before
 * expiration (or after the offline grace period) when the app is offline or
 * validation is due. It never gates the UI and never blocks any workflow.
 */
const LicenseReminder = () => {
  const { t } = useTranslation();
  const [reminder, setReminder] = useState<ValidationReminder>({ show: false, blocked: false, days: null });
  const [dismissedAt, setDismissedAt] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const check = () => setReminder(getValidationReminder());
    check();
    const interval = window.setInterval(check, REMINDER_CHECK_INTERVAL_MS);
    const onOnline = () => check();
    window.addEventListener("online", onOnline);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!reminder.show) return null;
  if (reminder.blocked) {
    if (Date.now() - dismissedAt < 24 * 60 * 60 * 1000) return null;
  } else if (reminder.days !== null && reminder.days <= 3) {
    if (Date.now() - dismissedAt < 24 * 60 * 60 * 1000) return null;
  }

  const dismiss = () => {
    const now = Date.now();
    setDismissedAt(now);
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {}
  };

  return (
    <div
      className={cn(
        "px-4 py-2.5 pt-safe flex items-center gap-2 border-b",
        reminder.blocked
          ? "bg-destructive/10 border-destructive/20 text-destructive"
          : "bg-warning/10 border-warning/20 text-warning",
      )}
    >
      {reminder.blocked ? (
        <WifiOff className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      )}
      <p className="flex-1 min-w-0 text-xs font-medium truncate">
        {reminder.blocked ? t("offlineReminder.blockedTitle") : t("offlineReminder.title")}
      </p>
      {!reminder.blocked && (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            dismiss();
            window.dispatchEvent(new Event("online"));
          }}
          className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("offlineReminder.connect")}
        </a>
      )}
      <button
        onClick={dismiss}
        aria-label={t("notifications.dismissAria")}
        className="p-1 rounded-lg hover:bg-background/50 transition-smooth"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default LicenseReminder;
