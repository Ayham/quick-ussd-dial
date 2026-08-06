import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  signInWithEmail, signUpWithEmail, signInWithGoogle, getCurrentUser, signOut,
  sendPasswordReset, validateEmail, validatePhone,
  validatePasswordStrength, validatePasswordsMatch,
} from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, ArrowRight, LogOut, Shield, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthSession } from "@/lib/auth-session";

type AuthMode = "signin" | "signup" | "forgot" | "reset" | "verify";

const Auth = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const isArabic = i18n.language === "ar";

  const modeParam = params.get("mode");
  const [mode, setMode] = useState<AuthMode>(modeParam === "reset" ? "reset" : modeParam === "verify" ? "verify" : "signin");
  const [verifyingCode, setVerifyingCode] = useState(Boolean(params.get("code")));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const authSession = useAuthSession();

  async function refreshUser() {
    const u = await getCurrentUser();
    setUser(u ? { id: u.id, email: u.email } : null);
  }

  useEffect(() => {
    refreshUser();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      refreshUser();
      if (session?.user && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        nav(next, { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [nav, next]);

  useEffect(() => {
    if (!verifyingCode) return;
    const timer = window.setTimeout(() => {
      getCurrentUser().then((u) => {
        if (u) {
          nav(next, { replace: true });
        } else {
          setVerifyingCode(false);
        }
      });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [verifyingCode, nav, next]);

  const clearErrors = () => setErrors({});

  const setError = (field: string, msg: string) => {
    setErrors((prev) => ({ ...prev, [field]: msg }));
  };

  const validateSignin = (): boolean => {
    clearErrors();
    let valid = true;
    const emailErr = validateEmail(email);
    if (emailErr) { setError("email", emailErr); valid = false; }
    const passErr = validatePasswordStrength(password);
    if (passErr) { setError("password", passErr); valid = false; }
    return valid;
  };

  const validateSignup = (): boolean => {
    clearErrors();
    let valid = true;
    const emailErr = validateEmail(email);
    if (emailErr) { setError("email", emailErr); valid = false; }
    const passErr = validatePasswordStrength(password);
    if (passErr) { setError("password", passErr); valid = false; }
    const matchErr = validatePasswordsMatch(password, confirmPassword);
    if (matchErr) { setError("confirm", matchErr); valid = false; }
    if (!name.trim()) { setError("name", t("auth.nameRequired")); valid = false; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setError("phone", phoneErr); valid = false; }
    return valid;
  };

  const handleSignIn = async () => {
    if (!validateSignin()) return;
    setLoading(true);
    try {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth.signedIn"));
      await refreshUser();
      await authSession.refresh();
      nav(next, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!validateSignup()) return;
    setLoading(true);
    try {
      const { error } = await signUpWithEmail(email, password, name, phone);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth.accountCreated"));
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error(t("auth.enterEmail"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await sendPasswordReset(email);
      if (error) toast.error(error.message);
      else {
        toast.success(t("auth.resetLinkSent"));
        setMode("signin");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const passErr = validatePasswordStrength(password);
    if (passErr) { setError("password", passErr); return; }
    const matchErr = validatePasswordsMatch(password, confirmPassword);
    if (matchErr) { setError("confirm", matchErr); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) toast.error(error.message);
      else {
        toast.success(t("auth.passwordUpdated"));
        nav(next, { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle(next);
      if (error) toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    await refreshUser();
    await authSession.refresh();
    setMode("signin");
  };

  if (user && mode !== "verify" && mode !== "reset") {
    return (
      <SignedInView t={t} isArabic={isArabic} next={next} user={user} nav={nav} handleLogout={handleLogout} />
    );
  }

  if (verifyingCode) {
    return <VerifyingView t={t} isArabic={isArabic} nav={nav} />;
  }

  if (mode === "verify") {
    return <VerifyView t={t} isArabic={isArabic} nav={nav} />;
  }

  if (mode === "reset") {
    return <ResetView isArabic={isArabic} password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} errors={errors} showPassword={showPassword} setShowPassword={setShowPassword} showConfirm={showConfirm} setShowConfirm={setShowConfirm} handleResetPassword={handleResetPassword} loading={loading} />;
  }

  if (mode === "signup") {
    return <SignUpView t={t} isArabic={isArabic} name={name} setName={setName} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} errors={errors} clearErrors={clearErrors} showPassword={showPassword} setShowPassword={setShowPassword} showConfirm={showConfirm} setShowConfirm={setShowConfirm} handleSignUp={handleSignUp} loading={loading} setMode={setMode} />;
  }

  if (mode === "forgot") {
    return <ForgotView t={t} isArabic={isArabic} email={email} setEmail={setEmail} handleForgotPassword={handleForgotPassword} loading={loading} setMode={setMode} />;
  }

  return <SignInView t={t} isArabic={isArabic} email={email} setEmail={setEmail} password={password} setPassword={setPassword} errors={errors} clearErrors={clearErrors} showPassword={showPassword} setShowPassword={setShowPassword} rememberSession={rememberSession} setRememberSession={setRememberSession} handleSignIn={handleSignIn} handleGoogleSignIn={handleGoogleSignIn} loading={loading} setMode={setMode} />;
};

// === View Components ===

function ViewWrapper({ children, isArabic }: { children: React.ReactNode; isArabic: boolean }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-muted/50 flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-sm animate-slide-up">
        {children}
      </div>
    </div>
  );
}

function CardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm">
      {children}
    </div>
  );
}

function InputIcon({ icon }: { icon: React.ReactNode }) {
  return <span className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground flex items-center justify-center">{icon}</span>;
}

function TogglePassword({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button type="button" className="absolute top-1/2 end-3 -translate-y-1/2 text-muted-foreground p-1 hover:text-foreground transition-colors" onClick={onClick}>
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

function LogoIcon({ icon, color = "primary" }: { icon: React.ReactNode; color?: string }) {
  return (
    <div className={`w-16 h-16 rounded-2xl bg-${color}/10 mx-auto flex items-center justify-center`}>
      {icon}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

// === Sign In ===
function SignInView({ t, isArabic, email, setEmail, password, setPassword, errors, clearErrors, showPassword, setShowPassword, rememberSession, setRememberSession, handleSignIn, handleGoogleSignIn, loading, setMode }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.welcomeBack")}</p>
      </div>
      <CardWrapper>
        <Button variant="outline" className="w-full h-12 rounded-xl font-medium" onClick={handleGoogleSignIn} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
          <span className="ms-2">{t("auth.signInGoogle")}</span>
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-muted-foreground">{t("auth.or")}</span>
          </div>
        </div>

        <div className="relative">
          <InputIcon icon={<Mail className="w-4 h-4" />} />
          <Input type="email"
            placeholder={t("auth.email")}
            value={email} onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.email ? "border-destructive" : ""}`} dir="ltr" />
          {errors.email && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
        </div>

        <div className="relative">
          <InputIcon icon={<Lock className="w-4 h-4" />} />
          <Input type={showPassword ? "text" : "password"}
            placeholder={t("auth.password")}
            value={password} onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.password ? "border-destructive" : ""}`} dir="ltr"
            onKeyDown={(e) => e.key === "Enter" && handleSignIn()} />
          <TogglePassword show={showPassword} onClick={() => setShowPassword(!showPassword)} />
          {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" checked={rememberSession} onCheckedChange={(v) => setRememberSession(v as boolean)} />
            <Label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">
              {t("auth.rememberSession")}
            </Label>
          </div>
          <button className="text-xs text-primary font-medium hover:underline"
            onClick={() => setMode("forgot")} type="button">
            {t("auth.forgotPassword")}
          </button>
        </div>

        <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleSignIn} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.signIn")}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-muted-foreground">{t("auth.or")}</span>
          </div>
        </div>

        <Button variant="outline" className="w-full h-12 rounded-xl font-medium"
          onClick={() => setMode("signup")}>
          <User className="w-4 h-4 mr-2" />
          {t("auth.createAccount")}
        </Button>
      </CardWrapper>
    </ViewWrapper>
  );
}

// === Sign Up ===
function SignUpView({ t, isArabic, name, setName, phone, setPhone, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, errors, clearErrors, showPassword, setShowPassword, showConfirm, setShowConfirm, handleSignUp, loading, setMode }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <User className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.signUpTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.signUpSubtitle")}</p>
      </div>
      <CardWrapper>
        <div className="relative">
          <InputIcon icon={<User className="w-4 h-4" />} />
          <Input placeholder={t("auth.fullName")}
            value={name} onChange={(e) => { setName(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.name ? "border-destructive" : ""}`} />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
        </div>

        <div className="relative">
          <InputIcon icon={<Phone className="w-4 h-4" />} />
          <Input placeholder={t("auth.phone")}
            value={phone} onChange={(e) => { setPhone(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.phone ? "border-destructive" : ""}`} dir="ltr" />
          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
        </div>

        <div className="relative">
          <InputIcon icon={<Mail className="w-4 h-4" />} />
          <Input type="email" placeholder={t("auth.email")}
            value={email} onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.email ? "border-destructive" : ""}`} dir="ltr" />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
        </div>

        <div className="relative">
          <InputIcon icon={<Lock className="w-4 h-4" />} />
          <Input type={showPassword ? "text" : "password"}
            placeholder={t("auth.password")}
            value={password} onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.password ? "border-destructive" : ""}`} dir="ltr" />
          <TogglePassword show={showPassword} onClick={() => setShowPassword(!showPassword)} />
          {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
        </div>

        <div className="relative">
          <InputIcon icon={<Lock className="w-4 h-4" />} />
          <Input type={showConfirm ? "text" : "password"}
            placeholder={t("auth.confirmPassword")}
            value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearErrors(); }}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.confirm ? "border-destructive" : ""}`} dir="ltr"
            onKeyDown={(e) => e.key === "Enter" && handleSignUp()} />
          <TogglePassword show={showConfirm} onClick={() => setShowConfirm(!showConfirm)} />
          {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
        </div>

        <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleSignUp} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.signUp")}
        </Button>

        <button className="text-xs text-muted-foreground w-full text-center hover:text-foreground transition-colors"
          onClick={() => { setMode("signin"); clearErrors(); }}>
          {t("auth.signInPrompt")}
        </button>
      </CardWrapper>
    </ViewWrapper>
  );
}

// === Forgot Password ===
function ForgotView({ t, isArabic, email, setEmail, handleForgotPassword, loading, setMode }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.forgotPassword")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.forgotPasswordDesc")}</p>
      </div>
      <CardWrapper>
        <div className="relative">
          <InputIcon icon={<Mail className="w-4 h-4" />} />
          <Input type="email" placeholder={t("auth.email")}
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-12 ps-10 rounded-xl bg-background/50" dir="ltr"
            onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()} />
        </div>
        <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleForgotPassword} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.sendResetLink")}
        </Button>
        <button className="text-xs text-primary w-full text-center font-medium hover:underline"
          onClick={() => { setMode("signin"); }}>
          {t("auth.rememberPassword")}
        </button>
      </CardWrapper>
    </ViewWrapper>
  );
}

// === Reset Password ===
function ResetView({ t, isArabic, password, setPassword, confirmPassword, setConfirmPassword, errors, showPassword, setShowPassword, showConfirm, setShowConfirm, handleResetPassword, loading }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.resetPassword")}</h1>
      </div>
      <CardWrapper>
        <div className="relative">
          <InputIcon icon={<Lock className="w-4 h-4" />} />
          <Input type={showPassword ? "text" : "password"}
            placeholder={t("auth.newPassword")}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.password ? "border-destructive" : ""}`} dir="ltr" />
          <TogglePassword show={showPassword} onClick={() => setShowPassword(!showPassword)} />
          {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
        </div>
        <div className="relative">
          <InputIcon icon={<Lock className="w-4 h-4" />} />
          <Input type={showConfirm ? "text" : "password"}
            placeholder={t("auth.confirmPassword")}
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            className={`h-12 ps-10 rounded-xl bg-background/50 ${errors.confirm ? "border-destructive" : ""}`} dir="ltr"
            onKeyDown={(e) => e.key === "Enter" && handleResetPassword()} />
          <TogglePassword show={showConfirm} onClick={() => setShowConfirm(!showConfirm)} />
          {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
        </div>
        <Button className="w-full h-12 font-bold rounded-xl shadow-sm" onClick={handleResetPassword} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.updatePassword")}
        </Button>
      </CardWrapper>
    </ViewWrapper>
  );
}

// === Verify ===
function VerifyView({ t, isArabic, nav }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center">
          <Mail className="w-8 h-8 text-warning" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.verifyEmail")}</h1>
        <p className="text-sm text-muted-foreground text-center">
          {t("auth.confirmationLink")}
        </p>
      </div>
      <Button onClick={() => { nav("/auth", { replace: true }); }} variant="outline" className="w-full h-12 rounded-xl">
        {t("auth.backToSignIn")}
      </Button>
    </ViewWrapper>
  );
}

// === Verifying (handling a PKCE code returned from Supabase) ===
function VerifyingView({ t, isArabic, nav }: any) {
  return (
    <ViewWrapper isArabic={isArabic}>
      <div className="flex flex-col items-center space-y-2 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <h1 className="text-2xl font-bold">{t("auth.verifyingEmail")}</h1>
        <p className="text-sm text-muted-foreground text-center">
          {t("auth.verifyingLink")}
        </p>
      </div>
      <Button onClick={() => { nav("/auth", { replace: true }); }} variant="ghost" className="w-full h-12 rounded-xl">
        {t("auth.backToSignIn")}
      </Button>
    </ViewWrapper>
  );
}

// === Signed In ===
function SignedInView({ t, isArabic, next, user, nav, handleLogout }: any) {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-sm space-y-5 animate-slide-up">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.signedIn")}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button onClick={() => nav(next, { replace: true })} className="w-full h-12 font-bold rounded-xl shadow-sm">
          {t("auth.continueToApp")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" /> {t("auth.signOut")}
        </Button>
      </div>
    </div>
  );
}

export default Auth;
