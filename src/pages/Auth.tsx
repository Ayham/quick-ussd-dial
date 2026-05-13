import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { signInWithEmail, signUpWithEmail, getCurrentUser } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";
import { Shield, ArrowRight } from "lucide-react";

const Auth = () => {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { getCurrentUser().then((u) => { if (u) nav("/"); }); }, [nav]);

  const submit = async () => {
    if (!email || !password) { toast.error(t("common.required")); return; }
    setLoading(true);
    try {
      const fn = mode === "signup" ? signUpWithEmail : signInWithEmail;
      const { error } = await fn(email, password, name);
      if (error) toast.error(error.message);
      else { toast.success(t("common.success")); nav("/"); }
    } finally { setLoading(false); }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message || "OAuth failed");
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <Shield className="w-14 h-14 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">{t("auth.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <Button variant="outline" className="w-full h-11" onClick={google}>
          {t("auth.signInGoogle")}
        </Button>

        <div className="relative my-4 text-center">
          <span className="bg-background px-2 text-xs text-muted-foreground">— {t("common.continue")} —</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {mode === "signup" && (
            <Input placeholder={t("auth.displayName")} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          )}
          <Input type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" dir="ltr" />
          <Input type="password" placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" dir="ltr"
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <Button className="w-full h-11 font-bold" onClick={submit} disabled={loading}>
            {loading ? t("common.loading") : (mode === "signup" ? t("common.signup") : t("common.login"))}
          </Button>
          <button className="text-xs text-muted-foreground w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? t("auth.noAccount") : t("auth.hasAccount")}
          </button>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => nav("/")}>
          {t("auth.continueWithoutAccount")} <ArrowRight className="w-4 h-4 ms-2" />
        </Button>
      </div>
    </div>
  );
};

export default Auth;
