import { useEffect, useState } from "react";
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
      toast.error("Please enter the Syriatel Distributor Code.");
      return;
    }
    if (!credentials.syriatelSerial.trim()) {
      toast.error("Please enter the Syriatel Secret Code.");
      return;
    }
    if (!credentials.mtnSecret.trim()) {
      toast.error("Please enter the MTN Secret Code.");
      return;
    }
    saveCredentials(credentials);
    saveSimAssignment(simAssignment);
    toast.success("تم حفظ بيانات الشريحة");
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
      toast.error("الرجاء إدخال الاسم التجاري");
      return;
    }
    saveBusinessName(businessName);
    syncShopNameToProfile(businessName.trim());
    toast.success("تم حفظ الاسم التجاري");
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
      toast.error("الرجاء إدخال الاسم");
      return;
    }
    const { error } = await updateProfile({ display_name: fullName, phone: phone.trim() || undefined });
    if (error) {
      toast.error(error.message);
      return;
    }
    clearProfileSkip();
    toast.success("تم حفظ الملف الشخصي");
    onCompleted();
  };

  const handleStep3Later = () => {
    skipProfile();
    onCompleted();
  };

  const stepTitles: Record<Step, string> = {
    1: "إعداد الشريحة",
    2: "الاسم التجاري",
    3: "الملف الشخصي",
  };

  const stepDescriptions: Record<Step, string> = {
    1: "أدخل بيانات شرائح الاتصال لتمكين التحويل",
    2: "يظهر الاسم التجاري كعنوان رئيسي في التطبيق",
    3: "أكمل بياناتك الشخصية للحفظ",
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" dir="rtl">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[hsl(158_55%_12%)] via-[hsl(158_50%_16%)] to-[hsl(215_60%_14%)]">
        <div className="w-full max-w-md">
          {/* Brand header */}
          <div className="flex flex-col items-center mb-5 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center shadow-xl backdrop-blur">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-white">أهلاً بك في رصيد</h1>
            <p className="mt-1 text-sm text-white/70">أكمل الإعدادات التالية للبدء</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            {/* Progress */}
            <div className="px-6 pt-5 pb-4 border-b border-border/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground">{stepTitles[step]}</span>
                <span className="text-xs font-semibold text-muted-foreground">{step} / 3</span>
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
                    <p className="text-sm font-bold text-foreground">بيانات الشرائح — مطلوبة للتحويل</p>
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
                        label="كود الموزع (Distributor Code)"
                        value={credentials.syriatelDistributor}
                        placeholder="مثال: 640322"
                        visible={showFields["distributor"]}
                        onToggle={() => toggleShow("distributor")}
                        onChange={(v) => setCredentials({ ...credentials, syriatelDistributor: v })}
                      />
                      <SecretField
                        label="الرقم السري (Secret Code)"
                        value={credentials.syriatelSerial}
                        placeholder="مثال: 32362"
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
                        label="الرمز السري (Secret Code)"
                        value={credentials.mtnSecret}
                        placeholder="مثال: 20326"
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
                    حفظ ومتابعة
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
                    <Label className="text-sm font-bold text-foreground">الاسم التجاري</Label>
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="مثال: مكتب الرصيد"
                      className="h-12 rounded-xl text-base bg-background/50"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">سيظهر هذا الاسم كعنوان رئيسي في التطبيق</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleStep2Later} className="flex-1 h-12 rounded-xl">
                      لاحقاً
                    </Button>
                    <Button onClick={handleStep2Save} className="flex-1 h-12 rounded-xl shadow-lg">
                      حفظ ومتابعة
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
                      <Label className="text-sm font-bold text-foreground">الاسم الكامل</Label>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="مثال: أحمد محمد"
                        className="h-12 rounded-xl text-base bg-background/50"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-bold text-foreground">رقم الهاتف</Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="09XX XXX XXX"
                        className="h-12 rounded-xl text-base bg-background/50"
                        dir="ltr"
                        inputMode="tel"
                      />
                    </div>
                  </div>
                  {!profileReady && (
                    <p className="text-xs text-muted-foreground">جاري تحميل بياناتك...</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleStep3Later} className="flex-1 h-12 rounded-xl">
                      لاحقاً
                    </Button>
                    <Button onClick={handleStep3Save} className="flex-1 h-12 rounded-xl shadow-lg">
                      حفظ وإنهاء
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
                  {step === 2 ? "تعديل بيانات الشريحة" : "السابق"}
                </button>
              )}
            </div>
          </div>

          {step === 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-white/60 text-xs">
              <ShieldCheck className="w-4 h-4" />
              بياناتك محفوظة على جهازك فقط ولا تُشارك
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
          aria-label={visible ? "إخفاء" : "إظهار"}
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
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-foreground">شريحة {operator === "mtn" ? "MTN" : "Syriatel"} على</Label>
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
            <Label htmlFor={`${operator}-sim-${slot}`} className="text-sm font-bold cursor-pointer">SIM {slot + 1}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
