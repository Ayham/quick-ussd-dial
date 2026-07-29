import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { Phone, Clock, CheckCircle, Loader2, Send, TrendingUp, BookUser, UserPlus, Contact, Search } from "lucide-react";
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
  getMatchingContacts,
  getHistory,
  type TransferRecord,
} from "@/lib/transfer-history";
import { updateContactName, pickPhoneContact, type SavedContact } from "@/lib/contacts";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { trackTransfer } from "@/lib/cloud-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import AppContactsSearchDialog from "@/components/contacts/AppContactsSearchDialog";
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

const Index = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<AmountPreset | null>(null);
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [showContacts, setShowContacts] = useState(false);
  const [showAppContactsSearch, setShowAppContactsSearch] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>(() => getHistory());
  const [dialing, setDialing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [showSaveName, setShowSaveName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [secretOperator, setSecretOperator] = useState<Operator | null>(() => getLastSecretOperator());
  
  const contactsRef = useRef<HTMLDivElement>(null);

  // Hidden admin access: tap title 7 times
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
  const matchingContacts = useMemo(() => getMatchingContacts(phone), [phone]);

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

  const handleTransferClick = useCallback(() => {
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
    setShowConfirm(true);
  }, [phone, isSecretNumber, transferOperator, selectedAmount]);

  const handleConfirmTransfer = useCallback(async () => {
    if (!transferOperator || !selectedAmount) return;
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

      setPhone("");
      setSelectedAmount(null);
    } catch {
      toast.error("فشل إرسال الطلب");
    } finally {
      setDialing(false);
    }
  }, [phone, transferOperator, selectedAmount, credentials, operator]);

  const selectContact = (contact: SavedContact) => {
    setPhone(contact.phone);
    setContactName(contact.name || '');
    setShowContacts(false);
  };

  const pickNativeContact = async () => {
    try {
      const picked = await pickPhoneContact();
      if (picked) {
        selectContact(picked);
        setShowAppContactsSearch(false);
      }
    } catch (err: any) {
      const msg = err?.message;
      toast.error(
        msg === 'WEB_ONLY'
          ? "هذه الميزة تعمل فقط على الجهاز"
          : msg === 'CONTACTS_PERMISSION_DENIED'
          ? "تم رفض صلاحية جهات الاتصال. فعّلها من إعدادات التطبيق"
          : `تعذر فتح سجل جهات الاتصال: ${msg || err}`
      );
    }
  };

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
      const amt = Number(r.amount);
      totalSum += amt;
      if (r.timestamp >= todayStart) { todaySum += amt; todayCount++; }
      if (r.timestamp >= weekAgo) { weekSum += amt; weekCount++; }
      if (r.timestamp >= monthStart) { monthSum += amt; monthCount++; }
    });

    return { todaySum, todayCount, weekSum, weekCount, monthSum, monthCount, totalSum, totalCount: phoneHistory.length };
  }, [phoneHistory]);

  return (
    <AppLayout title="تحويل رصيد" onTitleClick={handleTitleTap}>
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3 px-3 py-3 overflow-y-auto">
        
        {/* Phone Input Card */}
        <div className="bg-card rounded-2xl p-4 shadow-card space-y-3 animate-slide-up">
          <div className="relative" ref={contactsRef}>
            <Input
              type="tel"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setContactName(''); setShowSaveName(false); setNameInput(''); }}
              onFocus={() => setShowContacts(true)}
              className="text-left text-lg h-12 tracking-wider rounded-xl border-2 border-border focus:border-primary transition-smooth pl-15 font-mono"
              dir="ltr"
              inputMode="tel"
              aria-label="رقم الهاتف"
            />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* <button
                onClick={async () => {
                  try {
                    const picked = await pickPhoneContact();
                    if (picked) {
                      setPhone(picked.phone);
                      setContactName(picked.name || '');
                    }
                  } catch (err: any) {
                    const msg = err?.message;
                    toast.error(
                      msg === 'WEB_ONLY'
                        ? "هذه الميزة تعمل فقط على الجهاز"
                        : msg === 'CONTACTS_PERMISSION_DENIED'
                        ? "تم رفض صلاحية جهات الاتصال"
                        : `تعذر فتح سجل الاتصال: ${msg || err}`
                    );
                  }
                }}
                className="p-2 rounded-lg hover:bg-muted transition-smooth text-muted-foreground hover:text-primary active:scale-95"
                title="اختيار من سجل الهاتف"
                aria-label="اختيار من سجل الهاتف"
              >
                <Contact className="w-5 h-5" />
              </button> */}
              <button
                type="button"
                data-testid="app-contacts-search-button"
                onClick={() => {
                  setShowContacts(false);
                  setShowAppContactsSearch(true);
                }}
                className="p-2 rounded-lg hover:bg-muted transition-smooth text-muted-foreground hover:text-primary active:scale-95"
                title="البحث في جهات التطبيق"
                aria-label="البحث في جهات التطبيق"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            {/* Contacts dropdown */}
            {showContacts && matchingContacts.length > 0 && (
              <div className="absolute z-10 top-full mt-2 w-full bg-card border border-border rounded-xl shadow-elevated max-h-52 overflow-y-auto scrollbar-thin">
                {matchingContacts.map((contact) => {
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
                          op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
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
                "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                operator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
              )}>
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
                  className="h-8 text-xs rounded-lg px-3 border-primary/30 text-primary hover:bg-primary/5"
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
                    className="h-8 text-xs rounded-lg w-36"
                    dir="rtl"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs rounded-lg px-3"
                    onClick={() => {
                      if (nameInput.trim()) {
                        updateContactName(phone.trim(), nameInput.trim());
                        setContactName(nameInput.trim());
                        toast.success("تم حفظ الاسم");
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

        <AppContactsSearchDialog
          open={showAppContactsSearch}
          onOpenChange={setShowAppContactsSearch}
          onSelect={selectContact}
          onPickNative={pickNativeContact}
        />

        {/* Secret Number Operator Selector */}
        {isSecretNumber && (
          <div className="bg-card rounded-2xl p-4 shadow-card space-y-3 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground">تحويل عبر الرقم السري</p>
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
              <div className="flex items-center gap-2 bg-operator-mtn/10 rounded-xl px-3 py-2.5 flex-1 border border-operator-mtn/20">
                <RadioGroupItem value="mtn" id="s-mtn" />
                <Label htmlFor="s-mtn" className="text-sm font-bold cursor-pointer text-operator-mtn">MTN</Label>
              </div>
              <div className="flex items-center gap-2 bg-operator-syriatel/10 rounded-xl px-3 py-2.5 flex-1 border border-operator-syriatel/20">
                <RadioGroupItem value="syriatel" id="s-syr" />
                <Label htmlFor="s-syr" className="text-sm font-bold cursor-pointer text-operator-syriatel">Syriatel</Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Preset Amounts */}
        {transferOperator && currentPresets.length > 0 && (
          <div className="space-y-2.5 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground px-1">اختر المبلغ</p>
            <div className="grid grid-cols-3 gap-2.5 max-h-[260px] overflow-y-auto scrollbar-thin pr-0.5">
              {currentPresets.map((preset, i) => {
                const isSelected = selectedAmount?.amount === preset.amount;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedAmount(preset)}
                    className={cn(
                      "flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 active:scale-95",
                      isSelected
                        ? transferOperator === "mtn"
                          ? "border-operator-mtn bg-operator-mtn/10 shadow-card"
                          : "border-operator-syriatel bg-operator-syriatel/10 shadow-card"
                        : "border-border bg-card hover:border-primary/30 hover:shadow-card"
                    )}
                  >
                    <span className="text-lg font-bold text-foreground">
                      {preset.price.toLocaleString()}
                    </span>
                    <span className={cn(
                      "text-sm mt-1 font-medium",
                      isSelected
                        ? transferOperator === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"
                        : "text-muted-foreground"
                    )}>
                      {preset.amount.toLocaleString()}
                    </span>
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
          className="w-full h-14 text-base font-bold rounded-xl shadow-elevated"
          size="lg"
        >
          {dialing ? <Loader2 className="w-5 h-5 me-2 animate-spin" /> : <Send className="w-5 h-5 me-2" />}
          تحويل
        </Button>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent dir="rtl" className="rounded-2xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">تأكيد التحويل</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <div className="bg-muted rounded-xl p-4 space-y-2.5">
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
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">المشغّل</span>
                    <span className={cn(
                      "font-bold px-2.5 py-1 rounded-full text-xs",
                      transferOperator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
                    )}>
                      {transferOperator === "mtn" ? "MTN" : "Syriatel"}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={handleConfirmTransfer} className="rounded-xl flex-1 h-12">تأكيد التحويل</AlertDialogAction>
              <AlertDialogCancel className="rounded-xl h-12">إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Phone stats + history */}
        {phoneStats && (
          <div className="space-y-3 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <TrendingUp className="w-3.5 h-3.5" />
              ملخص التحويلات لهذا الرقم
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[{ label: "اليوم", sum: phoneStats.todaySum, count: phoneStats.todayCount },
                { label: "الأسبوع", sum: phoneStats.weekSum, count: phoneStats.weekCount },
                { label: "الشهر", sum: phoneStats.monthSum, count: phoneStats.monthCount },
                { label: "الإجمالي", sum: phoneStats.totalSum, count: phoneStats.totalCount }].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-2.5 text-center shadow-card">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{stat.label}</p>
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
                  className="flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-2.5 shadow-card"
                >
                  <span className="text-xs text-muted-foreground">
                    {new Date(record.timestamp).toLocaleDateString("ar-SY", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-sm">
                      {Number(record.amount).toLocaleString()}
                    </span>
                    {record.transferType === "secret" && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium leading-none">
                        🔑
                      </span>
                    )}
                    <CheckCircle className="w-4 h-4 text-success" />
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
