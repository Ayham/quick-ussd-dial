import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Phone, Settings, Zap, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  detectOperator,
  buildUssdCode,
  dialUssd,
  getPresets,
  getCredentials,
  type Operator,
  type AmountPreset,
  type OperatorCredentials,
} from "@/lib/ussd-profiles";
import {
  addToHistory,
  getMatchingContacts,
  getHistory,
  updateLastRecordStatus,
  type TransferRecord,
} from "@/lib/transfer-history";
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
  const [pendingDial, setPendingDial] = useState(false);
  const contactsRef = useRef<HTMLDivElement>(null);

  const operator = useMemo(() => detectOperator(phone), [phone]);
  const currentPresets: AmountPreset[] = operator ? presets[operator] : [];
  const matchingContacts = useMemo(() => getMatchingContacts(phone), [phone]);

  // Close contacts dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactsRef.current && !contactsRef.current.contains(e.target as Node)) {
        setShowContacts(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Refresh presets when returning from settings
  useEffect(() => {
    const handleFocus = () => {
      setPresets(getPresets());
      setCredentials(getCredentials());
      setHistory(getHistory());
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Reset selected amount when operator changes
  useEffect(() => {
    setSelectedAmount(null);
  }, [operator]);

  const handleDial = useCallback(() => {
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

    // Add as pending
    addToHistory({
      phone: phone.trim(),
      amount: String(selectedAmount.amount),
      operator,
      timestamp: Date.now(),
      status: "pending",
    });
    setHistory(getHistory());
    setPendingDial(true);

    // Dial immediately
    dialUssd(ussd);

    // Show confirmation dialog after dialing
    setTimeout(() => {
      setPendingDial(false);
    }, 2000);
  }, [phone, operator, selectedAmount, credentials]);

  const markLastStatus = useCallback((status: "success" | "failed") => {
    updateLastRecordStatus(status);
    setHistory(getHistory());
    if (status === "success") {
      toast.success("تم التحويل بنجاح ✓");
    } else {
      toast.error("فشل التحويل ✗");
    }
  }, []);

  const selectContact = (contact: string) => {
    setPhone(contact);
    setShowContacts(false);
  };

  const phoneHistory = useMemo(
    () => history.filter((r) => !phone || r.phone.includes(phone)).slice(0, 20),
    [history, phone]
  );

  const hasPending = history.length > 0 && history[0].status === "pending";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary px-3 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary-foreground" />
          <h1 className="text-primary-foreground text-lg font-bold">تحويل رصيد</h1>
        </div>
        <button onClick={() => navigate("/settings")} className="text-primary-foreground">
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-3 max-w-md mx-auto w-full space-y-3">
        {/* Phone Input */}
        <div className="space-y-1.5">
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
              <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {matchingContacts.map((contact) => {
                  const op = detectOperator(contact);
                  return (
                    <button
                      key={contact}
                      onClick={() => selectContact(contact)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors text-left"
                      dir="ltr"
                    >
                      <span className="font-mono text-foreground text-sm tracking-wider">{contact}</span>
                      {op && (
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
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
          {phone.length >= 3 && (
            <div className="flex items-center gap-2">
              {operator ? (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                    operator === "mtn"
                      ? "bg-operator-mtn text-operator-mtn-foreground"
                      : "bg-operator-syriatel text-operator-syriatel-foreground"
                  }`}
                >
                  {operator === "mtn" ? "MTN" : "Syriatel"}
                </span>
              ) : (
                <span className="text-xs text-destructive">رقم غير معروف</span>
              )}
            </div>
          )}
        </div>

        {/* Preset Amounts - shown directly */}
        {operator && currentPresets.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">اختر المبلغ</p>
            <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
              {currentPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAmount(preset)}
                  className={`flex flex-col items-center p-2 rounded-lg border transition-all active:scale-95 ${
                    selectedAmount?.amount === preset.amount
                      ? operator === "mtn"
                        ? "border-operator-mtn bg-operator-mtn/10 ring-1 ring-operator-mtn"
                        : "border-operator-syriatel bg-operator-syriatel/10 ring-1 ring-operator-syriatel"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="font-bold text-card-foreground text-xs">
                    {preset.amount.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
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
          disabled={!operator || !selectedAmount || pendingDial}
          className="w-full h-12 text-base font-bold rounded-xl shadow-lg"
          size="lg"
        >
          {pendingDial ? (
            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
          ) : (
            <Phone className="w-5 h-5 ml-2" />
          )}
          اتصال
        </Button>

        {/* Confirm status buttons (shown when pending) */}
        {hasPending && (
          <div className="flex gap-2">
            <Button
              onClick={() => markLastStatus("success")}
              className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 ml-1" />
              نجحت
            </Button>
            <Button
              onClick={() => markLastStatus("failed")}
              variant="destructive"
              className="flex-1 h-10"
            >
              <XCircle className="w-4 h-4 ml-1" />
              فشلت
            </Button>
          </div>
        )}

        {/* Transfer History */}
        {phoneHistory.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              التحويلات السابقة
            </p>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {phoneHistory.map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-foreground text-xs" dir="ltr">
                      {record.phone}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(record.timestamp).toLocaleDateString("ar-SY", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-xs">
                      {Number(record.amount).toLocaleString()}
                    </span>
                    {record.status === "success" && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {record.status === "failed" && (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    {record.status === "pending" && (
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                    )}
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
