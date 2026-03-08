import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { Phone, Clock, CheckCircle, Loader2, Send, TrendingUp } from "lucide-react";
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
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { trackTransfer } from "@/lib/cloud-sync";
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

  const selectContact = (contact: string) => {
    setPhone(contact);
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

  return (
    <AppLayout title="تحويل رصيد" onTitleClick={handleTitleTap}>
      <main className="flex-1 p-3 w-full space-y-3 overflow-y-auto pb-4">
        
        {/* Phone Input Card */}
        <div className="bg-card rounded-2xl p-4 shadow-card space-y-2 animate-slide-up">
          <label className="text-xs font-semibold text-foreground flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Phone className="w-3.5 h-3.5 text-primary" />
            </div>
            رقم الهاتف
          </label>
          <div className="relative" ref={contactsRef}>
            <Input
              type="tel"
              placeholder="09XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={() => setShowContacts(true)}
              className="text-left text-base h-12 tracking-wider rounded-xl border-2 border-border focus:border-primary transition-smooth"
              dir="ltr"
              inputMode="tel"
            />
            {showContacts && matchingContacts.length > 0 && (
              <div className="absolute z-10 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-elevated max-h-40 overflow-y-auto">
                {matchingContacts.map((contact) => {
                  const op = detectOperator(contact);
                  return (
                    <button
                      key={contact}
                      onClick={() => selectContact(contact)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-smooth text-left first:rounded-t-xl last:rounded-b-xl"
                      dir="ltr"
                    >
                      <span className="font-mono text-foreground text-sm tracking-wider">{contact}</span>
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
          {phone.length >= 3 && operator && (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                operator === "mtn"
                  ? "bg-operator-mtn text-operator-mtn-foreground"
                  : "bg-operator-syriatel text-operator-syriatel-foreground"
              }`}
            >
              {operator === "mtn" ? "MTN" : "Syriatel"}
            </span>
          )}
          {phone.length >= 3 && !operator && (
            <span className="text-[11px] text-destructive font-medium">رقم غير معروف</span>
          )}
        </div>

        {/* Preset Amounts */}
        {operator && currentPresets.length > 0 && (
          <div className="space-y-2 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground px-1">اختر المبلغ</p>
            <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
              {currentPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAmount(preset)}
                  className={`flex flex-col items-center p-2.5 rounded-xl border-2 transition-smooth active:scale-95 ${
                    selectedAmount?.amount === preset.amount
                      ? operator === "mtn"
                        ? "border-operator-mtn bg-operator-mtn/10 shadow-card"
                        : "border-operator-syriatel bg-operator-syriatel/10 shadow-card"
                      : "border-border bg-card hover:border-muted-foreground/30 hover:shadow-card"
                  }`}
                >
                  <span className="text-[11px] text-muted-foreground">
                    {preset.amount.toLocaleString()}
                  </span>
                  <span className="font-bold text-card-foreground text-sm mt-0.5">
                    {preset.price.toLocaleString()} ل.س
                  </span>
                </button>
              ))}
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
          {dialing ? (
            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
          ) : (
            <Send className="w-5 h-5 ml-2" />
          )}
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
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">الرقم</span>
                    <span className="font-bold text-foreground font-mono" dir="ltr">{phone.trim()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">المشغّل</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                      operator === "mtn" 
                        ? "bg-operator-mtn text-operator-mtn-foreground" 
                        : "bg-operator-syriatel text-operator-syriatel-foreground"
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

        {/* Phone-specific stats + history */}
        {phoneStats && (
          <div className="space-y-2 animate-slide-up">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 px-1">
              <TrendingUp className="w-3.5 h-3.5" />
              ملخص التحويلات لهذا الرقم
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "اليوم", sum: phoneStats.todaySum, count: phoneStats.todayCount },
                { label: "الأسبوع", sum: phoneStats.weekSum, count: phoneStats.weekCount },
                { label: "الشهر", sum: phoneStats.monthSum, count: phoneStats.monthCount },
                { label: "الإجمالي", sum: phoneStats.totalSum, count: phoneStats.totalCount },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-2 text-center shadow-card">
                  <p className="text-[9px] text-muted-foreground">{stat.label}</p>
                  <p className="text-xs font-bold text-foreground">{stat.sum.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">{stat.count}×</p>
                </div>
              ))}
            </div>

            {/* Recent records */}
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