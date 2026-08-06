import { useTranslation } from "react-i18next";
import { Bell, ChevronLeft, ChevronRight, Heart, Pin, X, CheckCircle2 } from "lucide-react";
import type { UserNotification } from "@/lib/notifications/types";
import { NOTIFICATION_TYPE_META, NOTIFICATION_PRIORITY_META } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NotificationCardProps {
  notification: UserNotification;
  onOpen?: (notification: UserNotification) => void;
  onToggleFavorite?: (notificationId: string) => void;
  onDismiss?: (notificationId: string) => void;
  onAcknowledge?: (notificationId: string) => void;
}

function formatRelativeTime(value: string, isArabic: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return isArabic ? "الآن" : "now";
  if (minutes < 60) return isArabic ? `منذ ${minutes} د` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isArabic ? `منذ ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return isArabic ? `منذ ${days} يوم` : `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return isArabic ? `منذ ${weeks} أسبوع` : `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return isArabic ? `منذ ${months} شهر` : `${months}mo ago`;
}

export function NotificationCard({
  notification,
  onOpen,
  onToggleFavorite,
  onDismiss,
  onAcknowledge,
}: NotificationCardProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const meta = NOTIFICATION_TYPE_META[notification.notification_type];
  const Icon = meta.icon;
  const priorityMeta = NOTIFICATION_PRIORITY_META[notification.priority];
  const title = isArabic ? notification.title_ar || notification.title_en : notification.title_en || notification.title_ar;
  const body = isArabic ? notification.body_ar || notification.body_en : notification.body_en || notification.body_ar;
  const isOpenable =
    notification.action.type === "screen" || notification.action.type === "url" || notification.action.type === "custom";

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-card p-4 transition-all",
        notification.is_read ? "border-border/60" : "border-primary/20 bg-primary/[0.03]",
        notification.is_pinned && "border-dashed",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", meta.bg)}>
          <Icon className={cn("w-5.5 h-5.5", meta.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold text-muted-foreground truncate">
                {t(`notifications.type.${notification.notification_type}`)}
              </span>
              {notification.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            </div>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
              <span className={cn("w-1.5 h-1.5 rounded-full", priorityMeta.dot)} />
              {formatRelativeTime(notification.sent_at || notification.created_at, isArabic)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => isOpenable && onOpen?.(notification)}
            className={cn("block w-full text-start", isOpenable ? "cursor-pointer" : "cursor-default")}
          >
            <h3 className="text-sm font-bold mt-1 leading-snug">{title}</h3>
            {body && <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed line-clamp-3 whitespace-pre-line">{body}</p>}
          </button>

          {notification.image_url && (
            <img
              src={notification.image_url}
              alt=""
              loading="lazy"
              className="mt-2.5 rounded-xl border border-border/60 w-full h-36 object-cover"
            />
          )}

          {!notification.is_read && (
            <span className="inline-block mt-2 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
              {t("notifications.newBadge")}
            </span>
          )}

          <div className="flex items-center gap-2 mt-3">
            {isOpenable && (
              <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => onOpen?.(notification)}>
                {t("notifications.viewAction")}
                {isArabic ? <ChevronLeft className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 ml-1" />}
              </Button>
            )}
            {notification.requires_acknowledgement && !notification.acknowledged_at && (
              <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => onAcknowledge?.(notification.id)}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {t("notifications.ackButton")}
              </Button>
            )}
            <div className="ms-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleFavorite?.(notification.id)}
                aria-label={t("notifications.favorite")}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  notification.is_favorite ? "text-rose-500 bg-rose-50" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Heart className={cn("w-4 h-4", notification.is_favorite && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={() => onDismiss?.(notification.id)}
                aria-label={t("notifications.dismissAria")}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationTypeFallbackIcon() {
  return <Bell className="w-5 h-5" />;
}
