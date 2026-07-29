import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, Phone, Mail, Smartphone, Key, Clock,
  Wallet, AlertTriangle, TrendingUp, Edit3, Save, X,
  ArrowDownCircle, ArrowUpCircle, Plus, Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/auth-session";
import {
  getCustomerAccount,
  getCustomerTransactions,
  updateCustomerProfile,
  addDebt,
  registerPayment,
  adjustBalance,
  addCredit,
  type CustomerAccount,
  type CustomerTransaction,
} from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  customerId: string;
  distributorId: string;
  onBack: () => void;
  onViewStatement: (customerId: string) => void;
}

type AccountingAction = "debt" | "payment" | "adjustment" | "credit" | null;

export function DistributorCustomerDetail({ customerId, distributorId, onBack, onViewStatement }: Props) {
  const { user } = useAuthSession();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [recentTx, setRecentTx] = useState<CustomerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [accountingAction, setAccountingAction] = useState<AccountingAction>(null);
  const [accountingAmount, setAccountingAmount] = useState("");
  const [accountingNote, setAccountingNote] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, accountRes, txRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", customerId).maybeSingle(),
        getCustomerAccount(customerId),
        getCustomerTransactions(customerId, 1, 10),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data as unknown as Record<string, unknown>);
        setNotes(profileRes.data.notes || "");
      }
      setAccount(accountRes);
      setRecentTx(txRes.transactions);
    } catch (e) {
      console.error("Load customer detail error:", e);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNotes = async () => {
    const { success } = await updateCustomerProfile(customerId, { notes });
    if (success) {
      toast.success("تم حفظ الملاحظات");
      setEditingNotes(false);
    } else {
      toast.error("فشل الحفظ");
    }
  };

  const handleAccounting = async () => {
    if (!accountingAction || !accountingAmount || Number(accountingAmount) <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    setProcessing(true);
    const amount = Number(accountingAmount);
    let result;
    switch (accountingAction) {
      case "debt": result = await addDebt(customerId, distributorId, amount, accountingNote); break;
      case "payment": result = await registerPayment(customerId, distributorId, amount, accountingNote); break;
      case "adjustment": result = await adjustBalance(customerId, distributorId, amount, accountingNote); break;
      case "credit": result = await addCredit(customerId, distributorId, amount, accountingNote); break;
      default: setProcessing(false); return;
    }
    if (result.success) {
      toast.success("تمت العملية بنجاح");
      setAccountingAction(null);
      setAccountingAmount("");
      setAccountingNote("");
      load();
    } else {
      toast.error(result.error || "فشلت العملية");
    }
    setProcessing(false);
  };

  if (loading) {
    return <div className="text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  const p = profile as Record<string, string | null> | null;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold">تفاصيل العميل</h2>
      </div>

      {/* Customer Info Card */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">{p?.display_name || "بدون اسم"}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            p?.customer_status === "active" ? "bg-success/10 text-success" :
            p?.customer_status === "blocked" ? "bg-destructive/10 text-destructive" :
            "bg-muted text-muted-foreground"
          }`}>
            {p?.customer_status === "active" ? "نشط" : p?.customer_status === "blocked" ? "محظور" : "مؤرشف"}
          </span>
        </div>
        {p?.phone && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />{p.phone}
          </p>
        )}
        {p?.email && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />{p.email}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          معرف العميل: <span className="font-mono">{customerId.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 text-center shadow-card">
          <Wallet className="w-4 h-4 mx-auto mb-0.5 text-primary" />
          <p className={`text-lg font-bold ${account && account.current_balance >= 0 ? "text-primary" : "text-destructive"}`}>
            {account?.current_balance.toLocaleString() || "0"}
          </p>
          <p className="text-[10px] text-muted-foreground">الرصيد الحالي</p>
        </div>
        <div className="bg-card border border-destructive/20 rounded-xl p-3 text-center shadow-card">
          <AlertTriangle className="w-4 h-4 mx-auto mb-0.5 text-destructive" />
          <p className="text-lg font-bold text-destructive">
            {account?.current_debt.toLocaleString() || "0"}
          </p>
          <p className="text-[10px] text-muted-foreground">الدين المستحق</p>
        </div>
      </div>

      {/* Quick Accounting Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {([
          { type: "debt" as const, label: "دين", icon: Plus, color: "text-destructive" },
          { type: "payment" as const, label: "دفعة", icon: Minus, color: "text-accent" },
          { type: "adjustment" as const, label: "تعديل", icon: Edit3, color: "text-muted-foreground" },
          { type: "credit" as const, label: "دائن", icon: TrendingUp, color: "text-success" },
        ]).map(({ type, label, icon: Icon, color }) => (
          <button
            key={type}
            onClick={() => setAccountingAction(accountingAction === type ? null : type)}
            className={`p-2 rounded-xl text-center transition-smooth border ${
              accountingAction === type
                ? "bg-primary/10 border-primary/30"
                : "bg-card border-border hover:bg-muted/50"
            }`}
          >
            <Icon className={`w-4 h-4 mx-auto mb-0.5 ${color}`} />
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        ))}
      </div>

      {/* Accounting Form */}
      {accountingAction && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-2">
          <h4 className="text-xs font-bold text-foreground">
            {accountingAction === "debt" ? "إضافة دين" :
             accountingAction === "payment" ? "تسجيل دفعة" :
             accountingAction === "adjustment" ? "تعديل الرصيد" : "إضافة رصيد دائن"}
          </h4>
          <Input
            type="number"
            value={accountingAmount}
            onChange={(e) => setAccountingAmount(e.target.value)}
            placeholder="المبلغ"
            className="h-10 rounded-xl text-center text-sm"
            dir="ltr"
            inputMode="numeric"
          />
          <Input
            value={accountingNote}
            onChange={(e) => setAccountingNote(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            className="h-10 rounded-xl text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleAccounting}
              disabled={processing || !accountingAmount || Number(accountingAmount) <= 0}
              className="flex-1 h-10 rounded-xl"
            >
              {processing ? "جاري..." : "تأكيد"}
            </Button>
            <Button
              onClick={() => { setAccountingAction(null); setAccountingAmount(""); setAccountingNote(""); }}
              variant="outline"
              className="h-10 rounded-xl"
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* View Statement Button */}
      <Button
        onClick={() => onViewStatement(customerId)}
        variant="outline"
        className="w-full h-10 rounded-xl"
      >
        عرض كشف الحساب الكامل
      </Button>

      {/* Notes */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground">ملاحظات داخلية</h3>
          {!editingNotes ? (
            <button onClick={() => setEditingNotes(true)} className="text-xs text-primary">
              <Edit3 className="w-3.5 h-3.5 inline" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button onClick={handleSaveNotes} className="text-xs text-primary">
                <Save className="w-3.5 h-3.5 inline" />
              </button>
              <button onClick={() => { setEditingNotes(false); setNotes(p?.notes || ""); }} className="text-xs text-muted-foreground">
                <X className="w-3.5 h-3.5 inline" />
              </button>
            </div>
          )}
        </div>
        {editingNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full min-h-[60px] rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            dir="rtl"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{notes || "لا توجد ملاحظات"}</p>
        )}
      </div>

      {/* Recent Transactions */}
      {recentTx.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-2">
          <h3 className="text-xs font-bold text-foreground">آخر العمليات</h3>
          {recentTx.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                {tx.type === "payment" ? (
                  <ArrowUpCircle className="w-4 h-4 text-accent" />
                ) : (
                  <ArrowDownCircle className="w-4 h-4 text-primary" />
                )}
                <div>
                  <p className="text-[11px] font-medium text-foreground">
                    {tx.type === "topup" ? "شحن" : tx.type === "payment" ? "دفعة" : tx.type === "debt" ? "دين" : tx.type === "credit" ? "دائن" : "تعديل"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString("ar-SY", { month: "short", day: "numeric" })}
                    {tx.notes && ` · ${tx.notes}`}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-bold ${
                tx.type === "payment" ? "text-accent" : tx.type === "debt" ? "text-destructive" : "text-primary"
              }`}>
                {tx.type === "payment" ? "-" : "+"}{tx.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
