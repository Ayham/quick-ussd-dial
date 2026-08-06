import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import type { UserNotification } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, refresh, markAllRead, markRead, toggleFavorite, dismiss, acknowledge } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleOpen = (notification: UserNotification) => {
    if (notification.action.type === "url" && notification.action.url) {
      window.open(notification.action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (notification.action.type === "screen" && notification.action.target) {
      navigate(notification.action.target);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        className="relative w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/25 transition-all active:scale-90 backdrop-blur-sm"
        aria-label={t("notifications.bellAria")}
      >
        <Bell className="w-5.5 h-5.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80dvh] p-0 flex flex-col rounded-t-3xl">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-base flex items-center gap-2">
              <Bell className="w-4.5 h-4.5 text-primary" />
              {t("notifications.title")}
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                  {unreadCount}
                </span>
              )}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => { markAllRead(); refresh(); }}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  {t("notifications.markAllRead")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg text-xs"
                onClick={() => { setOpen(false); navigate("/notifications"); }}
              >
                {t("notifications.viewAll")}
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-safe">
            {loading && notifications.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-2xl border border-border/60">
                    <Skeleton className="w-11 h-11 rounded-2xl" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <BellOff className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">{t("notifications.emptyTitle")}</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">{t("notifications.emptyDesc")}</p>
              </div>
            ) : (
              notifications.slice(0, 8).map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onOpen={handleOpen}
                  onToggleFavorite={(id) => toggleFavorite(id)}
                  onDismiss={(id) => dismiss(id)}
                  onAcknowledge={(id) => acknowledge(id)}
                />
              ))
            )}
          </div>

          {notifications.length > 8 && (
            <div className={cn("px-4 py-3 border-t border-border/60 pb-safe")}>
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl"
                onClick={() => { setOpen(false); navigate("/notifications"); }}
              >
                {t("notifications.viewAll")}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
