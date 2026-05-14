import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { signInWithEmail, signUpWithEmail, getCurrentUser, signOut, isAdminUser } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Shield, ArrowRight, Crown, Database, LogOut } from "lucide-react";

const Auth = () => {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<"bootstrap" | "migrate" | null>(null);

  async function refresh() {
    const u = await getCurrentUser();
    if (u) {
      setUser({ id: u.id, email: u.email });
      setIsAdmin(await isAdminUser());
    } else {
      setUser(null);
      setIsAdmin(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const submit = async () => {
    if (!email || !password) { toast.error(t("common.required")); return; }
    setLoading(true);
    try {
      const fn = mode === "signup" ? signUpWithEmail : signInWithEmail;
      const { error } = await fn(email, password, name);
      if (error) toast.error(error.message);
      else { toast.success(t("common.success")); await refresh(); }
    } finally { setLoading(false); }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message || "OAuth failed");
  };

  const promote = async () => {
    setBusy("bootstrap");
    try {
      const { data, error } = await supabase.functions.invoke("admin-bootstrap", { body: {} });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Failed");
      } else {
        toast.success("You are now an admin ✨");
        await refresh();
      }
    } finally { setBusy(null); }
  };

  const migrate = async () => {
    setBusy("migrate");
    try {
      const { data, error } = await supabase.functions.invoke("migrate-from-sheets", { body: {} });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Migration failed");
      } else {
        toast.success("Migration finished — see admin → Events");
        console.log("Migration summary:", (data as any)?.summary);
      }
    } finally { setBusy(null); }
  };

  // Signed in: show admin tools
  if (user) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <Shield className="w-14 h-14 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">{t("common.success")}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {isAdmin && (
              <span className="inline-block bg-primary/10 text-primary text-xs px-3 py-1 rounded-full font-bold">
                <Crown className="w-3 h-3 inline mr-1" /> ADMIN
              </span>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <Button onClick={promote} disabled={busy !== null} className="w-full h-11 font-bold">
              <Crown className="w-4 h-4 mr-2" />
              {isAdmin ? "Re-confirm admin" : "Make me admin"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              First user to click this becomes admin. After that, only existing admins can promote others.
            </p>

            {isAdmin && (
              <>
                <Button onClick={migrate} disabled={busy !== null} variant="outline" className="w-full h-11">
                  <Database className="w-4 h-4 mr-2" />
                  {busy === "migrate" ? "Migrating..." : "Run Google Sheets Migration"}
                </Button>
                <Button onClick={() => nav("/sys-panel")} variant="outline" className="w-full h-11">
                  <Shield className="w-4 h-4 mr-2" />
                  Open Admin Panel
                </Button>
              </>
            )}
          </div>

          <Button variant="ghost" className="w-full" onClick={async () => { await signOut(); await refresh(); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => nav("/")}>
            Continue to app <ArrowRight className="w-4 h-4 ms-2" />
          </Button>
        </div>
      </div>
    );
  }

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
