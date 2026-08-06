import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getNotificationPreferences,
  setNotificationPreference,
} from "@/lib/notifications/service";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_META } from "@/lib/notifications/types";
import type { NotificationPreference, NotificationType } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

export function NotificationPreferences() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotificationPreference[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<NotificationType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getNotificationPreferences();
      setPrefs(items);
    } catch {
      setError(t("notifications.prefsError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const update = async (type: NotificationType, patch: Partial<NotificationPreference>) => {
    setBusy(type);
    const current = prefs?.find((p) => p.notification_type === type);
    const next: NotificationPreference = { ...(current ?? { notification_type: type, enabled: true, sound_enabled: true, vibration_enabled: true }), ...patch };
    setPrefs((prev) =>
      prev
        ? prev.map((p) => (p.notification_type === type ? next : p))
        : [...(prev ?? []), next],
    );
    try {
      await setNotificationPreference(type, {
        enabled: patch.enabled,
        sound_enabled: patch.sound_enabled,
        vibration_enabled: patch.vibration_enabled,
      });
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border border-border/60">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => load()}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {NOTIFICATION_TYPES.map((type) => {
        const meta = NOTIFICATION_TYPE_META[type];
        const Icon = meta.icon;
        const pref = prefs?.find((p) => p.notification_type === type);
        const enabled = pref?.enabled ?? true;
        return (
          <div
            key={type}
            className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-white"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
              <Icon className={cn("w-4.5 h-4.5", meta.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t(`notifications.type.${type}`)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{t("notifications.prefs.sound")}</span>
                <Switch
                  checked={pref?.sound_enabled ?? true}
                  onCheckedChange={(checked) => update(type, { sound_enabled: checked })}
                  disabled={busy === type || !enabled}
                  className="scale-90 origin-start"
                />
                <span>{t("notifications.prefs.vibrate")}</span>
                <Switch
                  checked={pref?.vibration_enabled ?? true}
                  onCheckedChange={(checked) => update(type, { vibration_enabled: checked })}
                  disabled={busy === type || !enabled}
                  className="scale-90 origin-start"
                />
              </p>
            </div>
            {busy === type ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
            ) : (
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => update(type, { enabled: checked })}
                aria-label={t(`notifications.type.${type}`)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
