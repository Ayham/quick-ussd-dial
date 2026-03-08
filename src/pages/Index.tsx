import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { Phone, Settings, Zap, Clock, CheckCircle, Loader2, BarChart3, Wallet, Send, Menu, X } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const handleConfirmTransfer = useCallback(async () => { // confirm transfer
    if (!operator || !selectedAmount) return;
    setShowConfirm(false);
    const ussd = buildUssdCode(operator, phone.trim(), String(selectedAmount.amount), credentials);
    const simAssignment = getSimAssignment();
    const simSlot = simAssignment[operator];

    setDialing(true);

    try {
      await dialUssdDirect(ussd, simSlot);

      // Log as completed immediately (one-click workflow)
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

      // Reset for next transfer
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

  // History filtered by entered phone number
  const phoneHistory = useMemo(
    () => (phone.trim().length >= 3 ? history.filter((r) => r.phone.includes(phone.trim())) : []).slice(0, 10),
    [history, phone]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets">
      {/* Header */}
      <header className="bg-primary px-3 py-2.5 flex items-center justify-between shadow-md pt-safe">
        <div className="flex items-center gap-2" onClick={handleTitleTap}>
          <Zap className="w-5 h-5 text-primary-foreground" />
          <h1 className="text-primary-foreground text-lg font-bold select-none">تحويل رصيد</h1>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-primary-foreground p-1 rounded-md hover:bg-primary-foreground/10 transition-colors">
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Slide-down Menu */}
      {menuOpen && (
        <div className="bg-card border-b border-border shadow-lg animate-in slide-in-from-top-2 duration-200">
          {[
            { icon: Wallet, label: "الرصيد", path: "/balance" },
            { icon: BarChart3, label: "التقارير", path: "/reports" },
            { icon: Settings, label: "الإعدادات", path: "/settings" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => { setMenuOpen(false); navigate(item.path); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted transition-colors border-b border-border last:border-b-0"
            >
              <item.icon className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 p-2 w-full space-y-2 overflow-y-auto pb-20">
        {/* Phone Input */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            رقم الهاتف
          </label>
          <div className="relative" ref={contactsRef}>
            <Input
              type="tel"
              placeholder="09XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={() => setShowContacts(true)}
              className="text-left text-base h-10 tracking-wider"
              dir="ltr"
              inputMode="tel"
            />
            {showContacts && matchingContacts.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-36 overflow-y-auto">
                {matchingContacts.map((contact) => {
                  const op = detectOperator(contact);
                  return (
                    <button
                      key={contact}
                      onClick={() => selectContact(contact)}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted transition-colors text-left"
                      dir="ltr"
                    >
                      <span className="font-mono text-foreground text-sm tracking-wider">{contact}</span>
                      {op && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
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
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                operator === "mtn"
                  ? "bg-operator-mtn text-operator-mtn-foreground"
                  : "bg-operator-syriatel text-operator-syriatel-foreground"
              }`}
            >
              {operator === "mtn" ? "MTN" : "Syriatel"}
            </span>
          )}
          {phone.length >= 3 && !operator && (
            <span className="text-[10px] text-destructive">رقم غير معروف</span>
          )}
        </div>

        {/* Preset Amounts - displayed in settings order */}
        {operator && currentPresets.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">اختر المبلغ</p>
            <div className="grid grid-cols-3 gap-1 max-h-[220px] overflow-y-auto">
              {currentPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAmount(preset)}
                  className={`flex flex-col items-center p-1.5 rounded-lg border transition-all active:scale-95 ${
                    selectedAmount?.amount === preset.amount
                      ? operator === "mtn"
                        ? "border-operator-mtn bg-operator-mtn/10 ring-1 ring-operator-mtn"
                        : "border-operator-syriatel bg-operator-syriatel/10 ring-1 ring-operator-syriatel"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {preset.amount.toLocaleString()}
                  </span>
                  <span className="font-bold text-card-foreground text-sm">
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
          className="w-full h-11 text-base font-bold rounded-xl shadow-lg"
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
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد التحويل</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-2">
                <span className="block">
                  سيتم تحويل مبلغ <strong className="text-foreground">{selectedAmount?.amount.toLocaleString()} ل.س</strong> إلى الرقم <strong className="text-foreground" dir="ltr">{phone.trim()}</strong>
                </span>
                <span className="block text-xs">
                  السعر: <strong className="text-foreground">{selectedAmount?.price.toLocaleString()} ل.س</strong> • المشغّل: <strong className="text-foreground">{operator === "mtn" ? "MTN" : "Syriatel"}</strong>
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={handleConfirmTransfer}>تأكيد التحويل</AlertDialogAction>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Phone-specific history */}
        {phoneHistory.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              سجل التحويلات لهذا الرقم
            </p>
            <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
              {phoneHistory.map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-card border border-border rounded-md px-2 py-1.5 text-xs"
                >
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(record.timestamp).toLocaleDateString("ar-SY", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground">
                      {Number(record.amount).toLocaleString()}
                    </span>
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border pb-safe" style={{ maxWidth: '100%' }}>
        <div className="flex items-stretch" style={{ maxWidth: '500px', margin: '0 auto' }}>
          {[
            { icon: Wallet, label: "الرصيد", path: "/balance" },
            { icon: BarChart3, label: "التقارير", path: "/reports" },
            { icon: Zap, label: "تحويل", path: "/", active: true },
            { icon: Settings, label: "الإعدادات", path: "/settings" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => item.active ? window.scrollTo(0, 0) : navigate(item.path)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                item.active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${item.active ? "text-primary" : ""}`} />
              <span className={`text-[10px] font-bold ${item.active ? "text-primary" : ""}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Index;
