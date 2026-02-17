import { useState, useEffect, useMemo, useRef } from "react";
import { Phone, Hash, Settings, Zap, Clock } from "lucide-react";
import {
  detectOperator,
  buildUssdCode,
  dialUssd,
  getPresets,
  type Operator,
  type AmountPreset,
} from "@/lib/ussd-profiles";
import {
  addToHistory,
  getMatchingContacts,
  getHistoryForPhone,
  type TransferRecord,
} from "@/lib/transfer-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [presets, setPresets] = useState(() => getPresets());
  const [showContacts, setShowContacts] = useState(false);
  const [phoneHistory, setPhoneHistory] = useState<TransferRecord[]>([]);
  const contactsRef = useRef<HTMLDivElement>(null);

  const operator = useMemo(() => detectOperator(phone), [phone]);
  const currentPresets: AmountPreset[] = operator ? presets[operator] : [];
  const matchingContacts = useMemo(() => getMatchingContacts(phone), [phone]);

  // Load history for selected phone
  useEffect(() => {
    if (phone.length >= 10) {
      setPhoneHistory(getHistoryForPhone(phone));
    } else {
      setPhoneHistory([]);
    }
  }, [phone]);

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

  const handleDial = () => {
    if (!phone.trim() || phone.trim().length < 10) {
      toast.error("الرجاء إدخال رقم هاتف صحيح");
      return;
    }
    if (!operator) {
      toast.error("لم يتم التعرف على المشغّل");
      return;
    }
    if (!amount.trim()) {
      toast.error("الرجاء إدخال المبلغ");
      return;
    }
    const ussd = buildUssdCode(operator, phone.trim(), amount.trim());

    // Save to history
    addToHistory({
      phone: phone.trim(),
      amount: amount.trim(),
      operator,
      timestamp: Date.now(),
    });

    dialUssd(ussd);
  };

  const selectContact = (contact: string) => {
    setPhone(contact);
    setShowContacts(false);
  };

  const ussdPreview =
    operator && phone && amount
      ? buildUssdCode(operator, phone, amount)
      : null;

  // Refresh presets when returning from settings
  useEffect(() => {
    const handleFocus = () => setPresets(getPresets());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary px-4 py-5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary-foreground" />
          <h1 className="text-primary-foreground text-xl font-bold">تحويل رصيد</h1>
        </div>
        <button onClick={() => navigate("/settings")} className="text-primary-foreground">
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        <div className="mt-4 space-y-5">
          {/* Phone Input with autocomplete */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Phone className="w-4 h-4" />
              رقم الهاتف
            </label>
            <div className="relative" ref={contactsRef}>
              <Input
                type="tel"
                placeholder="09XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setShowContacts(true)}
                className="text-left text-lg h-12 tracking-wider"
                dir="ltr"
                inputMode="tel"
              />
              {/* Contacts dropdown */}
              {showContacts && matchingContacts.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {matchingContacts.map((contact) => {
                    const op = detectOperator(contact);
                    return (
                      <button
                        key={contact}
                        onClick={() => selectContact(contact)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted transition-colors text-left"
                        dir="ltr"
                      >
                        <span className="font-mono text-foreground tracking-wider">{contact}</span>
                        {op && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
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
            {/* Operator indicator */}
            {phone.length >= 3 && (
              <div className="flex items-center gap-2">
                {operator ? (
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
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

          {/* Previous transfers for this phone */}
          {phoneHistory.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                تحويلات سابقة لهذا الرقم
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[...new Set(phoneHistory.map((h) => h.amount))].slice(0, 5).map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-bold transition-all active:scale-95 ${
                      amount === amt
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-card-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    {Number(amt).toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Hash className="w-4 h-4" />
              المبلغ
            </label>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-left text-lg h-12 tracking-wider"
              dir="ltr"
              inputMode="numeric"
            />
          </div>

          {/* Preset Amounts */}
          {operator && currentPresets.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">مبالغ جاهزة</p>
              <div className="grid grid-cols-3 gap-2">
                {currentPresets.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setAmount(String(preset.amount))}
                    className={`flex flex-col items-center p-3 rounded-lg border transition-all active:scale-95 ${
                      amount === String(preset.amount)
                        ? operator === "mtn"
                          ? "border-operator-mtn bg-operator-mtn/10"
                          : "border-operator-syriatel bg-operator-syriatel/10"
                        : "border-border bg-card hover:border-muted-foreground/30"
                    }`}
                  >
                    <span className="font-bold text-card-foreground text-sm">
                      {preset.amount.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {preset.price.toLocaleString()} ل.س
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* USSD Preview */}
          {ussdPreview && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">كود USSD</p>
              <p className="font-mono text-foreground text-lg tracking-wider" dir="ltr">
                {ussdPreview}
              </p>
            </div>
          )}

          {/* Dial Button */}
          <Button
            onClick={handleDial}
            disabled={!operator || !amount}
            className="w-full h-14 text-lg font-bold rounded-xl shadow-lg"
            size="lg"
          >
            <Phone className="w-5 h-5 ml-2" />
            اتصال
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
