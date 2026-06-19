import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { signInWithEmail, signUpWithEmail, getCurrentUser, signOut, isAdminUser, sendPasswordReset } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Shield, ArrowRight, Crown, LogOut, Mail, Lock, User, Phone } from "lucide-react";
import { useAuthSession } from "@/lib/auth-session";

const Auth = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const isArabic = i18n.language === "ar";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const isResetMode = params.get("mode") === "reset";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<"bootstrap" | "migrate" | null>(null);
  const authSession = useAuthSession();

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

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      refresh();
      if (session?.user && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        nav(next, { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [nav, next]);

  const submit = async () => {
    if (!email || !password) {
      toast.error(t("common.required"));
      return;
    }
    if (mode === "signup" && !name.trim()) {
      toast.error(isArabic ? "الاسم مطلوب" : "Name is required");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await signUpWithEmail(email, password, name, phone);
        if (error) toast.error(error.message);
        else {
          const { data } = await supabase.auth.getSession();
          await refresh();
          if (data.session) {
            toast.success(isArabic ? "تم إنشاء الحساب" : "Account created");
            nav(next, { replace: true });
          } else {
            toast.success(isArabic ? "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب." : "Account created. Check your email to confirm it.");
          }
        }
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) toast.error(error.message);
        else {
          toast.success(isArabic ? "تم تسجيل الدخول" : "Signed in");
          await refresh();
          nav(next, { replace: true });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
    });
    if (r.error) toast.error(r.error.message || "OAuth failed");
    else if (!r.redirected) {
      await refresh();
      nav(next, { replace: true });
    }
  };

  const resetPassword = async () => {
    if (!email) {
      toast.error(t("auth.email"));
      return;
    }
    const { error } = await sendPasswordReset(email);
    if (error) toast.error(error.message);
    else toast.success(isArabic ? "تم إرسال رابط إعادة تعيين كلمة السر" : "Password reset link sent");
  };

  const updatePassword = async () => {
    if (!password || password.length < 6) {
      toast.error(isArabic ? "كلمة السر يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error(isArabic ? "كلمتا السر غير متطابقتين" : "Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isArabic ? "تم تحديث كلمة السر" : "Password updated");
      nav(next, { replace: true });
    }
  };

  const promote = async () => {
    setBusy("bootstrap");
    try {
      const { data, error } = await supabase.functions.invoke("admin-bootstrap", { body: {} });
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error || error?.message || "Failed");
      } else {
        toast.success(isArabic ? "تم منحك صلاحيات الإدارة ✨" : "You are now an admin ✨");
        await refresh();
        await authSession.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  if (isResetMode) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <Shield className="w-14 h-14 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">{isArabic ? "تعيين كلمة سر جديدة" : "Set a new password"}</h1>
            <p className="text-sm text-muted-foreground">{isArabic ? "أدخل كلمة السر الجديدة لحسابك" : "Enter your new account password"}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <Input type="password" placeholder={isArabic ? "كلمة السر الجديدة" : "New password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" dir="ltr" />
            <Input type="password" placeholder={isArabic ? "تأكيد كلمة السر" : "Confirm password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-11" dir="ltr" onKeyDown={(e) => e.key === "Enter" && updatePassword()} />
            <Button className="w-full h-11 font-bold" onClick={updatePassword} disabled={loading}>{loading ? t("common.loading") : (isArabic ? "تحديث كلمة السر" : "Update password")}</Button>
          </div>
        </div>
      </div>
    );
  }

  // Signed in: show profile shortcut + admin tools (only relevant ones)
  if (user) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <Shield className="w-14 h-14 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">{isArabic ? "تم تسجيل الدخول" : "Signed in"}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {isAdmin && (
              <span className="inline-block bg-amber-500/10 text-amber-600 text-xs px-3 py-1 rounded-full font-bold">
                <Crown className="w-3 h-3 inline mr-1" /> ADMIN
              </span>
            )}
          </div>

          <Button onClick={() => nav(next, { replace: true })} className="w-full h-11 font-bold">
            {isArabic ? "متابعة إلى التطبيق" : "Continue to app"} <ArrowRight className="w-4 h-4 ms-2" />
          </Button>

          {isAdmin && (
            <Button onClick={() => nav("/sys-panel")} variant="outline" className="w-full h-11">
              <Shield className="w-4 h-4 mr-2" /> {isArabic ? "لوحة الإدارة" : "Admin Panel"}
            </Button>
          )}

          {!isAdmin && (
            <Button onClick={promote} disabled={busy !== null} variant="ghost" className="w-full text-xs text-muted-foreground">
              <Crown className="w-3 h-3 mr-1" />
              {isArabic ? "ترقية الحساب لمسؤول (للمالك فقط)" : "Promote to admin (owner only)"}
            </Button>
          )}

          <Button variant="ghost" className="w-full" onClick={async () => { await signOut(); await refresh(); }}>
            <LogOut className="w-4 h-4 mr-2" /> {t("common.logout")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <Shield className="w-14 h-14 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">{mode === "signup" ? (isArabic ? "إنشاء حساب" : "Create account") : (isArabic ? "تسجيل الدخول" : "Sign in")}</h1>
        </div>

        {/* <Button variant="outline" className="w-full h-11" onClick={google}>
          {isArabic ? "متابعة بحساب Google" : "Continue with Google"}
        </Button>

        <div className="relative my-2 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <span className="relative bg-background px-2 text-xs text-muted-foreground">
            {isArabic ? "أو" : "or"}
          </span>
        </div> */}

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {mode === "signup" && (
            <>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={isArabic ? "الاسم الكامل" : "Full name"} value={name} onChange={(e) => setName(e.target.value)} className="h-11 ps-10" />
              </div>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={isArabic ? "رقم الهاتف" : "Phone"} value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 ps-10" dir="ltr" />
              </div>
            </>
          )}
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="email" placeholder={isArabic ? "البريد الإلكتروني" : "Email"} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 ps-10" dir="ltr" />
          </div>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder={isArabic ? "كلمة السر" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 ps-10" dir="ltr"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <Button className="w-full h-11 font-bold" onClick={submit} disabled={loading}>
            {loading ? t("common.loading") : (mode === "signup" ? (isArabic ? "إنشاء الحساب" : "Sign up") : (isArabic ? "تسجيل الدخول" : "Sign in"))}
          </Button>
          <button className="text-xs text-muted-foreground w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin"
              ? (isArabic ? "ليس لديك حساب؟ أنشئ واحداً" : "No account? Create one")
              : (isArabic ? "لديك حساب؟ سجّل الدخول" : "Have an account? Sign in")}
          </button>
          {mode === "signin" && (
            <button className="text-xs text-primary w-full" onClick={resetPassword} type="button">
              {isArabic ? "نسيت كلمة السر؟" : "Forgot password?"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
