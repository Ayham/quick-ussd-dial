import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, Eye, EyeOff, Store, User, ShieldCheck, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getCredentials, saveCredentials, getSimAssignment, saveSimAssignment, type Operator, type SimSlot, type OperatorCredentials, type SimAssignment } from "@/lib/ussd-profiles";
import { saveBusinessName, skipBusinessName, skipProfile, clearProfileSkip } from "@/lib/onboarding";
import { updateProfile, type UserProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

interface OnboardingWizardProps {
  initialStep?: Step;
  businessNeeded: boolean;
  profileNeeded: boolean;
  profile: UserProfile | null;
  onCompleted: () => void;
}

export default function OnboardingWizard({ initialStep = 1, businessNeeded, profileNeeded, profile, onCompleted }: OnboardingWizardProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>(initialStep);
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [activeTab, setActiveTab] = useState<Operator>("syriatel");
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileReady, setProfileReady] = useState(!profile);

  useEffect(() => {
    if (profile) {
      setFullName(profile.display_name || "");
      setPhone(profile.phone || "");
    }
    setProfileReady(true);
  }, [profile]);

  const toggleShow = (key: string) => setShowFields((s) => ({ ...s, [key]: !s[key] }));

  const handleStep1Continue = () => {
    if (!credentials.syriatelDistributor.trim()) {
      toast.error(t("onboarding.distributorCodeError"));
      return;
    }
    if (!credentials.syriatelSerial.trim()) {
      toast.error(t("onboarding.secretCodeError"));
      return;
    }
    if (!credentials.mtnSecret.trim()) {
      toast.error(t("onboarding.mtnSecretCodeError"));
      return;
    }
    saveCredentials(credentials);
    saveSimAssignment(simAssignment);
    toast.success(t("onboarding.simSaved"));
    if (businessNeeded) {
      setStep(2);
    } else if (profileNeeded) {
      setStep(3);
    } else {
      onCompleted();
    }
  };

  const syncShopNameToProfile = async (name: string) => {
    try {
      await updateProfile({ shop_name: name });
    } catch {
      /* offline / not critical */
    }
  };

  const handleStep2Save = () => {
    if (!businessName.trim()) {
      toast.error(t("onboarding.businessNameRequired"));
      return;
    }
    saveBusinessName(businessName);
    syncShopNameToProfile(businessName.trim());
    toast.success(t("onboarding.businessNameSaved"));
    if (profileNeeded) {
      setStep(3);
    } else {
      onCompleted();
    }
  };

  const handleStep2Later = () => {
    skipBusinessName();
    if (profileNeeded) {
      setStep(3);
    } else {
      onCompleted();
    }
  };

  const handleStep3Save = async () => {
    if (!fullName.trim()) {
      toast.error(t("onboarding.nameRequired"));
      return;
    }
    const { error } = await updateProfile({ display_name: fullName, phone: phone.trim() || undefined });
    if (error) {
      toast.error(t("onboarding.profileSaveError", { error: error.message }));
      return;
    }
    clearProfileSkip();
    toast.success(t("onboarding.profileSaved"));
    onCompleted();
  };

  const handleStep3Later = () => {
    skipProfile();
    onCompleted();
  };

  const stepTitles: Record<Step, string> = {
    1: t("onboarding.step1Title"),
    2: t("onboarding.step2Title"),
    3: t("onboarding.step3Title"),
  };

  const stepDescriptions: Record<Step, string> = {
    1: t("onboarding.step1Desc"),
    2: t("onboarding.step2Desc"),
    3: t("onboarding.step3Desc"),
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" dir={i18n.dir()}>
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[hsl(158_55%_12%)] via-[hsl(158_50%_16%)] to-[hsl(215_60%_14%)]">
        <div className="w-full max-w-md">
          {/* Brand header */}
          <div className="flex flex-col items-center mb-5 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center shadow-xl backdrop-blur">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-white">{t("onboarding.welcomeTitle")}</h1>
            <p className="mt-1 text-sm text-white/70">{t("onboarding.welcomeDesc")}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            {/* Progress */}
            <div className="px-6 pt-5 pb-4 border-b border-border/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground">{stepTitles[step]}</span>
                <span className="text-xs font-semibold text-muted-foreground">{t("onboarding.stepProgress", { step })}</span>
              </div>
              <div className="flex gap-1.5">
                {([1, 2, 3] as Step[]).map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-all duration-300",
                      s <= step ? "bg-gradient-to-l from-primary to-[hsl(165_55%_38%)]" : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{stepDescriptions[step]}</p>
            </div>

            <div className="p-6 space-y-5">
              {/* STEP 1 — SIM Configuration */}
              {step === 1 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <p className="text-sm font-bold text-foreground">{t("onboarding.simRequired")}</p>
                  </div>

                  {/* Operator tabs */}
                  <div className="flex gap-2 p-1.5 bg-muted/80 rounded-xl border border-border/50">
                    {(["syriatel", "mtn"] as Operator[]).map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setActiveTab(op)}
                        className={cn(
                          "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                          activeTab === op
                            ? op === "mtn"
                              ? "bg-operator-mtn text-operator-mtn-foreground shadow-sm"
                              : "bg-operator-syriatel text-white shadow-sm"
                            : "text-muted-foreground"
                        )}
                      >
                        {op === "mtn" ? "MTN" : "Syriatel"}
                      </button>
                    ))}
                  </div>

                  {activeTab === "syriatel" ? (
                    <div className="space-y-4">
                      <SecretField
                        label={t("onboarding.distributorLabel")}
                        value={credentials.syriatelDistributor}
                        placeholder={t("onboarding.distributorPlaceholder")}
                        visible={showFields["distributor"]}
                        onToggle={() => toggleShow("distributor")}
                        onChange={(v) => setCredentials({ ...credentials, syriatelDistributor: v })}
                      />
                      <SecretField
                        label={t("onboarding.secretLabel")}
                        value={credentials.syriatelSerial}
                        placeholder={t("onboarding.secretPlaceholder")}
                        visible={showFields["serial"]}
                        onToggle={() => toggleShow("serial")}
                        onChange={(v) => setCredentials({ ...credentials, syriatelSerial: v })}
                      />
                      <SimSlotPicker
                        operator="syriatel"
                        value={simAssignment.syriatel}
                        onChange={(slot) => setSimAssignment({ ...simAssignment, syriatel: slot })}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <SecretField
                        label={t("onboarding.mtnSecretLabel")}
                        value={credentials.mtnSecret}
                        placeholder={t("onboarding.mtnSecretPlaceholder")}
                        visible={showFields["mtn"]}
                        onToggle={() => toggleShow("mtn")}
                        onChange={(v) => setCredentials({ ...credentials, mtnSecret: v })}
                      />
                      <SimSlotPicker
                        operator="mtn"
                        value={simAssignment.mtn}
                        onChange={(slot) => setSimAssignment({ ...simAssignment, mtn: slot })}
                      />
                    </div>
                  )}

                  <Button onClick={handleStep1Continue} className="w-full h-12 font-bold rounded-xl shadow-lg">
                    <Check className="w-5 h-5 me-2" />
                    {t("onboarding.saveContinue")}
                  </Button>
                </div>
              )}

              {/* STEP 2 — Business Name */}
              {step === 2 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Store className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-foreground">{t("onboarding.businessNameLabel")}</Label>
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder={t("onboarding.businessNamePlaceholder")}
                      className="h-12 rounded-xl text-base bg-background/50"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">{t("onboarding.businessNameHint")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleStep2Later} className="flex-1 h-12 rounded-xl">
                      {t("onboarding.later")}
                    </Button>
                    <Button onClick={handleStep2Save} className="flex-1 h-12 rounded-xl shadow-lg">
                      {t("onboarding.saveContinue")}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3 — Profile */}
              {step === 3 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <User className="w-7 h-7" />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold text-foreground">{t("onboarding.fullNameLabel")}</Label>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={t("onboarding.fullNamePlaceholder")}
                        className="h-12 rounded-xl text-base bg-background/50"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold text-foreground">{t("onboarding.phoneLabel")}</Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder={t("onboarding.phonePlaceholder")}
                        className="h-12 rounded-xl text-base bg-background/50"
                        dir="ltr"
                        inputMode="tel"
                      />
                    </div>
                  </div>
                  {!profileReady && (
                    <p className="text-xs text-muted-foreground">{t("onboarding.loadingProfile")}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleStep3Later} className="flex-1 h-12 rounded-xl">
                      {t("onboarding.later")}
                    </Button>
                    <Button onClick={handleStep3Save} className="flex-1 h-12 rounded-xl shadow-lg">
                      {t("onboarding.saveFinish")}
                    </Button>
                  </div>
                </div>
              )}

              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t("onboarding.backButton")}
                </button>
              )}
            </div>
          </div>

          {step === 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-white/60 text-xs">
              <ShieldCheck className="w-4 h-4" />
              {t("onboarding.dataPrivacy")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SecretField({
  label,
  value,
  placeholder,
  visible,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-foreground">{label}</Label>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-12 rounded-xl bg-background/50 pe-12"
          dir="ltr"
          inputMode="numeric"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute end-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("onboarding.toggleVisibility")}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function SimSlotPicker({
  operator,
  value,
  onChange,
}: {
  operator: Operator;
  value: SimSlot;
  onChange: (slot: SimSlot) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-foreground">{t("onboarding.simSlotLabel", { operator })}</Label>
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
                : "bg-muted/30 border-border hover:border-primary/30"
            )}
          >
            <RadioGroupItem value={String(slot)} id={`${operator}-sim-${slot}`} className={operator === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"} />
            <Label htmlFor={`${operator}-sim-${slot}`} className="text-sm font-bold cursor-pointer">{t("onboarding.simSlot", { slot: slot + 1 })}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
