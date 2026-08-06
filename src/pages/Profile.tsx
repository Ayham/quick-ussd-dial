import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { User, LogOut, Globe, Mail, Phone as PhoneIcon, Save, Loader2, Store } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, getProfile, updateProfile, signOut, type UserProfile } from "@/lib/auth";
import { setLanguage, getLanguage } from "@/lib/i18n";
import { getBusinessName, saveBusinessName } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const Profile = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [lang, setLang] = useState<"ar" | "en">(getLanguage());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      if (!u) {
        nav("/auth?next=/profile");
        return;
      }
      const p = await getProfile();
      if (p) {
        setProfile(p);
        setName(p.display_name || "");
        setPhone(p.phone || "");
        setShopName(p.shop_name || getBusinessName());
        if (p.language === "ar" || p.language === "en") setLang(p.language);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await updateProfile({ display_name: name, phone, language: lang, shop_name: shopName });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      saveBusinessName(shopName);
      setLanguage(lang);
      toast.success(t("profile.saved"));
    }
  };

  const doSignOut = async () => {
    await signOut();
    toast.success(t("profile.signedOut"));
    nav("/auth");
  };

if (loading) {
	    return (
	      <AppLayout title={t("profile.title")}>
	        <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
	      </AppLayout>
	    );
	  }

  return (
    <AppLayout title={t("profile.title")}>
      <div className="p-4 space-y-4 max-w-md mx-auto pb-8">
        {/* Avatar Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-6 text-center space-y-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-[hsl(215_80%_48%)] mx-auto flex items-center justify-center shadow-lg shadow-primary/25">
            <User className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{name || profile?.email || t("profile.defaultName")}</h2>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-1">
              <Mail className="w-3.5 h-3.5" /> {profile?.email}
            </p>
          </div>
        </div>

        {/* Profile Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" /> {t("profile.name")}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-background/50" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <PhoneIcon className="w-4 h-4" /> {t("profile.phone")}
            </label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl bg-background/50" dir="ltr" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Store className="w-4 h-4" /> {t("profile.businessName")}
            </label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="h-11 rounded-xl bg-background/50" placeholder={t("profile.businessNamePlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Globe className="w-4 h-4" /> {t("profile.language")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={lang === "ar" ? "default" : "outline"}
                onClick={() => setLang("ar")}
                className={cn("h-10 rounded-xl", lang === "ar" && "shadow-sm")}
              >
                {t("profile.arabic")}
              </Button>
              <Button
                variant={lang === "en" ? "default" : "outline"}
                onClick={() => setLang("en")}
                className={cn("h-10 rounded-xl", lang === "en" && "shadow-sm")}
              >
                {t("profile.english")}
              </Button>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full h-11 mt-2 font-bold rounded-xl shadow-sm">
            {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </div>

        <Button variant="outline" className="w-full h-11 text-destructive border-destructive/30 hover:bg-destructive/10 rounded-xl" onClick={doSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> {t("common.logout")}
        </Button>
      </div>
    </AppLayout>
  );
};

export default Profile;
