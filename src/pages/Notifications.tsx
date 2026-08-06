import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellOff, CheckCheck, Search, RefreshCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import type { NotificationFilter, UserNotification } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

const FILTERS: NotificationFilter[] = ["all", "unread", "announcements", "license", "account", "transfers"];

function matchesFilter(notification: UserNotification, filter: NotificationFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return !notification.is_read;
    case "announcements":
      return notification.is_announcement || notification.notification_type === "announcement";
    case "license":
      return [
        "license_expiring",
        "license_expired",
        "license_activated",
        "license_revoked",
        "trial_started",
        "trial_ended",
      ].includes(notification.notification_type);
    case "account":
      return [
        "account_suspended",
        "account_restored",
        "security_alert",
        "custom",
      ].includes(notification.notification_type);
    case "transfers":
      return notification.notification_type === "transfer_success" || notification.notification_type === "transfer_failure";
  }
}

const Notifications = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language === "ar";
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    toggleFavorite,
    dismiss,
    acknowledge,
  } = useNotifications();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (!matchesFilter(n, filter)) return false;
      if (!q) return true;
      const title = (isArabic ? n.title_ar : n.title_en).toLowerCase();
      const body = (isArabic ? n.body_ar : n.body_en).toLowerCase();
      return title.includes(q) || body.includes(q);
    });
  }, [notifications, filter, search, isArabic]);

  const handleOpen = (notification: UserNotification) => {
    markRead(notification.id);
    if (notification.action.type === "url" && notification.action.url) {
      window.open(notification.action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (notification.action.type === "screen" && notification.action.target) {
      navigate(notification.action.target);
    }
  };

  return (
    <AppLayout title={t("notifications.title")} hideNotificationsBell>
      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-8">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("notifications.search")}
              className="h-10 rounded-xl ps-9 bg-white border-border/60"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl border-border/60"
            onClick={() => refresh()}
            disabled={refreshing}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-border/60"
            onClick={() => markAllRead()}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            {t("notifications.markAllRead")}
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border",
                filter === f
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white border-border/60 text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`notifications.filter.${f}`)}
            </button>
          ))}
        </div>

        {error && (
          <div className="border border-destructive/20 bg-destructive/10 rounded-2xl p-3 text-sm text-destructive">
            {t("notifications.errorLoading")}
          </div>
        )}

        {loading && notifications.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-2xl border border-border/60">
                <Skeleton className="w-11 h-11 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
              <BellOff className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-semibold">{t("notifications.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground max-w-[260px]">{t("notifications.emptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onOpen={handleOpen}
                onToggleFavorite={(id) => toggleFavorite(id)}
                onDismiss={(id) => dismiss(id)}
                onAcknowledge={(id) => acknowledge(id)}
              />
            ))}
            {hasMore && (
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl"
                onClick={() => loadMore()}
                disabled={refreshing}
              >
                {refreshing ? t("common.loading") : t("notifications.loadMore")}
              </Button>
            )}
            {!hasMore && notifications.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground py-2">{t("notifications.noMore")}</p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Notifications;
