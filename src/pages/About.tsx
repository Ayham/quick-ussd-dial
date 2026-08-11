import { useTranslation } from "react-i18next";
import { MessageCircle, Mail, Facebook, Info, Copyright, ExternalLink } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useContactSettings } from "@/hooks/use-contact-settings";
import { APP_VERSION } from "@/config/version";
import {
  buildWhatsAppUrl,
  buildEmailUrl,
  buildFacebookUrl,
} from "@/lib/contact-settings";
import { cn } from "@/lib/utils";

const About = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { settings } = useContactSettings();

  const channels = [
    {
      key: "whatsapp" as const,
      enabled: settings.whatsapp.enabled,
      url: buildWhatsAppUrl(settings),
      icon: MessageCircle,
      name: t("about.whatsapp"),
      detail: settings.whatsapp.number,
      accent: "bg-[#25D366]/10 text-[#1fb355]",
    },
    {
      key: "email" as const,
      enabled: settings.email.enabled,
      url: buildEmailUrl(settings),
      icon: Mail,
      name: t("about.email"),
      detail: settings.email.address,
      accent: "bg-primary/10 text-primary",
    },
    {
      key: "facebook" as const,
      enabled: settings.facebook.enabled,
      url: buildFacebookUrl(settings),
      icon: Facebook,
      name: t("about.facebook"),
      detail: "",
      accent: "bg-[#1877F2]/10 text-[#1877F2]",
    },
  ].filter((c) => c.enabled && c.url);

  return (
    <AppLayout title={t("about.title")}>
      <main className="flex-1 w-full max-w-lg mx-auto p-3 space-y-4 pb-8" dir={isArabic ? "rtl" : "ltr"}>
        {/* App identity */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-6 text-center space-y-3 animate-slide-up">
          <div className="w-24 h-24 rounded-3xl mx-auto overflow-hidden shadow-lg shadow-primary/20 ring-4 ring-primary/10 bg-white">
            <img src="/app-icon.png" alt={t("about.title")} className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{t("about.appName")}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-sm mx-auto">
              {t("about.appDescription")}
            </p>
          </div>
        </div>

        {/* App info */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 space-y-3 animate-slide-up">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Info className="w-4.5 h-4.5 text-primary" />
            {t("about.appInfo")}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-muted/50 border border-border/50 px-3.5 py-3">
              <span className="text-xs text-muted-foreground">{t("about.version")}</span>
              <span className="text-sm font-bold font-mono" dir="ltr">v{APP_VERSION}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 border border-border/50 px-3.5 py-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Copyright className="w-3.5 h-3.5" />
                {t("about.copyright")}
              </span>
              <span className="text-xs font-bold">{t("about.developer")}</span>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 space-y-3 animate-slide-up">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-4.5 h-4.5 text-primary" />
            {t("about.contactUs")}
          </h3>

          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-4 text-center border border-border/40">
              {t("about.noContactInfo")}
            </p>
          ) : (
            <div className="space-y-2.5">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <a
                    key={channel.key}
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "w-full flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all active:scale-[0.98] bg-white",
                      "border-border/60 shadow-sm hover:border-primary/40 hover:bg-muted/40",
                    )}
                    dir={isArabic ? "rtl" : "ltr"}
                  >
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", channel.accent)}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0 text-start">
                      <span className="block text-sm font-bold text-foreground">{channel.name}</span>
                      {channel.detail && (
                        <span className="block text-xs text-muted-foreground truncate mt-0.5" dir="ltr">
                          {channel.detail}
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
};

export default About;
