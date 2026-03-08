import { useState, useMemo } from "react";
import { Wallet, RefreshCw, Edit, Check, TrendingDown, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BALANCE_STORAGE_KEY = "saved_balances_v1";

interface SavedBalance {
  amount: number;
  timestamp: number;
}

interface BalanceStore {
  mtn: SavedBalance | null;
  syriatel: SavedBalance | null;
}

function getSavedBalances(): BalanceStore {
  try {
    const stored = localStorage.getItem(BALANCE_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { mtn: null, syriatel: null };
}

function saveBalance(operator: Operator, amount: number) {
  const balances = getSavedBalances();
  balances[operator] = { amount, timestamp: Date.now() };
  localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(balances));
}

const Balance = () => {
  const navigate = useNavigate();
  const [balances, setBalances] = useState(() => getSavedBalances());
  const [editingOp, setEditingOp] = useState<Operator | null>(null);
  const [editValue, setEditValue] = useState("");
  const history = useMemo(() => getHistory().filter(r => r.status === "success"), []);
  const presets = useMemo(() => getPresets(), []);

  const getSpentSince = (operator: Operator): { totalAmount: number; totalPrice: number; count: number } => {
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

  const getEstimatedBalance = (operator: Operator): number | null => {
    const saved = balances[operator];
    if (!saved) return null;
    const spent = getSpentSince(operator);
    return Math.max(0, saved.amount - spent.totalAmount);
  };

  const handleBalanceCheck = async (operator: Operator) => {
    const credentials = getCredentials();
    const simAssignment = getSimAssignment();
    const ussd = buildBalanceCode(operator, credentials);
    const simSlot = simAssignment[operator];

    try {
      await dialUssdDirect(ussd, simSlot);
      toast.success(`تم إرسال طلب الرصيد - ${operator === "mtn" ? "MTN" : "Syriatel"}`);
    } catch {
      toast.error("فشل إرسال الطلب");
    }
  };

  const handleSaveBalance = (operator: Operator) => {
    const val = Number(editValue);
    if (isNaN(val) || val < 0) {
      toast.error("أدخل رقماً صحيحاً");
      return;
    }
    saveBalance(operator, val);
    setBalances(getSavedBalances());
    setEditingOp(null);
    setEditValue("");
    toast.success("تم حفظ الرصيد");
  };

  const timeSince = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} س`;
    const days = Math.floor(hrs / 24);
    return `منذ ${days} يوم`;
  };

  const OperatorCard = ({ operator }: { operator: Operator }) => {
    const isMtn = operator === "mtn";
    const saved = balances[operator];
    const estimated = getEstimatedBalance(operator);
    const spent = getSpentSince(operator);
    const isEditing = editingOp === operator;

    return (
      <div className="rounded-2xl overflow-hidden shadow-card animate-slide-up">
        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between ${
          isMtn ? "bg-operator-mtn" : "bg-operator-syriatel"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isMtn ? "bg-operator-mtn-foreground/15" : "bg-operator-syriatel-foreground/15"
            }`}>
              <Wallet className={`w-5 h-5 ${isMtn ? "text-operator-mtn-foreground" : "text-operator-syriatel-foreground"}`} />
            </div>
            <span className={`font-bold text-lg ${isMtn ? "text-operator-mtn-foreground" : "text-operator-syriatel-foreground"}`}>
              {isMtn ? "MTN" : "Syriatel"}
            </span>
          </div>
          <button
            onClick={() => handleBalanceCheck(operator)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-smooth ${
              isMtn 
                ? "bg-operator-mtn-foreground/20 text-operator-mtn-foreground hover:bg-operator-mtn-foreground/30" 
                : "bg-operator-syriatel-foreground/20 text-operator-syriatel-foreground hover:bg-operator-syriatel-foreground/30"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            استعلام
          </button>
        </div>

        {/* Body */}
        <div className="bg-card p-5 space-y-4">
          {/* Estimated Balance */}
          {estimated !== null && !isEditing && (
            <div className="text-center space-y-1.5">
              <p className="text-xs text-muted-foreground">الرصيد المتوقع</p>
              <p className={`text-4xl font-bold tracking-tight ${
                isMtn ? "text-operator-mtn" : "text-operator-syriatel"
              }`}>
                {estimated.toLocaleString()}
              </p>
              {saved && (
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  آخر تحديث: {timeSince(saved.timestamp)}
                </p>
              )}
            </div>
          )}

          {/* No balance saved */}
          {!saved && !isEditing && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-2">
                <Wallet className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">لم يتم إدخال الرصيد بعد</p>
            </div>
          )}

          {/* Spent since last update */}
          {saved && spent.count > 0 && !isEditing && (
            <div className="bg-muted rounded-xl p-4 space-y-2">
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
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-muted-foreground">الرصيد الأصلي</span>
                <span className="font-bold text-foreground">{saved.amount.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Edit mode */}
          {isEditing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">أدخل الرصيد الحالي بعد الاستعلام</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="مثال: 50000"
                  className="h-12 text-center text-base font-bold rounded-xl border-2"
                  dir="ltr"
                  inputMode="numeric"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveBalance(operator)}
                />
                <Button onClick={() => handleSaveBalance(operator)} className="h-12 px-4 rounded-xl">
                  <Check className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Action button */}
          {!isEditing && (
            <Button
              onClick={() => {
                setEditingOp(operator);
                setEditValue(saved ? String(saved.amount) : "");
              }}
              variant="outline"
              className="w-full h-11 text-sm rounded-xl border-2"
            >
              <Edit className="w-4 h-4 ml-1.5" />
              {saved ? "تحديث الرصيد" : "إدخال الرصيد"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="الرصيد">
      <main className="flex-1 p-3 w-full flex flex-col gap-3 pb-safe" dir="rtl">
        <OperatorCard operator="mtn" />
        <OperatorCard operator="syriatel" />
      </main>
    </AppLayout>
  );
};

export default Balance;