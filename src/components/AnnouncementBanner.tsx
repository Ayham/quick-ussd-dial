import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Megaphone, X } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { NOTIFICATION_TYPE_META } from "@/lib/notifications/types";

export function AnnouncementBanner() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { notifications, markRead, dismiss } = useNotifications();
  const isArabic = i18n.language === "ar";

  const announcements = notifications.filter((n) => !n.is_read && (n.is_announcement || n.notification_type === "announcement"));
  const top = announcements[0];

  if (!top) return null;

  const meta = NOTIFICATION_TYPE_META[top.notification_type];
  const Icon = meta.icon;
  const title = isArabic ? top.title_ar || top.title_en : top.title_en || top.title_ar;
  const body = isArabic ? top.body_ar || top.body_en : top.body_en || top.body_ar;

  return (
    <div
      className="mx-4 mt-3 rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/[0.06] to-primary/[0.12] p-3.5 flex items-start gap-3 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={() => {
        markRead(top.id);
        if (top.action.type === "screen" && top.action.target) navigate(top.action.target);
        else navigate("/notifications");
      }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/15">
        {Icon ? <Icon className="w-4.5 h-4.5 text-primary" /> : <Megaphone className="w-4.5 h-4.5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-primary">{t("notifications.announcementLabel")}</p>
        <p className="text-sm font-semibold leading-snug mt-0.5 line-clamp-1">{title}</p>
        {body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{body}</p>}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(top.id);
        }}
        aria-label={t("notifications.dismissAria")}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
