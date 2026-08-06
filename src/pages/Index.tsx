import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Phone, Clock, CheckCircle, Loader2, Send, TrendingUp, BookUser, UserPlus, Search } from "lucide-react";
import {
  detectOperator,
  buildUssdCode,
  getPresets,
  getCredentials,
  getSimAssignment,
  getLastSecretOperator,
  saveLastSecretOperator,
  type Operator,
  type AmountPreset,
  type OperatorCredentials,
} from "@/lib/ussd-profiles";
import {
  addToHistory,
  getHistory,
  type TransferRecord,
} from "@/lib/transfer-history";
import { getActualDeductedAmount } from "@/lib/amount-utils";
import {
  saveContactAfterTransfer,
  searchContactsSync,
  createAndroidContact,
  openAppSettings,
  pickContactFromDevice,
  getContactByPhone,
  normalizePhone,
  type AndroidContact,
} from "@/lib/android-contacts";
import { getAmountDisplayStyle, type AmountDisplayStyle } from "@/lib/amount-display";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { trackTransfer } from "@/lib/cloud-sync";
import { getTransferGuard, validateDeviceSession } from "@/lib/license-cache";
import { isSimConfigured, getBusinessName } from "@/lib/onboarding";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import SmartPhoneSuggestions from "@/components/SmartPhoneSuggestions";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ContactMatch = {
  phone: string;
  name: string;
};

const Index = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<AmountPreset | null>(null);
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [showContacts, setShowContacts] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>(() => getHistory());
  const [dialing, setDialing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [showSaveName, setShowSaveName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [secretOperator, setSecretOperator] = useState<Operator | null>(() => getLastSecretOperator());
  const [androidContacts, setAndroidContacts] = useState<ContactMatch[]>([]);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [amountDisplayStyle, setAmountDisplayStyle] = useState<AmountDisplayStyle>(() => getAmountDisplayStyle());
  const [businessName, setBusinessName] = useState(() => getBusinessName());

  const contactsRef = useRef<HTMLDivElement>(null);
  const RECENT_LIMIT = 4;

  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleTitleTap = () => {
    tapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      navigate("/sys-panel");
    } else {
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
    }
  };

  const operator = useMemo(() => detectOperator(phone), [phone]);
  const isSecretNumber = phone.trim().length >= 3 && !operator;
  const transferOperator: Operator | null = operator || (isSecretNumber ? secretOperator : null);
  const currentPresets: AmountPreset[] = transferOperator ? presets[transferOperator] : [];

  useEffect(() => {
    if (!phone.trim() || phone.trim().length < 3) {
      setAndroidContacts([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        if (!cancelled) setAndroidContacts([]);
        return;
      }
      const results = await searchContactsSync(phone.trim(), 30);
      if (!cancelled) {
        setAndroidContacts(results.map((c: AndroidContact) => ({
          phone: normalizePhone(c.phones[0] || ''),
          name: c.displayName || '',
        })));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [phone, contactsVersion]);

  useEffect(() => {
    const value = phone.trim();
    if (value.length < 10) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const contact = await getContactByPhone(value);
      if (!cancelled && contact?.contactId && contact.displayName) {
        setContactName(contact.displayName);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [phone, contactsVersion]);

  const recentNumbers = useMemo(() => {
    const seen = new Set<string>();
    const out: { phone: string; lastTimestamp: number }[] = [];
    for (const r of history) {
      if (r.status !== "success") continue;
      if (r.transferType === "secret") continue;
      const p = normalizePhone(r.phone);
      if (!p || p.length < 10 || seen.has(p)) continue;
      seen.add(p);
      out.push({ phone: p, lastTimestamp: r.timestamp });
      if (out.length >= RECENT_LIMIT) break;
    }
    return out;
  }, [history]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactsRef.current && !contactsRef.current.contains(e.target as Node)) {
        setShowContacts(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      setPresets(getPresets());
      setCredentials(getCredentials());
      setHistory(getHistory());
      setAmountDisplayStyle(getAmountDisplayStyle());
      setBusinessName(getBusinessName());
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    setSelectedAmount(null);
  }, [transferOperator]);

  const handleTransferClick = useCallback(async () => {
    if (!phone.trim()) {
      toast.error(t("index.invalidPhone"));
      return;
    }
    if (!isSecretNumber && phone.trim().length < 10) {
      toast.error(t("index.invalidPhone"));
      return;
    }
    if (!transferOperator) {
      toast.error(t("index.selectOperator"));
      return;
    }
    if (!selectedAmount) {
      toast.error(t("index.selectAmount"));
      return;
    }
    if (!isSimConfigured(credentials)) {
      toast.error(t("index.configureSimFirst"));
      return;
    }
    await validateDeviceSession();
    const guard = getTransferGuard();
    if (!guard.allowed) {
      toast.error(guard.reason || t("index.transferNotAllowed"));
      return;
    }
    setShowConfirm(true);
  }, [phone, isSecretNumber, transferOperator, selectedAmount, credentials]);

  const saveNameToAndroid = useCallback(
    async (phoneNumber: string, name: string): Promise<{ ok: boolean; code?: string; message?: string }> => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return { ok: false, code: 'NOT_NATIVE' };
      console.log('[Transfer] saveNameToAndroid: JS step 1, phone=', phoneNumber, 'name=', name);
      try {
        const result = await createAndroidContact(phoneNumber, name);
        if (!result || !result.contactId) {
          return { ok: false, code: 'VERIFY_FAILED' };
        }
        console.log('[Transfer] saveNameToAndroid: success, contactId=', result.contactId);
        return { ok: true };
      } catch (err) {
        const e = err as { code?: string; message?: string; data?: { exception?: string; stack?: string } };
        console.error('[Transfer] saveNameToAndroid: native failure code=', e?.code,
          'exception=', e?.data?.exception, 'message=', e?.message);
        if (e?.data?.stack) console.error('[Transfer] native stack:\n' + e.data.stack);
        return { ok: false, code: e?.code, message: e?.message };
      }
    },
    [],
  );

  const handleConfirmTransfer = useCallback(async () => {
    if (!transferOperator || !selectedAmount) return;
    const guard = getTransferGuard();
    if (!guard.allowed) {
      setShowConfirm(false);
      toast.error(guard.reason || t("index.transferNotAllowed"));
      return;
    }
    setShowConfirm(false);
    const ussd = buildUssdCode(transferOperator, phone.trim(), String(selectedAmount.amount), credentials);
    const simAssignment = getSimAssignment();
    const simSlot = simAssignment[transferOperator];

    setDialing(true);

    try {
      await dialUssdDirect(ussd, simSlot);

      addToHistory({
        phone: phone.trim(),
        amount: String(selectedAmount.amount),
        price: String(selectedAmount.price),
        operator: transferOperator,
        timestamp: Date.now(),
        status: "success",
        transferType: operator ? "phone" : "secret",
      });
      setHistory(getHistory());
      trackTransfer(phone.trim(), String(selectedAmount.amount), transferOperator, "success", {
        package_price: selectedAmount.price,
        package_name: `${selectedAmount.amount}`,
      });

      toast.success(t("index.transferSuccess"));

      await saveContactAfterTransfer(phone.trim(), nameInput.trim() || contactName);
      setContactsVersion(v => v + 1);

      setPhone("");
      setSelectedAmount(null);
      setContactName('');
      setShowSaveName(false);
      setNameInput('');
    } catch {
      toast.error(t("index.transferFailed"));
    } finally {
      setDialing(false);
    }
  }, [phone, transferOperator, selectedAmount, credentials, operator, contactName, nameInput]);

  const selectContact = (contact: ContactMatch) => {
    setPhone(contact.phone);
    setContactName(contact.name || '');
    setShowContacts(false);
  };

  const handlePickContact = useCallback(async () => {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      toast.error(t("index.androidOnly"));
      return;
    }
    const contact = await pickContactFromDevice();
    if (contact) {
      setPhone(contact.phone);
      setContactName(contact.displayName || '');
    }
  }, []);

  const phoneHistory = useMemo(
    () => (phone.trim().length >= 3 ? history.filter((r) => r.phone.includes(phone.trim()) && r.status === "success") : []),
    [history, phone]
  );

  const phoneStats = useMemo(() => {
    if (phoneHistory.length === 0) return null;
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 86400000;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    let todaySum = 0, todayCount = 0;
    let weekSum = 0, weekCount = 0;
    let monthSum = 0, monthCount = 0;
    let totalSum = 0;

    phoneHistory.forEach((r) => {
      const amt = getActualDeductedAmount(r.operator, Number(r.amount));
      totalSum += amt;
      if (r.timestamp >= todayStart) { todaySum += amt; todayCount++; }
      if (r.timestamp >= weekAgo) { weekSum += amt; weekCount++; }
      if (r.timestamp >= monthStart) { monthSum += amt; monthCount++; }
    });

    return { todaySum, todayCount, weekSum, weekCount, monthSum, monthCount, totalSum, totalCount: phoneHistory.length };
  }, [phoneHistory]);

  return (
    <AppLayout title={businessName || t("appName")} onTitleClick={handleTitleTap}>
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3.5 px-3 py-3 overflow-y-auto">

        {/* Phone Input Card */}
        <div className="bg-white rounded-2xl p-4.5 shadow-sm border border-border/60 space-y-3.5 animate-slide-up">
          <div className="relative" ref={contactsRef}>
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
              <button
                onClick={handlePickContact}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all active:scale-90"
                type="button"
                aria-label={t("index.contactPickerAria")}
              >
                <BookUser className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-border" />
            </div>
            <Input
              type="tel"
              placeholder={t("index.phonePlaceholder")}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setContactName(''); setShowSaveName(false); setNameInput(''); setAndroidContacts([]); }}
              onFocus={() => setShowContacts(true)}
              className="text-left text-lg h-13 tracking-wider rounded-xl border-2 border-border bg-background/50 focus:border-primary focus:bg-white transition-all pl-[4.25rem] font-mono shadow-sm"
              dir="ltr"
              inputMode="tel"
              aria-label={t("index.phoneAria")}
            />

            {showContacts && (
              androidContacts.length > 0 ? (
                <div className="absolute z-10 top-full mt-2 w-full bg-white border border-border rounded-xl shadow-elevated max-h-52 overflow-y-auto scrollbar-thin">
                  {androidContacts.map((contact) => {
                    const op = detectOperator(contact.phone);
                    return (
                      <button
                        key={contact.phone}
                        onClick={() => selectContact(contact)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-smooth text-start first:rounded-t-xl last:rounded-b-xl active:bg-muted/80"
                        dir="ltr"
                      >
                        <div className="flex flex-col">
                          {contact.name && (
                            <span className="text-sm font-medium text-foreground" dir="auto">{contact.name}</span>
                          )}
                          <span className="font-mono text-muted-foreground text-sm tracking-wider">{contact.phone}</span>
                        </div>
                        {op && (
                          <span className={cn(
                            "text-[10px] font-bold px-2.5 py-1 rounded-full",
                            op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white"
                          )}>
                            {op === "mtn" ? "MTN" : "SYR"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : phone.trim().length < 3 && recentNumbers.length > 0 ? (
                <div className="absolute z-10 top-full mt-2 w-full bg-white border border-border rounded-xl shadow-elevated max-h-52 overflow-y-auto scrollbar-thin">
                  <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 px-3.5 pt-2.5 pb-1">
                    <Clock className="w-3 h-3" />
                    {t("index.recentNumbers")}
                  </p>
                  {recentNumbers.map((item) => (
                    <button
                      key={item.phone}
                      onClick={() => {
                        setPhone(item.phone);
                        setContactName('');
                        setShowSaveName(false);
                        setNameInput('');
                        setShowContacts(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-smooth text-start first:rounded-t-xl last:rounded-b-xl active:bg-muted/80"
                      dir="ltr"
                    >
                      <span className="font-mono text-muted-foreground text-sm tracking-wider">{item.phone}</span>
                      <span className="text-[10px] text-muted-foreground/60 font-medium">
                        {formatDate(item.lastTimestamp)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null
            )}
          </div>

          {/* Operator badge + contact name */}
          {phone.length >= 10 && operator && (
            <div className="flex items-center justify-between animate-fade-in">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm",
                operator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white"
              )}>
                <Phone className="w-3 h-3" />
                {operator === "mtn" ? t("operator.mtn") : t("operator.syriatel")}
              </span>
              {contactName ? (
                <span className="text-sm text-foreground font-medium flex items-center gap-1.5">
                  <BookUser className="w-4 h-4 text-primary" />
                  {contactName}
                </span>
              ) : !showSaveName ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-xl px-3 border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
                  onClick={() => { setShowSaveName(true); setNameInput(''); }}
                >
                  <UserPlus className="w-3.5 h-3.5 me-1" />
                  {t("index.saveNameButton")}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={t("index.namePlaceholder")}
                    className="h-8 text-xs rounded-xl w-36"
                    dir="auto"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs rounded-xl px-3 shadow-sm"
                    onClick={async () => {
                      if (nameInput.trim()) {
                        const res = await saveNameToAndroid(phone.trim(), nameInput.trim());
                        if (res.ok) {
                          setContactName(nameInput.trim());
                          toast.success(t("index.nameSaved"));
                          setContactsVersion(v => v + 1);
                        } else if (res.code === 'PERMISSION_DENIED') {
                          toast.error(t("index.contactPermissionDenied"));
                          await openAppSettings();
                        } else {
                          console.warn('[Transfer] save name failed:', res.code, res.message);
                          toast.error(res.message
                            ? t("index.nameSaveFailedDetail", { code: res.code || t("common.error"), message: res.message })
                            : t("index.nameSaveRetry"));
                        }
                      }
                      setShowSaveName(false);
                    }}
                  >
                    {t("common.save")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Smart Transfer Suggestions */}
        <SmartPhoneSuggestions
          query={phone}
         onSelect={(suggestedPhone, lastPrice, suggestedName) => {
             setPhone(suggestedPhone);
             setContactName(suggestedName || '');
             setShowSaveName(false);
             setNameInput('');
             setShowContacts(false);
             if (lastPrice && currentPresets.some(p => p.price === lastPrice)) {
               setSelectedAmount(currentPresets.find(p => p.price === lastPrice)!);
             }
           }}
        />

        {/* Secret Number Operator Selector */}
        {isSecretNumber && (
          <div className="bg-white rounded-2xl p-4.5 shadow-sm border border-border/60 space-y-3.5 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              {t("index.secretNumberOperator")}
            </p>
            <RadioGroup
              value={secretOperator || ""}
              onValueChange={(value) => {
                const op = value as Operator;
                setSecretOperator(op);
                saveLastSecretOperator(op);
              }}
              className="flex gap-3"
              dir="ltr"
            >
              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-3 flex-1 border-2 transition-all",
                secretOperator === "mtn" 
                  ? "bg-operator-mtn/10 border-operator-mtn/30 shadow-sm" 
                  : "bg-muted/30 border-border hover:border-operator-mtn/20"
              )}>
                <RadioGroupItem value="mtn" id="s-mtn" className="text-operator-mtn" />
                <Label htmlFor="s-mtn" className="text-sm font-bold cursor-pointer text-operator-mtn">MTN</Label>
              </div>
              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-3 flex-1 border-2 transition-all",
                secretOperator === "syriatel" 
                  ? "bg-operator-syriatel/10 border-operator-syriatel/30 shadow-sm" 
                  : "bg-muted/30 border-border hover:border-operator-syriatel/20"
              )}>
                <RadioGroupItem value="syriatel" id="s-syr" className="text-operator-syriatel" />
                <Label htmlFor="s-syr" className="text-sm font-bold cursor-pointer text-operator-syriatel">Syriatel</Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Preset Amounts */}
        {transferOperator && currentPresets.length > 0 && (
          <div className="space-y-3 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              {t("index.chooseAmount")}
            </p>
            {amountDisplayStyle === "horizontal" ? (
              <div className="flex gap-2.5 overflow-x-auto scrollbar-thin pb-1 pr-0.5 snap-x snap-mandatory scroll-smooth">
                {currentPresets.map((preset, i) => {
                  const isSelected = selectedAmount?.amount === preset.amount;
                  const totalPresets = currentPresets.length;
                  const intensity = i / Math.max(totalPresets - 1, 1);
                  return (
                    <AmountCard
                      key={i}
                      preset={preset}
                      index={i}
                      totalPresets={totalPresets}
                      intensity={intensity}
                      isSelected={isSelected}
                      onClick={() => setSelectedAmount(preset)}
                      className="min-w-[5.5rem] shrink-0 snap-start"
                      compact
                    />
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 max-h-[280px] overflow-y-auto scrollbar-thin pr-0.5">
                {currentPresets.map((preset, i) => {
                  const isSelected = selectedAmount?.amount === preset.amount;
                  const totalPresets = currentPresets.length;
                  const intensity = i / Math.max(totalPresets - 1, 1);
                  return (
                    <AmountCard
                      key={i}
                      preset={preset}
                      index={i}
                      totalPresets={totalPresets}
                      intensity={intensity}
                      isSelected={isSelected}
                      onClick={() => setSelectedAmount(preset)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Transfer Button */}
        <Button
          onClick={handleTransferClick}
          disabled={!transferOperator || !selectedAmount || dialing}
          className={cn(
            "w-full h-14 text-base font-bold rounded-xl shadow-lg transition-all duration-200",
            "bg-gradient-to-l from-primary to-[hsl(var(--primary-end))]",
            "hover:from-primary hover:to-[hsl(var(--primary-end-hover))]",
            "disabled:opacity-40 disabled:shadow-none",
            "active:scale-[0.98]"
          )}
          size="lg"
        >
          {dialing ? (
            <Loader2 className="w-5 h-5 me-2 animate-spin" />
          ) : (
            <Send className="w-5 h-5 me-2" />
          )}
          {dialing ? t("common.loading") : t("index.transferButton")}
        </Button>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent dir={i18n.dir()} className="rounded-2xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">{t("index.confirmTransferTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <div className="bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-2xl p-4.5 space-y-3.5 border border-primary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogAmount")}</span>
                    <span className="font-bold text-foreground text-lg">{selectedAmount?.amount.toLocaleString()} {t("common.currencySymbol")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogPrice")}</span>
                    <span className="font-bold text-foreground">{selectedAmount?.price.toLocaleString()} {t("common.currencySymbol")}</span>
                  </div>
                  {contactName && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">{t("index.dialogName")}</span>
                      <span className="font-bold text-foreground">{contactName}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogPhone")}</span>
                    <span className="font-bold text-foreground font-mono" dir="ltr">{phone.trim()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/60">
                    <span className="text-muted-foreground text-sm">{t("index.dialogOperator")}</span>
                    <span className={cn(
                      "font-bold px-3 py-1 rounded-xl text-xs shadow-sm",
                      transferOperator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white"
                    )}>
                      {transferOperator === "mtn" ? "MTN" : "Syriatel"}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={handleConfirmTransfer} className="rounded-xl flex-1 h-12 text-base font-bold shadow-sm">{t("index.confirmTransferAction")}</AlertDialogAction>
              <AlertDialogCancel className="rounded-xl h-12 text-base">{t("common.cancel")}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Phone stats + history */}
        {phoneStats && (
          <div className="space-y-3.5 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {t("index.transferSummary")}
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[{ label: t("common.today"), sum: phoneStats.todaySum, count: phoneStats.todayCount },
                { label: t("common.week"), sum: phoneStats.weekSum, count: phoneStats.weekCount },
                { label: t("common.month"), sum: phoneStats.monthSum, count: phoneStats.monthCount },
                { label: t("common.total"), sum: phoneStats.totalSum, count: phoneStats.totalCount }].map((stat) => (
                <div key={stat.label} className="bg-white border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
                  <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">{stat.label}</p>
                  <p className="text-xs font-bold text-foreground">{stat.sum.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{stat.count}×</p>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <Clock className="w-3.5 h-3.5" />
              {t("index.lastTransactions")}
            </p>
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-thin">
              {phoneHistory.slice(0, 8).map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white border border-border/60 rounded-xl px-4 py-3 shadow-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(record.timestamp)}
                  </span>
                   <div className="flex items-center gap-2.5">
                     <span className="font-bold text-foreground text-sm">
                       {getActualDeductedAmount(record.operator, Number(record.amount)).toLocaleString()}
                     </span>
                    {record.transferType === "secret" && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium leading-none">
                        🔑
                      </span>
                    )}
                    <span className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 text-success" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

function AmountCard({
  preset,
  index,
  totalPresets,
  intensity,
  isSelected,
  onClick,
  className,
  compact,
}: {
  preset: AmountPreset;
  index: number;
  totalPresets: number;
  intensity: number;
  isSelected: boolean;
  onClick: () => void;
  className?: string;
  compact?: boolean;
}) {
  const bgSaturation = 15 + intensity * 40;
  const bgLightness = 98 - intensity * 8;
  const bdSaturation = 25 + intensity * 35;
  const bdLightness = 85 - intensity * 28;
  const txtColor = `hsl(var(--primary-h), ${Math.round(bgSaturation + 20)}%, ${Math.round(35 - intensity * 18)}%)`;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center p-3.5 rounded-xl border-2 transition-all duration-200 active:scale-95 relative",
        isSelected
          ? "border-primary bg-primary text-white shadow-lg shadow-primary/25"
          : "hover:shadow-sm hover:scale-[1.02]",
        className,
      )}
      style={(!isSelected ? {
        backgroundColor: `hsl(var(--primary-h), ${Math.round(bgSaturation)}%, ${Math.round(bgLightness)}%)`,
        borderColor: `hsl(var(--primary-h), ${Math.round(bdSaturation)}%, ${Math.round(bdLightness)}%)`,
      } : undefined) as any}
    >
      {!isSelected && intensity > 0.3 && (
        <span className="absolute top-0.5 end-1.5 text-[7px] font-bold uppercase tracking-widest"
          style={{ color: `hsl(var(--primary-h), 60%, ${Math.round(70 - intensity * 25)}%)`, opacity: 0.5 }}>
          {index < totalPresets * 0.33 ? '' : index < totalPresets * 0.66 ? '●' : '●●'}
        </span>
      )}
      <span className={cn(
        "font-bold",
        compact ? "text-base" : "text-lg",
        isSelected ? "text-white" : "",
      )} style={!isSelected ? { color: txtColor } : undefined}>
        {preset.price.toLocaleString()}
      </span>
      <span className={cn(
        "mt-1 font-medium",
        compact ? "text-[11px]" : "text-xs",
        isSelected ? "text-white/80" : "",
      )} style={!isSelected ? { color: txtColor, opacity: 0.7 } : undefined}>
        {preset.amount.toLocaleString()}
      </span>
      {isSelected && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
          <CheckCircle className="w-3 h-3 text-primary" />
        </span>
      )}
    </button>
  );
}

export default Index;
