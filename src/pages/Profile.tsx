import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { User, LogOut, Globe, Mail, Phone as PhoneIcon } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, getProfile, updateProfile, signOut, type UserProfile } from "@/lib/auth";
import { setLanguage, getLanguage } from "@/lib/i18n";

const Profile = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
        if (p.language === "ar" || p.language === "en") setLang(p.language);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await updateProfile({ display_name: name, phone, language: lang });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setLanguage(lang);
      toast.success(isArabic ? "تم الحفظ" : "Saved");
    }
  };

  const doSignOut = async () => {
    await signOut();
    toast.success(isArabic ? "تم تسجيل الخروج" : "Signed out");
    nav("/auth");
  };

  if (loading) {
    return (
      <AppLayout title={isArabic ? "الملف الشخصي" : "Profile"}>
        <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={isArabic ? "الملف الشخصي" : "Profile"}>
      <div className="p-4 space-y-4 max-w-md mx-auto pb-8">
        <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold">{name || profile?.email || (isArabic ? "مستخدم" : "User")}</h2>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Mail className="w-3 h-3" /> {profile?.email}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4" /> {isArabic ? "الاسم" : "Name"}
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />

          <label className="text-sm font-semibold flex items-center gap-2 pt-2">
            <PhoneIcon className="w-4 h-4" /> {isArabic ? "الهاتف" : "Phone"}
          </label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" dir="ltr" />

          <label className="text-sm font-semibold flex items-center gap-2 pt-2">
            <Globe className="w-4 h-4" /> {isArabic ? "اللغة" : "Language"}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={lang === "ar" ? "default" : "outline"}
              onClick={() => setLang("ar")}
              className="h-10"
            >
              العربية
            </Button>
            <Button
              variant={lang === "en" ? "default" : "outline"}
              onClick={() => setLang("en")}
              className="h-10"
            >
              English
            </Button>
          </div>

          <Button onClick={save} disabled={saving} className="w-full h-11 mt-2 font-bold">
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </div>

        <Button variant="outline" className="w-full h-11 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={doSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> {t("common.logout")}
        </Button>
      </div>
    </AppLayout>
  );
};

export default Profile;
