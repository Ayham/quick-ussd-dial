import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Mail, Facebook, Save, RefreshCw, Loader2, Clock, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  EMPTY_CONTACT_SETTINGS,
  fetchContactSettingsLive,
  adminUpdateContactSettings,
  type ContactSettings,
} from "@/lib/contact-settings";

function formatUpdatedAt(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

const ContactSettingsAdmin = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ContactSettings>(() => ({ ...EMPTY_CONTACT_SETTINGS }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchContactSettingsLive();
      setSettings(next);
      setLoaded(true);
    } catch {
      setSettings({ ...EMPTY_CONTACT_SETTINGS });
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await adminUpdateContactSettings(settings);
      if (!result.ok) throw new Error("not_ok");
      setSettings((prev) => ({ ...prev, updatedAt: result.updatedAt }));
      toast.success(t("contactSettingsAdmin.saved"));
    } catch {
      toast.error(t("contactSettingsAdmin.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const row = (channel: React.ReactNode, content: React.ReactNode) => (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">{channel}</div>
      {content}
    </div>
  );

  return (
    <div className="space-y-5 relative">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          {t("admin.contactSettings")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("contactSettingsAdmin.desc")}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {t("contactSettingsAdmin.lastUpdated")}:{" "}
          <span className="font-mono font-bold text-foreground">{formatUpdatedAt(settings.updatedAt)}</span>
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          {t("contactSettingsAdmin.cacheNote")}
        </span>
      </div>

      <div className="space-y-4">
        {/* WhatsApp */}
        {row(
          <>
            <span className="inline-flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-[#25D366]/10 text-[#1fb355] flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </span>
              <span className="text-sm font-bold text-foreground">{t("about.whatsapp")}</span>
            </span>
            <Switch
              checked={settings.whatsapp.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, whatsapp: { ...settings.whatsapp, enabled: v } })}
              aria-label={t("contactSettingsAdmin.whatsappEnabled")}
            />
          </>,
          <>
            <div className="space-y-1.5">
              <Label htmlFor="wa-number" className="text-xs text-muted-foreground">
                {t("contactSettingsAdmin.whatsappNumber")}
              </Label>
              <Input
                id="wa-number"
                value={settings.whatsapp.number}
                onChange={(e) => setSettings({ ...settings, whatsapp: { ...settings.whatsapp, number: e.target.value } })}
                className="font-mono text-sm"
                dir="ltr"
                placeholder="+9639XXXXXXXX"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-url" className="text-xs text-muted-foreground">
                {t("contactSettingsAdmin.whatsappUrl")}
              </Label>
              <Input
                id="wa-url"
                value={settings.whatsapp.url}
                onChange={(e) => setSettings({ ...settings, whatsapp: { ...settings.whatsapp, url: e.target.value } })}
                className="font-mono text-sm"
                dir="ltr"
                placeholder="https://wa.me/9639XXXXXXXX"
              />
              <p className="text-[10px] text-muted-foreground">{t("contactSettingsAdmin.whatsappUrlHint")}</p>
            </div>
          </>,
        )}

        {/* Email */}
        {row(
          <>
            <span className="inline-flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </span>
              <span className="text-sm font-bold text-foreground">{t("about.email")}</span>
            </span>
            <Switch
              checked={settings.email.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, email: { ...settings.email, enabled: v } })}
              aria-label={t("contactSettingsAdmin.emailEnabled")}
            />
          </>,
          <div className="space-y-1.5">
            <Label htmlFor="em-address" className="text-xs text-muted-foreground">
              {t("contactSettingsAdmin.emailAddress")}
            </Label>
            <Input
              id="em-address"
              type="email"
              value={settings.email.address}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, address: e.target.value } })}
              className="font-mono text-sm"
              dir="ltr"
              placeholder="support@raseed.app"
            />
          </div>,
        )}

        {/* Facebook */}
        {row(
          <>
            <span className="inline-flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center">
                <Facebook className="w-5 h-5" />
              </span>
              <span className="text-sm font-bold text-foreground">{t("about.facebook")}</span>
            </span>
            <Switch
              checked={settings.facebook.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, facebook: { ...settings.facebook, enabled: v } })}
              aria-label={t("contactSettingsAdmin.facebookEnabled")}
            />
          </>,
          <div className="space-y-1.5">
            <Label htmlFor="fb-url" className="text-xs text-muted-foreground">
              {t("contactSettingsAdmin.facebookUrl")}
            </Label>
            <Input
              id="fb-url"
              value={settings.facebook.url}
              onChange={(e) => setSettings({ ...settings, facebook: { ...settings.facebook, url: e.target.value } })}
              className="font-mono text-sm"
              dir="ltr"
              placeholder="https://www.facebook.com/raseed"
            />
          </div>,
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={save} disabled={saving || !loaded}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t("common.save")}
        </Button>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
          {t("adminUpdates.reload")}
        </Button>
      </div>

      <p className={cn("text-xs text-muted-foreground")}>
        {t("contactSettingsAdmin.securityNote")}
      </p>

      {loading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm grid place-items-center rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
};

export default ContactSettingsAdmin;
