import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Phone, Settings, Zap, Clock, CheckCircle, Loader2, BarChart3, Wallet } from "lucide-react";
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

const Index = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<AmountPreset | null>(null);
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [showContacts, setShowContacts] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>(() => getHistory());
  const [dialing, setDialing] = useState(false);
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

  const handleDial = useCallback(async () => {
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
      <header className="bg-primary px-3 py-2 flex items-center justify-between shadow-md pt-safe">
        <div className="flex items-center gap-2" onClick={handleTitleTap}>
          <Zap className="w-5 h-5 text-primary-foreground" />
          <h1 className="text-primary-foreground text-lg font-bold select-none">تحويل رصيد</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/balance")} className="text-primary-foreground p-1">
            <Wallet className="w-6 h-6" />
          </button>
          <button onClick={() => navigate("/reports")} className="text-primary-foreground p-1">
            <BarChart3 className="w-6 h-6" />
          </button>
          <button onClick={() => navigate("/settings")} className="text-primary-foreground p-1">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-2 max-w-md mx-auto w-full space-y-2 overflow-y-auto pb-safe">
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

        {/* Dial Button */}
        <Button
          onClick={handleDial}
          disabled={!operator || !selectedAmount || dialing}
          className="w-full h-11 text-base font-bold rounded-xl shadow-lg"
          size="lg"
        >
          {dialing ? (
            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
          ) : (
            <Phone className="w-5 h-5 ml-2" />
          )}
          اتصال
        </Button>

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
    </div>
  );
};

export default Index;
