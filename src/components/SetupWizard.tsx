import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, AlertCircle, Store, User, ShieldCheck, CheckCircle2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getCredentials, saveCredentials, getSimAssignment, saveSimAssignment, type Operator, type SimSlot, type OperatorCredentials, type SimAssignment, DEFAULT_CREDENTIALS } from "@/lib/ussd-profiles";
import { getBusinessName, saveBusinessName } from "@/lib/onboarding";
import { updateProfile, getProfile, type UserProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { computeSetupProgress, markWizardShown, addSkippedStep, type SetupStepId } from "@/lib/setup-wizard";

interface SetupWizardProps {
  onCompleted: () => void;
}

const STEPS: SetupStepId[] = ["sim", "business", "profile"];

export default function SetupWizard({ onCompleted }: SetupWizardProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [credentials, setCredentials] = useState<OperatorCredentials>(DEFAULT_CREDENTIALS);
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [businessName, setBusinessName] = useState(() => getBusinessName());
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const credentialsLoaded = useRef(false);

  useEffect(() => {
    getCredentials().then((c) => {
      credentialsLoaded.current = true;
      setCredentials(c);
    });
    getProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p?.display_name?.trim() || "");
        setPhone(p?.phone?.trim() || "");
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Debounced auto-save: SIM credentials
  useEffect(() => {
    if (!credentialsLoaded.current) return;
    const timer = setTimeout(() => {
      saveCredentials(credentials).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [credentials]);

  // Debounced auto-save: business name
  useEffect(() => {
    const timer = setTimeout(() => {
      if (businessName.trim()) saveBusinessName(businessName.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [businessName]);

  // Debounced auto-save: profile
  useEffect(() => {
    if (!ready) return;
    if (!fullName.trim() && !phone.trim()) return;
    const timer = setTimeout(() => {
      updateProfile({ display_name: fullName.trim(), phone: phone.trim() || undefined })
        .then(({ error }) => {
          if (error) {
            toast.error(t("setupWizard.profileSaveError", { error: error.message }));
          } else {
            toast.success(t("setupWizard.profileSaved"));
            getProfile()
              .then(setProfile)
              .catch(() => {});
          }
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [fullName, phone, ready, t]);

  const snapshot = computeSetupProgress(profile, credentials);
  const step = STEPS[stepIndex];
  const stepDef = snapshot.steps.find((s) => s.id === step)!;
  const isLast = stepIndex === STEPS.length - 1;

  const close = useCallback(() => {
    markWizardShown();
    onCompleted();
  }, [onCompleted]);

  const goTo = (index: number) => {
    setErrors({});
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, index)));
  };

  const validateStep = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (step === "sim") {
      if (!credentials.syriatelDistributor.trim()) nextErrors.distributor = t("setupWizard.distributorCodeError");
      if (!credentials.syriatelSerial.trim()) nextErrors.secretCode = t("setupWizard.secretCodeError");
      if (!credentials.mtnSecret.trim()) nextErrors.mtnSecret = t("setupWizard.mtnSecretCodeError");
    } else if (step === "business") {
      if (!businessName.trim()) nextErrors.businessName = t("setupWizard.businessNameRequired");
    } else if (step === "profile") {
      if (!fullName.trim()) nextErrors.name = t("setupWizard.nameRequired");
      if (!phone.trim()) nextErrors.phone = t("setupWizard.phoneRequired");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (step === "sim") saveSimAssignment(simAssignment);
    if (!validateStep()) return;
    if (isLast) {
      setDone(true);
      return;
    }
    goTo(stepIndex + 1);
  };

  const handleSkip = () => {
    addSkippedStep(step);
    if (isLast) {
      setDone(true);
      return;
    }
    goTo(stepIndex + 1);
  };

  const handleSaveSimAssignment = (next: SimAssignment) => {
    setSimAssignment(next);
    saveSimAssignment(next);
  };

  const finish = () => {
    saveSimAssignment(simAssignment);
    close();
  };

  const progress = done ? 100 : snapshot.overallProgress;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" dir={isArabic ? "rtl" : "ltr"}>
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[hsl(var(--primary-deep-1))] via-[hsl(var(--primary-deep-2))] to-[hsl(var(--primary-deep-3))]">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-5 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center shadow-xl backdrop-blur">
              <Wand2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-white">{done ? t("setupWizard.completionTitle") : t("setupWizard.welcomeTitle")}</h1>
            <p className="mt-1 text-sm text-white/70">{done ? t("setupWizard.completionDesc") : t("setupWizard.welcomeDesc")}</p>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            {done ? (
              <div className="p-8 flex flex-col items-center text-center animate-fade-in">
                <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{t("setupWizard.stepProgress", { progress: 100 })}</p>
                <Button onClick={finish} className="w-full h-12 font-bold rounded-xl shadow-lg mt-6">
                  {t("setupWizard.finish")}
                </Button>
              </div>
            ) : (
              <>
                <div className="px-6 pt-5 pb-4 border-b border-border/60">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-foreground">{t("setupWizard.stepTitle")}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{t("setupWizard.stepProgress", { progress })}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {STEPS.map((id, i) => {
                      const def = snapshot.steps.find((s) => s.id === id)!;
                      const active = i <= stepIndex;
                      return (
                        <div
                          key={id}
                          className={cn(
                            "h-1.5 flex-1 rounded-full transition-all duration-300",
                            def.completed
                              ? "bg-gradient-to-l from-primary to-[hsl(var(--primary-end))]"
                              : active
                                ? "bg-primary/30"
                                : "bg-muted",
                          )}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{t(stepDef.title)}</p>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          stepDef.required ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {stepDef.required ? t("setupWizard.requiredBadge") : t("setupWizard.optionalBadge")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground text-end">{t(stepDef.description)}</p>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {step === "sim" && (
                    <SimStep
                      credentials={credentials}
                      simAssignment={simAssignment}
                      onCredentialsChange={setCredentials}
                      onSimAssignmentChange={handleSaveSimAssignment}
                      errors={errors}
                    />
                  )}

                  {step === "business" && (
                    <div className="space-y-5 animate-fade-in">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <Store className="w-7 h-7" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-bold text-foreground">{t("setupWizard.businessNameLabel")}</Label>
                        <Input
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder={t("setupWizard.businessNamePlaceholder")}
                          className={cn("h-12 rounded-xl text-base bg-background/50", errors.businessName && "border-destructive")}
                          autoFocus
                        />
                        {errors.businessName && (
                          <p className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="w-3.5 h-3.5" /> {errors.businessName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">{t("setupWizard.businessNameHint")}</p>
                      </div>
                    </div>
                  )}

                  {step === "profile" && (
                    <div className="space-y-5 animate-fade-in">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <User className="w-7 h-7" />
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-bold text-foreground">{t("setupWizard.fullNameLabel")}</Label>
                          <Input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t("setupWizard.fullNamePlaceholder")}
                            className={cn("h-12 rounded-xl text-base bg-background/50", errors.name && "border-destructive")}
                            autoFocus
                          />
                          {errors.name && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="w-3.5 h-3.5" /> {errors.name}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-bold text-foreground">{t("setupWizard.phoneLabel")}</Label>
                          <Input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder={t("setupWizard.phonePlaceholder")}
                            className={cn("h-12 rounded-xl text-base bg-background/50", errors.phone && "border-destructive")}
                            dir="ltr"
                            inputMode="tel"
                          />
                          {errors.phone && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="w-3.5 h-3.5" /> {errors.phone}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t("setupWizard.profileHint")}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {stepIndex > 0 && (
                      <Button variant="outline" onClick={() => goTo(stepIndex - 1)} className="h-12 rounded-xl">
                        <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                        {t("setupWizard.back")}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={handleSkip} className="h-12 rounded-xl text-muted-foreground">
                      {t("setupWizard.skip")}
                    </Button>
                    <div className="flex-1" />
                    <Button onClick={handleNext} className="h-12 rounded-xl shadow-lg px-6">
                      <Check className="w-5 h-5 me-2 rtl:rotate-0" />
                      {isLast ? t("setupWizard.finish") : t("setupWizard.next")}
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={close}
                    className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 py-1"
                  >
                    {t("setupWizard.later")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SimStep({
  credentials,
  simAssignment,
  onCredentialsChange,
  onSimAssignmentChange,
  errors,
}: {
  credentials: OperatorCredentials;
  simAssignment: SimAssignment;
  onCredentialsChange: (c: OperatorCredentials) => void;
  onSimAssignmentChange: (a: SimAssignment) => void;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <p className="text-sm font-bold text-foreground">{t("setupWizard.simRequired")}</p>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">{t("setupWizard.simDesc")}</p>

      <div className="space-y-4">
        <SimField
          label={t("setupWizard.distributorLabel")}
          value={credentials.syriatelDistributor}
          placeholder={t("setupWizard.distributorPlaceholder")}
          onChange={(v) => onCredentialsChange({ ...credentials, syriatelDistributor: v })}
          error={errors.distributor}
        />
        <SimField
          label={t("setupWizard.secretLabel")}
          value={credentials.syriatelSerial}
          placeholder={t("setupWizard.secretPlaceholder")}
          onChange={(v) => onCredentialsChange({ ...credentials, syriatelSerial: v })}
          error={errors.secretCode}
        />
        <SimSlotPicker
          operator="syriatel"
          value={simAssignment.syriatel}
          onChange={(slot) => onSimAssignmentChange({ ...simAssignment, syriatel: slot })}
        />
        <SimField
          label={t("setupWizard.mtnSecretLabel")}
          value={credentials.mtnSecret}
          placeholder={t("setupWizard.mtnSecretPlaceholder")}
          onChange={(v) => onCredentialsChange({ ...credentials, mtnSecret: v })}
          error={errors.mtnSecret}
        />
        <SimSlotPicker
          operator="mtn"
          value={simAssignment.mtn}
          onChange={(slot) => onSimAssignmentChange({ ...simAssignment, mtn: slot })}
        />
      </div>
    </div>
  );
}

const SimField = ({ label, value, placeholder, onChange, error }: { label: string; value: string; placeholder: string; onChange: (v: string) => void; error?: string }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-bold text-foreground">{label}</Label>
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-12 rounded-xl bg-background/50", error && "border-destructive")}
      dir="ltr"
      inputMode="numeric"
    />
    {error && (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="w-3.5 h-3.5" /> {error}
      </p>
    )}
  </div>
);

const SimSlotPicker = ({ operator, value, onChange }: { operator: Operator; value: SimSlot; onChange: (slot: SimSlot) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-foreground">{t("setupWizard.simSlotLabel", { operator: operator === "mtn" ? t("setupWizard.mtn") : t("setupWizard.syriatel") })}</Label>
      <RadioGroup
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) as SimSlot)}
        className="flex gap-3"
        dir="ltr"
      >
        {([0, 1] as SimSlot[]).map((slot) => (
          <div
            key={slot}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-4 py-3 flex-1 border-2 transition-all cursor-pointer",
              value === slot
                ? operator === "mtn"
                  ? "bg-operator-mtn/10 border-operator-mtn/30"
                  : "bg-operator-syriatel/10 border-operator-syriatel/30"
                : "bg-muted/30 border-border hover:border-primary/30",
            )}
          >
            <RadioGroupItem value={String(slot)} id={`${operator}-sim-${slot}`} className={operator === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"} />
            <Label htmlFor={`${operator}-sim-${slot}`} className="text-sm font-bold cursor-pointer">
              {t("setupWizard.simSlot", { slot: slot + 1 })}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
};
