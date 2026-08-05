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
  recordPrice,
  type TransferRecord,
} from "@/lib/transfer-history";
import {
  saveContactAfterTransfer,
  searchContactsSync,
  createAndroidContact,
  openAppSettings,
  pickContactFromDevice,
  normalizePhone,
  type AndroidContact,
} from "@/lib/android-contacts";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { trackTransfer } from "@/lib/cloud-sync";
import { getTransferGuard, validateDeviceSession } from "@/lib/license-cache";
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

  const contactsRef = useRef<HTMLDivElement>(null);

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
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    setSelectedAmount(null);
  }, [transferOperator]);

  const handleTransferClick = useCallback(async () => {
    if (!phone.trim()) {
      toast.error("الرجاء إدخال رقم هاتف صحيح");
      return;
    }
    if (!isSecretNumber && phone.trim().length < 10) {
      toast.error("الرجاء إدخال رقم هاتف صحيح");
      return;
    }
    if (!transferOperator) {
      toast.error(isSecretNumber ? "الرجاء اختيار المشغّل" : "لم يتم التعرف على المشغّل");
      return;
    }
    if (!selectedAmount) {
      toast.error("الرجاء اختيار المبلغ");
      return;
    }
    await validateDeviceSession();
    const guard = getTransferGuard();
    if (!guard.allowed) {
      toast.error(guard.reason || "لا يمكن إجراء التحويل حالياً / Transfer not allowed");
      return;
    }
    setShowConfirm(true);
  }, [phone, isSecretNumber, transferOperator, selectedAmount]);

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
      toast.error(guard.reason || "لا يمكن إجراء التحويل حالياً / Transfer not allowed");
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

      toast.success("تم إرسال الطلب بنجاح ✓");

      await saveContactAfterTransfer(phone.trim(), nameInput.trim() || contactName);
      setContactsVersion(v => v + 1);

      setPhone("");
      setSelectedAmount(null);
      setContactName('');
      setShowSaveName(false);
      setNameInput('');
    } catch {
      toast.error("فشل إرسال الطلب");
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
      toast.error("هذه الميزة متوفرة فقط على أندرويد / Available only on Android");
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
      const amt = recordPrice(r);
      totalSum += amt;
      if (r.timestamp >= todayStart) { todaySum += amt; todayCount++; }
      if (r.timestamp >= weekAgo) { weekSum += amt; weekCount++; }
      if (r.timestamp >= monthStart) { monthSum += amt; monthCount++; }
    });

    return { todaySum, todayCount, weekSum, weekCount, monthSum, monthCount, totalSum, totalCount: phoneHistory.length };
  }, [phoneHistory]);

  return (
    <AppLayout title="تحويل رصيد" onTitleClick={handleTitleTap}>
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3.5 px-3 py-3 overflow-y-auto">

        {/* Phone Input Card */}
        <div className="bg-white rounded-2xl p-4.5 shadow-sm border border-border/60 space-y-3.5 animate-slide-up">
          <div className="relative" ref={contactsRef}>
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
              <button
                onClick={handlePickContact}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all active:scale-90"
                type="button"
                aria-label="اختيار من جهات الاتصال"
              >
                <BookUser className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-border" />
            </div>
            <Input
              type="tel"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setContactName(''); setShowSaveName(false); setNameInput(''); setAndroidContacts([]); }}
              onFocus={() => setShowContacts(true)}
              className="text-left text-lg h-13 tracking-wider rounded-xl border-2 border-border bg-background/50 focus:border-primary focus:bg-white transition-all pl-[4.25rem] font-mono shadow-sm"
              dir="ltr"
              inputMode="tel"
              aria-label="رقم الهاتف"
            />

            {showContacts && androidContacts.length > 0 && (
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
                          <span className="text-sm font-medium text-foreground" dir="rtl">{contact.name}</span>
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
                {operator === "mtn" ? "MTN" : "Syriatel"}
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
                  حفظ الاسم
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="الاسم"
                    className="h-8 text-xs rounded-xl w-36"
                    dir="rtl"
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
                          toast.success("تم حفظ الاسم");
                          setContactsVersion(v => v + 1);
                        } else if (res.code === 'PERMISSION_DENIED') {
                          toast.error("صلاحية جهات الاتصال مرفوضة. امنح التطبيق الإذن من الإعدادات ثم أعد المحاولة");
                          await openAppSettings();
                        } else {
                          console.warn('[Transfer] save name failed:', res.code, res.message);
                          toast.error(res.message
                            ? `فشل حفظ الاسم (${res.code || 'خطأ'}): ${res.message}`
                            : "فشل حفظ الاسم، حاول مرة أخرى");
                        }
                      }
                      setShowSaveName(false);
                    }}
                  >
                    حفظ
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Smart Transfer Suggestions */}
        <SmartPhoneSuggestions
          query={phone}
         onSelect={(suggestedPhone, lastPrice) => {
             setPhone(suggestedPhone);
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
              تحويل عبر الرقم السري — اختر المشغّل
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
              اختر المبلغ
            </p>
            <div className="grid grid-cols-3 gap-2.5 max-h-[280px] overflow-y-auto scrollbar-thin pr-0.5">
              {currentPresets.map((preset, i) => {
                const isSelected = selectedAmount?.amount === preset.amount;
                const totalPresets = currentPresets.length;
                const intensity = i / Math.max(totalPresets - 1, 1);
                const bgSaturation = 15 + intensity * 40;
                const bgLightness = 98 - intensity * 8;
                const bdSaturation = 25 + intensity * 35;
                const bdLightness = 85 - intensity * 28;
                const txtColor = `hsl(152, ${Math.round(bgSaturation + 20)}%, ${Math.round(35 - intensity * 18)}%)`;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedAmount(preset)}
                    className={cn(
                      "flex flex-col items-center p-3.5 rounded-xl border-2 transition-all duration-200 active:scale-95 relative",
                      isSelected
                        ? "border-primary bg-primary text-white shadow-lg shadow-primary/25"
                        : "hover:shadow-sm hover:scale-[1.02]"
                    )}
                    style={(!isSelected ? {
                      backgroundColor: `hsl(152, ${Math.round(bgSaturation)}%, ${Math.round(bgLightness)}%)`,
                      borderColor: `hsl(152, ${Math.round(bdSaturation)}%, ${Math.round(bdLightness)}%)`,
                    } : undefined) as any}
                  >
                    {!isSelected && intensity > 0.3 && (
                      <span className="absolute top-0.5 end-1.5 text-[7px] font-bold uppercase tracking-widest"
                        style={{ color: `hsl(152, 60%, ${Math.round(70 - intensity * 25)}%)`, opacity: 0.5 }}>
                        {i < totalPresets * 0.33 ? '' : i < totalPresets * 0.66 ? '●' : '●●'}
                      </span>
                    )}
                    <span className={cn(
                      "text-lg font-bold",
                      isSelected ? "text-white" : ""
                    )} style={!isSelected ? { color: txtColor } : undefined}>
                      {preset.price.toLocaleString()}
                    </span>
                    <span className={cn(
                      "text-xs mt-1 font-medium",
                      isSelected ? "text-white/80" : ""
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
              })}
            </div>
          </div>
        )}

        {/* Transfer Button */}
        <Button
          onClick={handleTransferClick}
          disabled={!transferOperator || !selectedAmount || dialing}
          className={cn(
            "w-full h-14 text-base font-bold rounded-xl shadow-lg transition-all duration-200",
            "bg-gradient-to-l from-primary to-[hsl(165_55%_38%)]",
            "hover:from-primary hover:to-[hsl(158_58%_39%)]",
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
          {dialing ? "جاري الإرسال..." : "تحويل"}
        </Button>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent dir="rtl" className="rounded-2xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">تأكيد التحويل</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <div className="bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-2xl p-4.5 space-y-3.5 border border-primary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">المبلغ</span>
                    <span className="font-bold text-foreground text-lg">{selectedAmount?.amount.toLocaleString()} ل.س</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">السعر</span>
                    <span className="font-bold text-foreground">{selectedAmount?.price.toLocaleString()} ل.س</span>
                  </div>
                  {contactName && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">الاسم</span>
                      <span className="font-bold text-foreground">{contactName}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">الرقم</span>
                    <span className="font-bold text-foreground font-mono" dir="ltr">{phone.trim()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/60">
                    <span className="text-muted-foreground text-sm">المشغّل</span>
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
              <AlertDialogAction onClick={handleConfirmTransfer} className="rounded-xl flex-1 h-12 text-base font-bold shadow-sm">تأكيد التحويل</AlertDialogAction>
              <AlertDialogCancel className="rounded-xl h-12 text-base">إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Phone stats + history */}
        {phoneStats && (
          <div className="space-y-3.5 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <TrendingUp className="w-3.5 h-3.5" />
              ملخص التحويلات لهذا الرقم
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[{ label: "اليوم", sum: phoneStats.todaySum, count: phoneStats.todayCount },
                { label: "الأسبوع", sum: phoneStats.weekSum, count: phoneStats.weekCount },
                { label: "الشهر", sum: phoneStats.monthSum, count: phoneStats.monthCount },
                { label: "الإجمالي", sum: phoneStats.totalSum, count: phoneStats.totalCount }].map((stat) => (
                <div key={stat.label} className="bg-white border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
                  <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">{stat.label}</p>
                  <p className="text-xs font-bold text-foreground">{stat.sum.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{stat.count}×</p>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <Clock className="w-3.5 h-3.5" />
              آخر العمليات
            </p>
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-thin">
              {phoneHistory.slice(0, 8).map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white border border-border/60 rounded-xl px-4 py-3 shadow-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {new Date(record.timestamp).toLocaleDateString("ar-SY", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                   <div className="flex items-center gap-2.5">
                     <span className="font-bold text-foreground text-sm">
                       {recordPrice(record).toLocaleString()}
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

export default Index;
