import { useState, useMemo, useEffect, useCallback } from "react";
import { Wallet, RefreshCw, Clock, TrendingDown, Loader2, AlertTriangle, CheckCircle2, Banknote } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import {
  buildBalanceCode,
  getCredentials,
  getSimAssignment,
  getPresets,
  type Operator,
} from "@/lib/ussd-profiles";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { getHistory } from "@/lib/transfer-history";
import {
  getBalance,
  getEstimatedBalance,
  setBalance,
  getTimeSince,
  checkAndWarnLowBalance,
  getLowBalanceThresholds,
} from "@/lib/balance-tracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Balance = () => {
  const [balances, setBalances] = useState(() => ({
    mtn: getBalance("mtn"),
    syriatel: getBalance("syriatel"),
  }));
  const [estimatedBalances, setEstimatedBalances] = useState(() => ({
    mtn: getEstimatedBalance("mtn"),
    syriatel: getEstimatedBalance("syriatel"),
  }));
  const [checkingOp, setCheckingOp] = useState<Operator | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogOperator, setDialogOperator] = useState<Operator>("mtn");
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const history = useMemo(() => getHistory().filter(r => r.status === "success"), []);
  const presets = useMemo(() => getPresets(), []);
  const thresholds = useMemo(() => getLowBalanceThresholds(), []);

  useEffect(() => {
    setBalances({
      mtn: getBalance("mtn"),
      syriatel: getBalance("syriatel"),
    });
    setEstimatedBalances({
      mtn: getEstimatedBalance("mtn"),
      syriatel: getEstimatedBalance("syriatel"),
    });

    checkAndWarnLowBalance("mtn", toast.warning);
    checkAndWarnLowBalance("syriatel", toast.warning);
  }, []);

  const refreshData = useCallback(() => {
    setBalances({
      mtn: getBalance("mtn"),
      syriatel: getBalance("syriatel"),
    });
    setEstimatedBalances({
      mtn: getEstimatedBalance("mtn"),
      syriatel: getEstimatedBalance("syriatel"),
    });
  }, []);

  const handleBalanceCheck = async (operator: Operator) => {
    const credentials = getCredentials();
    const simAssignment = getSimAssignment();
    const ussd = buildBalanceCode(operator, credentials);
    const simSlot = simAssignment[operator];

    setCheckingOp(operator);
    try {
      await dialUssdDirect(ussd, simSlot);
      toast.success(`تم إرسال طلب الرصيد — ${operator === "mtn" ? "MTN" : "Syriatel"}`);
      setDialogOperator(operator);
      setInputValue("");
      setInputError("");
      setDialogOpen(true);
    } catch {
      toast.error("فشل إرسال طلب الرصيد");
    } finally {
      setCheckingOp(null);
    }
  };

  const handleDialogConfirm = () => {
    const val = inputValue.trim();
    if (!val) {
      setInputError("الرجاء إدخال الرصيد");
      return;
    }
    const num = Number(val);
    if (isNaN(num) || num < 0) {
      setInputError("الرجاء إدخال رقم صحيح");
      return;
    }
    if (num === 0) {
      setInputError("الرصيد لا يمكن أن يكون صفراً");
      return;
    }
    setBalance(dialogOperator, num);
    setDialogOpen(false);
    setInputValue("");
    setInputError("");
    refreshData();
    toast.success(`تم حفظ رصيد ${dialogOperator === "mtn" ? "MTN" : "Syriatel"}: ${num.toLocaleString()} ل.س`);
  };

  const getSpentSince = (operator: Operator) => {
    const saved = balances[operator];
    if (!saved) return { totalAmount: 0, totalPrice: 0, count: 0 };

    const transfers = history.filter(
      (r) => r.operator === operator && r.timestamp > saved.timestamp
    );

    let totalPrice = 0;
    const operatorPresets = presets[operator] || [];

    transfers.forEach((r) => {
      const amt = Number(r.amount);
      const preset = operatorPresets.find((p) => p.amount === amt);
      totalPrice += preset ? preset.price : 0;
    });

    return {
      totalAmount: transfers.reduce((s, r) => s + Number(r.amount), 0),
      totalPrice,
      count: transfers.length,
    };
  };

  const lowBalanceWarnings = useMemo(() => {
    const warnings: Operator[] = [];
    (["mtn", "syriatel"] as Operator[]).forEach((op) => {
      const est = estimatedBalances[op];
      if (est !== null && est <= thresholds[op]) {
        warnings.push(op);
      }
    });
    return warnings;
  }, [estimatedBalances, thresholds]);

  const OperatorCard = ({ operator }: { operator: Operator }) => {
    const isMtn = operator === "mtn";
    const saved = balances[operator];
    const estimated = estimatedBalances[operator];
    const spent = getSpentSince(operator);
    const isChecking = checkingOp === operator;
    const isLow = lowBalanceWarnings.includes(operator);

    return (
      <div className={cn(
        "bg-white rounded-2xl shadow-sm border overflow-hidden animate-slide-up transition-all duration-300",
        isLow ? "border-accent/40 ring-1 ring-accent/20" : "border-border/60"
      )}>
        {/* Card Header */}
        <div className={cn(
          "px-5 py-4 flex items-center justify-between",
          isMtn ? "bg-operator-mtn" : "bg-operator-syriatel"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              isMtn ? "bg-black/10" : "bg-white/15"
            )}>
              <Wallet className={cn("w-5.5 h-5.5", isMtn ? "text-operator-mtn-foreground" : "text-white")} />
            </div>
            <div>
              <span className={cn("font-bold text-lg block", isMtn ? "text-operator-mtn-foreground" : "text-white")}>
                {isMtn ? "MTN" : "Syriatel"}
              </span>
              {isLow && (
                <span className="flex items-center gap-1 text-[10px] font-semibold mt-0.5 text-accent-foreground/80">
                  <AlertTriangle className="w-3 h-3" />
                  رصيد منخفض
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => handleBalanceCheck(operator)}
            disabled={isChecking}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 backdrop-blur-sm disabled:opacity-50",
              isMtn
                ? "bg-black/15 text-operator-mtn-foreground hover:bg-black/25"
                : "bg-white/15 text-white hover:bg-white/25"
            )}
          >
            {isChecking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {isChecking ? "جاري..." : "استعلام"}
          </button>
        </div>

        {/* Card Body */}
        <div className="p-5 space-y-4">
          {estimated !== null ? (
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground font-medium">الرصيد المتوقع</p>
              <p className={cn(
                "text-4xl font-bold tracking-tight transition-colors",
                isMtn ? "text-operator-mtn" : "text-operator-syriatel",
                isLow && "text-accent"
              )}>
                {estimated.toLocaleString()}
              </p>
              {saved && (
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  آخر تحديث: {getTimeSince(saved.timestamp)}
                </p>
              )}
              {isLow && (
                <p className="text-[11px] text-accent font-semibold flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  الرصيد أقل من الحد الأدنى ({thresholds[operator].toLocaleString()} ل.س)
                </p>
              )}
            </div>
          ) : saved ? (
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground font-medium">آخر رصيد معروف</p>
              <p className={cn(
                "text-4xl font-bold tracking-tight",
                isMtn ? "text-operator-mtn" : "text-operator-syriatel"
              )}>
                {saved.amount.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                <Clock className="w-3 h-3" />
                آخر تحديث: {getTimeSince(saved.timestamp)}
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Banknote className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">لم يتم إدخال الرصيد بعد</p>
              <p className="text-[11px] text-muted-foreground mt-1">اضغط "استعلام" للتحقق من الرصيد</p>
            </div>
          )}

          {saved && spent.count > 0 && (
            <div className="bg-muted/60 rounded-xl p-4 space-y-2.5 border border-border/50">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <TrendingDown className="w-3.5 h-3.5" />
                التحويلات منذ آخر تحديث
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{spent.count} عملية</span>
                <span className="font-bold text-destructive">-{spent.totalAmount.toLocaleString()}</span>
              </div>
              {spent.totalPrice > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">التكلفة</span>
                  <span className="font-bold text-foreground">{spent.totalPrice.toLocaleString()} ل.س</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-border/60 pt-2.5">
                <span className="text-muted-foreground">الرصيد الأصلي</span>
                <span className="font-bold text-foreground">{saved.amount.toLocaleString()}</span>
              </div>
            </div>
          )}

          {saved && spent.count === 0 && (
            <div className="bg-success/5 rounded-xl p-3 border border-success/20 text-center">
              <p className="text-xs text-success font-medium">لا توجد تحويلات منذ آخر تحديث</p>
            </div>
          )}

          <Button
            onClick={() => {
              setDialogOperator(operator);
              setInputValue("");
              setInputError("");
              setDialogOpen(true);
            }}
            variant="outline"
            className="w-full h-12 text-sm rounded-xl border-2"
          >
            <CheckCircle2 className="w-4 h-4 me-1.5" />
            {saved ? "تحديث الرصيد يدوياً" : "إدخال الرصيد"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="الرصيد">
      <main className="flex-1 w-full max-w-lg mx-auto p-3 flex flex-col gap-3 pb-4" dir="rtl">
        <OperatorCard operator="mtn" />
        <OperatorCard operator="syriatel" />
      </main>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setInputError(""); } }}>
        <DialogContent className="rounded-2xl max-w-sm mx-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">ما هو الرصيد الحالي؟</DialogTitle>
            <DialogDescription className="text-center">
              أدخل الرصيد الذي ظهر في رسالة الاستعلام لـ {dialogOperator === "mtn" ? "MTN" : "Syriatel"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/60 rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  dialogOperator === "mtn" ? "bg-operator-mtn" : "bg-operator-syriatel"
                )}>
                  <Wallet className={cn(
                    "w-6 h-6",
                    dialogOperator === "mtn" ? "text-operator-mtn-foreground" : "text-white"
                  )} />
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground">{dialogOperator === "mtn" ? "MTN" : "Syriatel"}</p>
                  <p className="text-[11px] text-muted-foreground">الرصيد الحالي بعد الاستعلام</p>
                </div>
              </div>
            </div>

            <Input
              type="number"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setInputError(""); }}
              placeholder="مثال: 50000"
              className={cn(
                "h-14 text-center text-xl font-bold rounded-xl border-2 bg-background/50",
                inputError ? "border-destructive" : ""
              )}
              dir="ltr"
              inputMode="numeric"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleDialogConfirm()}
            />
            {inputError && (
              <p className="text-xs text-destructive font-medium text-center">{inputError}</p>
            )}
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={handleDialogConfirm}
              className="flex-1 h-12 text-base font-bold rounded-xl shadow-sm"
            >
              تأكيد
            </Button>
            <Button
              onClick={() => { setDialogOpen(false); setInputError(""); }}
              variant="outline"
              className="flex-1 h-12 text-base rounded-xl"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Balance;
