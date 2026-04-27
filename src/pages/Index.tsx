import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { Phone, Clock, CheckCircle, Loader2, Send, TrendingUp, BookUser, UserPlus, Contact, AlertTriangle } from "lucide-react";
import {
  detectOperator,
  buildUssdCode,
  getPresets,
  getCredentials,
  getSimAssignment,
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
import { getAppStatus, type AppLicenseStatus } from "@/lib/license";
import { checkExpiryWarning, shouldShowDailyNotification, markNotificationShown, type ExpiryWarning } from "@/lib/expiry-warning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
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
  const [history, setHistory] = useState<TransferRecord[]>(() => getHistory());
  const [dialing, setDialing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [showSaveName, setShowSaveName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [expiryWarning, setExpiryWarning] = useState<ExpiryWarning>({ show: false, daysLeft: Infinity, type: 'trial', message: '' });
  
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
  const currentPresets: AmountPreset[] = operator ? presets[operator] : [];
  const matchingContacts = useMemo(() => getMatchingContacts(phone), [phone]);

  // Check expiry warning on mount
  useEffect(() => {

  async function checkLicense() {

      const status = await getAppStatus();

      if (
        status.status === "trial_expired" ||
        status.status === "license_expired"
      ) {
        navigate("/activation");
        return;
      }

    }

    checkLicense();

  }, []);
  // useEffect(() => {
  //   getAppStatus().then((status) => {
  //     const warning = checkExpiryWarning(status);
  //     setExpiryWarning(warning);
  //     if (warning.show && shouldShowDailyNotification()) {
  //       toast.warning(warning.message, { duration: 8000 });
  //       markNotificationShown();
  //     }
  //   });
  // }, []);

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
  }, [operator]);

  const handleTransferClick = useCallback(() => {
    if (!phone.trim() || phone.trim().length < 10) {
      toast.error("الرجاء إدخال رقم هاتف صحيح");
      return;
    }
    if (!operator) {
      toast.error("لم يتم التعرف على المشغّل");
      return;
    }
    if (!selectedAmount) {
      toast.error("الرجاء اختيار المبلغ");
      return;
    }
    setShowConfirm(true);
  }, [phone, operator, selectedAmount]);

  const handleConfirmTransfer = useCallback(async () => {
    if (!operator || !selectedAmount) return;
    setShowConfirm(false);
    const ussd = buildUssdCode(operator, phone.trim(), String(selectedAmount.amount), credentials);
    const simAssignment = getSimAssignment();
    const simSlot = simAssignment[operator];

    setDialing(true);

    try {
      await dialUssdDirect(ussd, simSlot);

      addToHistory({
        phone: phone.trim(),
        amount: String(selectedAmount.amount),
        operator,
        timestamp: Date.now(),
        status: "success",
      });
      setHistory(getHistory());
      trackTransfer(phone.trim(), String(selectedAmount.amount), operator, "success");

      toast.success("تم إرسال الطلب بنجاح ✓");

      setPhone("");
      setSelectedAmount(null);
    } catch {
      toast.error("فشل إرسال الطلب");
    } finally {
      setDialing(false);
    }
  }, [phone, operator, selectedAmount, credentials]);

  const selectContact = (contact: SavedContact) => {
    setPhone(contact.phone);
    setContactName(contact.name || '');
    setShowContacts(false);
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

  const getGradientColor = (index: number, total: number) => {
    const ratio = index / (total - 1 || 1);

    // أبيض → أخضر فاتح → لون التطبيق
    const start = [255, 255, 255];        // أبيض
    const mid = [144, 238, 144];          // أخضر فاتح
    const end = [35, 141, 106];           // لون التطبيق

    let color: number[];
    if (ratio < 0.5) {
      const localRatio = ratio / 0.5;
      color = start.map((c, i) => Math.round(c + (mid[i] - c) * localRatio));
    } else {
      const localRatio = (ratio - 0.5) / 0.5;
      color = mid.map((c, i) => Math.round(c + (end[i] - c) * localRatio));
    }

    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  };

  return (
    <AppLayout title="تحويل رصيد" onTitleClick={handleTitleTap}>
      <main className="flex-1 p-3 w-full space-y-3 overflow-y-auto pb-4">
        
        {/* Expiry Warning Banner */}
        {expiryWarning.show && (
          <button
            onClick={() => navigate('/subscription')}
            className="w-full bg-accent/15 border border-accent/30 rounded-2xl p-3 flex items-center gap-3 animate-slide-up"
          >
            <AlertTriangle className="w-5 h-5 text-accent shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-xs font-bold text-foreground">{expiryWarning.message}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">اضغط هنا لتجديد الاشتراك</p>
            </div>
          </button>
        )}
        {/* Phone Input Card */}
        <div className="bg-card rounded-2xl p-4 shadow-card space-y-2 animate-slide-up">
          <div className="relative" ref={contactsRef}>
            <Input
              type="tel"
              placeholder="رقم أو اسم جهة الاتصال"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setContactName(''); setShowSaveName(false); setNameInput(''); }}
              onFocus={() => setShowContacts(true)}
              className="text-left text-base h-12 tracking-wider rounded-xl border-2 border-border focus:border-primary transition-smooth pl-11"
              dir="ltr"
              inputMode="tel"
            />
            <button
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
                      ? "تم رفض صلاحية جهات الاتصال. فعّلها من إعدادات التطبيق"
                      : `تعذر فتح سجل الاتصال: ${msg || err}`
                  );
                }
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-muted transition-smooth text-muted-foreground hover:text-primary"
              title="اختيار من سجل الهاتف"
            >
              <Contact className="w-5 h-5" />
            </button>
            {showContacts && matchingContacts.length > 0 && (
              <div className="absolute z-10 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-elevated max-h-48 overflow-y-auto">
                {matchingContacts.map((contact) => {
                  const op = detectOperator(contact.phone);
                  return (
                    <button
                      key={contact.phone}
                      onClick={() => selectContact(contact)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-smooth text-left first:rounded-t-xl last:rounded-b-xl"
                      dir="ltr"
                    >
                      <div className="flex flex-col">
                        {contact.name && (
                          <span className="text-xs font-medium text-foreground" dir="rtl">{contact.name}</span>
                        )}
                        <span className="font-mono text-muted-foreground text-sm tracking-wider">{contact.phone}</span>
                      </div>
                      {op && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            op === "mtn"
                              ? "bg-operator-mtn text-operator-mtn-foreground"
                              : "bg-operator-syriatel text-operator-syriatel-foreground"
                          }`}
                        >
                          {op === "mtn" ? "MTN" : "SYR"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Contact name + operator badge */}
          {phone.length >= 10 && operator && (
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  operator === "mtn"
                    ? "bg-operator-mtn text-operator-mtn-foreground"
                    : "bg-operator-syriatel text-operator-syriatel-foreground"
                }`}
              >
                {operator === "mtn" ? "MTN" : "Syriatel"}
              </span>
              {contactName ? (
                <span className="text-xs text-foreground font-medium flex items-center gap-1">
                  <BookUser className="w-3 h-3 text-primary" />
                  {contactName}
                </span>
              ) : !showSaveName ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-lg px-3 border-primary/30 text-primary"
                  onClick={() => { setShowSaveName(true); setNameInput(''); }}
                >
                  <UserPlus className="w-3.5 h-3.5 ml-1" />
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

        {/* Preset Amounts with gradient coloring */}
        {operator && currentPresets.length > 0 && (
          <div className="space-y-2 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground px-1">اختر المبلغ</p>
            <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
              {currentPresets.map((preset, i) => {
                const bgColor = getGradientColor(i, currentPresets.length);
                const borderColor =
                  selectedAmount?.amount === preset.amount
                    ? operator === "mtn"
                      ? "border-operator-mtn"
                      : "border-operator-syriatel"
                    : "border-border";
                const shadow = selectedAmount?.amount === preset.amount ? "shadow-card" : "";

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedAmount(preset)}
                    style={{ backgroundColor: bgColor }}
                    className={`flex flex-col items-center p-2.5 rounded-xl border-2 transition-smooth active:scale-95 ${borderColor} ${shadow}`}
                  >
                    <span className="text-lg font-bold text-black">
                      {preset.price.toLocaleString()} 
                    </span>
                    <span className="text-[17px] mt-1 text-black">
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
          disabled={!operator || !selectedAmount || dialing}
          className="w-full h-12 text-base font-bold rounded-xl shadow-elevated hover:shadow-card transition-smooth"
          size="lg"
        >
          {dialing ? <Loader2 className="w-5 h-5 ml-2 animate-spin" /> : <Send className="w-5 h-5 ml-2" />}
          تحويل
        </Button>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent dir="rtl" className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">تأكيد التحويل</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <div className="bg-muted rounded-xl p-4 space-y-2">
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
                    <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                      operator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
                    }`}>
                      {operator === "mtn" ? "MTN" : "Syriatel"}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={handleConfirmTransfer} className="rounded-xl flex-1">تأكيد التحويل</AlertDialogAction>
              <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Phone stats + history */}
        {phoneStats && (
          <div className="space-y-2 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <TrendingUp className="w-3.5 h-3.5" />
              ملخص التحويلات لهذا الرقم
            </p>

            <div className="grid grid-cols-4 gap-1.5">
              {[{ label: "اليوم", sum: phoneStats.todaySum, count: phoneStats.todayCount },
                { label: "الأسبوع", sum: phoneStats.weekSum, count: phoneStats.weekCount },
                { label: "الشهر", sum: phoneStats.monthSum, count: phoneStats.monthCount },
                { label: "الإجمالي", sum: phoneStats.totalSum, count: phoneStats.totalCount }].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-2 text-center shadow-card">
                  <p className="text-[9px] text-muted-foreground">{stat.label}</p>
                  <p className="text-xs font-bold text-foreground">{stat.sum.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">{stat.count}×</p>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <Clock className="w-3.5 h-3.5" />
              آخر العمليات
            </p>
            <div className="space-y-1 max-h-[130px] overflow-y-auto">
              {phoneHistory.slice(0, 10).map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-card"
                >
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(record.timestamp).toLocaleDateString("ar-SY", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      {Number(record.amount).toLocaleString()}
                    </span>
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