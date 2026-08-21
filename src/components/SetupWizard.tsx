import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getCredentials,
  saveCredentials,
  getSimAssignment,
  saveSimAssignment,
  type Operator,
  type SimSlot,
  type OperatorCredentials,
  type SimAssignment,
  DEFAULT_CREDENTIALS,
} from "@/lib/ussd-profiles";
import { getBusinessName, saveBusinessName } from "@/lib/onboarding";
import { updateProfile, getProfile, type UserProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { markWizardShown } from "@/lib/setup-wizard";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface SetupWizardProps {
  onCompleted: () => void;
}

export default function SetupWizard({ onCompleted }: SetupWizardProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [credentials, setCredentials] = useState<OperatorCredentials>(DEFAULT_CREDENTIALS);
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [businessName, setBusinessName] = useState(() => getBusinessName());
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [syriatelOpen, setSyriatelOpen] = useState(false);
  const [mtnOpen, setMtnOpen] = useState(false);
  const credentialsLoaded = useRef(false);

  useEffect(() => {
    getCredentials().then((c) => {
      credentialsLoaded.current = true;
      setCredentials(c);
    });
    getProfile()
      .then((p) => {
        setFullName(p?.display_name?.trim() || "");
        setPhone(p?.phone?.trim() || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!credentialsLoaded.current) return;
    const timer = setTimeout(() => {
      saveCredentials(credentials).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [credentials]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (businessName.trim()) saveBusinessName(businessName.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [businessName]);

  const close = useCallback(() => {
    markWizardShown();
    onCompleted();
  }, [onCompleted]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!fullName.trim()) nextErrors.name = t("setupWizard.nameRequired");
    if (!phone.trim()) nextErrors.phone = t("setupWizard.phoneRequired");
    if (!businessName.trim()) nextErrors.businessName = t("setupWizard.businessNameRequired");
    if (!credentials.syriatelDistributor.trim()) nextErrors.distributor = t("setupWizard.distributorCodeError");
    if (!credentials.syriatelSerial.trim()) nextErrors.secretCode = t("setupWizard.secretCodeError");
    if (!credentials.mtnSecret.trim()) nextErrors.mtnSecret = t("setupWizard.mtnSecretCodeError");
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    saveSimAssignment(simAssignment);
    saveBusinessName(businessName.trim());
    const normalizedPhone = phone.replace(/[^\d+]/g, "").replace(/^(\+963|963)/, "0");
    const { error } = await updateProfile({
      display_name: fullName.trim(),
      phone: normalizedPhone || phone.trim(),
      shop_name: businessName.trim(),
    });
    if (error) {
      toast.error(t("setupWizard.profileSaveError", { error: error.message }));
      return;
    }
    toast.success(t("setupWizard.profileSaved"));
    close();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" dir={isArabic ? "rtl" : "ltr"}>
      <div className="min-h-full flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60">
            <h2 className="text-base font-bold text-foreground">{t("setupWizard.welcomeTitle")}</h2>
            <button
              type="button"
              onClick={close}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("setupWizard.ownerInfo")}</p>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">{t("setupWizard.phoneLabel")}</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("setupWizard.phonePlaceholder")}
                  className={cn("h-10 rounded-xl text-sm bg-background/50", errors.phone && "border-destructive")}
                  dir="ltr"
                  inputMode="tel"
                />
                {errors.phone && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" /> {errors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">{t("setupWizard.fullNameLabel")}</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("setupWizard.fullNamePlaceholder")}
                  className={cn("h-10 rounded-xl text-sm bg-background/50", errors.name && "border-destructive")}
                />
                {errors.name && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" /> {errors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">{t("setupWizard.businessNameLabel")}</Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t("setupWizard.businessNamePlaceholder")}
                  className={cn("h-10 rounded-xl text-sm bg-background/50", errors.businessName && "border-destructive")}
                />
                {errors.businessName && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" /> {errors.businessName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("setupWizard.networkSettings")}</p>

              <Collapsible open={syriatelOpen} onOpenChange={setSyriatelOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-bold text-operator-syriatel">{t("setupWizard.syriatel")}</span>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", syriatelOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3 animate-slide-down">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">{t("setupWizard.distributorLabel")}</Label>
                    <Input
                      type="text"
                      value={credentials.syriatelDistributor}
                      onChange={(e) => setCredentials({ ...credentials, syriatelDistributor: e.target.value })}
                      placeholder={t("setupWizard.distributorPlaceholder")}
                      className={cn("h-10 rounded-xl text-sm bg-background/50", errors.distributor && "border-destructive")}
                      dir="ltr"
                      inputMode="numeric"
                    />
                    {errors.distributor && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="w-3 h-3" /> {errors.distributor}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">{t("setupWizard.secretLabel")}</Label>
                    <Input
                      type="text"
                      value={credentials.syriatelSerial}
                      onChange={(e) => setCredentials({ ...credentials, syriatelSerial: e.target.value })}
                      placeholder={t("setupWizard.secretPlaceholder")}
                      className={cn("h-10 rounded-xl text-sm bg-background/50", errors.secretCode && "border-destructive")}
                      dir="ltr"
                      inputMode="numeric"
                    />
                    {errors.secretCode && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="w-3 h-3" /> {errors.secretCode}
                      </p>
                    )}
                  </div>
                  <SimSlotPicker
                    operator="syriatel"
                    value={simAssignment.syriatel}
                    onChange={(slot) => setSimAssignment({ ...simAssignment, syriatel: slot })}
                  />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={mtnOpen} onOpenChange={setMtnOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-bold text-operator-mtn">MTN</span>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", mtnOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3 animate-slide-down">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">{t("setupWizard.mtnSecretLabel")}</Label>
                    <Input
                      type="text"
                      value={credentials.mtnSecret}
                      onChange={(e) => setCredentials({ ...credentials, mtnSecret: e.target.value })}
                      placeholder={t("setupWizard.mtnSecretPlaceholder")}
                      className={cn("h-10 rounded-xl text-sm bg-background/50", errors.mtnSecret && "border-destructive")}
                      dir="ltr"
                      inputMode="numeric"
                    />
                    {errors.mtnSecret && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="w-3 h-3" /> {errors.mtnSecret}
                      </p>
                    )}
                  </div>
                  <SimSlotPicker
                    operator="mtn"
                    value={simAssignment.mtn}
                    onChange={(slot) => setSimAssignment({ ...simAssignment, mtn: slot })}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border/60 flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground underline underline-offset-2 py-1"
            >
              {t("setupWizard.later")}
            </button>
            <div className="flex-1" />
            <Button onClick={handleSave} className="h-10 rounded-xl shadow-sm px-5 text-sm font-bold">
              {t("setupWizard.saveFinish")}
            </Button>
          </div>
        </div>
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
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-foreground">
        {t("setupWizard.simSlotLabel", { operator: operator === "mtn" ? t("setupWizard.mtn") : t("setupWizard.syriatel") })}
      </Label>
      <RadioGroup
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) as SimSlot)}
        className="flex gap-2"
        dir="ltr"
      >
        {([0, 1] as SimSlot[]).map((slot) => (
          <div
            key={slot}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 flex-1 border-2 transition-all cursor-pointer",
              value === slot
                ? operator === "mtn"
                  ? "bg-operator-mtn/10 border-operator-mtn/30"
                  : "bg-operator-syriatel/10 border-operator-syriatel/30"
                : "bg-muted/30 border-border hover:border-primary/30",
            )}
          >
            <RadioGroupItem value={String(slot)} id={`${operator}-sim-${slot}`} className={operator === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"} />
            <Label htmlFor={`${operator}-sim-${slot}`} className="text-xs font-bold cursor-pointer">
              {t("setupWizard.simSlot", { slot: slot + 1 })}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
