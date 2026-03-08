import { useState, useMemo } from "react";
import {
  Users, Plus, Minus, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, TrendingDown, Trash2, AlertTriangle, Settings, Calendar
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getDistributorAccount, saveDistributorAccount, addTransaction,
  deleteTransaction, getBalance, getDistributorStats,
  type TransactionType, type Operator,
} from "@/lib/distributor";

type ViewTab = 'main' | 'history' | 'stats' | 'settings';

const OPERATORS: { id: Operator; label: string; color: string }[] = [
  { id: 'syriatel', label: 'سيريتل', color: 'text-red-500' },
  { id: 'mtn', label: 'MTN', color: 'text-yellow-500' },
];

const Distributor = () => {
  const [account, setAccount] = useState(() => getDistributorAccount());
  const [activeTab, setActiveTab] = useState<ViewTab>('main');
  const [txType, setTxType] = useState<TransactionType>('topup');
  const [syriatelAmount, setSyriatelAmount] = useState('');
  const [mtnAmount, setMtnAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Settings edit
  const [editName, setEditName] = useState(account.name);
  const [editPhone, setEditPhone] = useState(account.phone);
  const [editAlert, setEditAlert] = useState(String(account.lowBalanceAlert));
  const [editMessage, setEditMessage] = useState(account.whatsappMessage || 'مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س\nسيريتل: {syriatel} | MTN: {mtn}');
  const [editWhatsappEnabled, setEditWhatsappEnabled] = useState(account.whatsappEnabled !== false);

  const syriatelBalance = useMemo(() => getBalance('syriatel'), [account]);
  const mtnBalance = useMemo(() => getBalance('mtn'), [account]);
  const totalBalance = syriatelBalance + mtnBalance;
  const stats = useMemo(() => getDistributorStats(), [account]);
  const isLowBalance = totalBalance <= account.lowBalanceAlert && account.lowBalanceAlert > 0;

  const sendWhatsApp = (syrAmount: number, mtnAmt: number, note: string) => {
    const phone = account.phone.replace(/^0/, '963');
    const parts: string[] = [];
    if (syrAmount > 0) parts.push(`سيريتل: ${syrAmount.toLocaleString()}`);
    if (mtnAmt > 0) parts.push(`MTN: ${mtnAmt.toLocaleString()}`);
    const totalAmount = syrAmount + mtnAmt;
    let message = (account.whatsappMessage || 'مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س')
      .replace('{amount}', totalAmount.toLocaleString())
      .replace('{note}', note || '');
    if (parts.length === 2) {
      message += `\n${parts.join(' | ')}`;
    }
    if (note && !message.includes(note)) {
      message += `\nملاحظة: ${note}`;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleAddTransaction = (type: TransactionType) => {
    const syrAmt = Number(syriatelAmount);
    const mtnAmt = Number(mtnAmount);
    if ((!syrAmt || syrAmt <= 0) && (!mtnAmt || mtnAmt <= 0)) {
      toast.error("أدخل مبلغاً واحداً على الأقل");
      return;
    }
    if (type === 'payment') {
      if (syrAmt > 0 && syrAmt > syriatelBalance) {
        toast.error("مبلغ سيريتل أكبر من الرصيد المتاح");
        return;
      }
      if (mtnAmt > 0 && mtnAmt > mtnBalance) {
        toast.error("مبلغ MTN أكبر من الرصيد المتاح");
        return;
      }
    }
    if (syrAmt > 0) addTransaction(type, syrAmt, txNote.trim(), 'syriatel');
    if (mtnAmt > 0) addTransaction(type, mtnAmt, txNote.trim(), 'mtn');
    setAccount(getDistributorAccount());
    if (type === 'topup' && account.phone) {
      sendWhatsApp(syrAmt > 0 ? syrAmt : 0, mtnAmt > 0 ? mtnAmt : 0, txNote.trim());
    }
    setSyriatelAmount('');
    setMtnAmount('');
    setTxNote('');
    toast.success(type === 'topup' ? 'تم تسجيل طلب الرصيد' : 'تم تسجيل الدفعة');
  };

  const handleDelete = (id: string) => {
    deleteTransaction(id);
    setAccount(getDistributorAccount());
    setShowDeleteConfirm(null);
    toast.info("تم حذف العملية");
  };

  const handleSaveSettings = () => {
    const updated = { ...account, name: editName.trim(), phone: editPhone.trim(), lowBalanceAlert: Number(editAlert) || 0, whatsappMessage: editMessage.trim() };
    saveDistributorAccount(updated);
    setAccount(updated);
    toast.success("تم حفظ إعدادات الموزع");
  };

  const tabs: { id: ViewTab; label: string }[] = [
    { id: 'main', label: 'الرئيسية' },
    { id: 'history', label: 'السجل' },
    { id: 'stats', label: 'الإحصائيات' },
    { id: 'settings', label: 'الإعدادات' },
  ];

  const getOperatorLabel = (op: Operator) => op === 'syriatel' ? 'سيريتل' : 'MTN';

  return (
    <AppLayout title="الموزع">
      {/* Tabs */}
      <div className="flex gap-1 p-2 bg-card border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-smooth ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 p-3 w-full overflow-y-auto pb-safe space-y-3" dir="rtl">

        {/* ===== MAIN TAB ===== */}
        {activeTab === 'main' && (
          <>
            {/* Balance Cards - per operator */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-card border border-border rounded-xl p-3 text-center shadow-card">
                <p className="text-[11px] text-red-500 font-bold mb-0.5">سيريتل</p>
                <p className={`text-xl font-bold tracking-tight ${syriatelBalance < 0 ? "text-destructive" : "text-foreground"}`}>
                  {syriatelBalance.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">ل.س</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center shadow-card">
                <p className="text-[11px] text-yellow-500 font-bold mb-0.5">MTN</p>
                <p className={`text-xl font-bold tracking-tight ${mtnBalance < 0 ? "text-destructive" : "text-foreground"}`}>
                  {mtnBalance.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">ل.س</p>
              </div>
            </div>

            {/* Total balance */}
            <div className={`rounded-xl p-3 text-center shadow-card ${
              isLowBalance
                ? "bg-destructive/10 border-2 border-destructive/30"
                : "bg-card border border-border"
            }`}>
              {account.name && (
                <p className="text-[10px] text-muted-foreground mb-0.5">{account.name}</p>
              )}
              <p className="text-[10px] text-muted-foreground">الرصيد الإجمالي</p>
              <p className={`text-2xl font-bold tracking-tight ${
                totalBalance < 0 ? "text-destructive" : isLowBalance ? "text-accent" : "text-primary"
              }`}>
                {totalBalance.toLocaleString()} <span className="text-xs text-muted-foreground">ل.س</span>
              </p>
              {isLowBalance && totalBalance > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-1 text-destructive text-[10px] font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  الرصيد منخفض
                </div>
              )}
            </div>

            {/* Add Transaction */}
            <div className="space-y-2">
              {/* Per-operator amount inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-red-500 text-center block">سيريتل</label>
                  <Input
                    type="number"
                    value={syriatelAmount}
                    onChange={(e) => setSyriatelAmount(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-lg font-bold rounded-xl border-2 border-red-500/20"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-yellow-500 text-center block">MTN</label>
                  <Input
                    type="number"
                    value={mtnAmount}
                    onChange={(e) => setMtnAmount(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-lg font-bold rounded-xl border-2 border-yellow-500/20"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <Input
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
                placeholder="ملاحظة (اختياري)"
                className="h-10 rounded-xl text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleAddTransaction('topup')}
                  variant="outline"
                  className="h-12 font-bold rounded-xl border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                  disabled={(!syriatelAmount || Number(syriatelAmount) <= 0) && (!mtnAmount || Number(mtnAmount) <= 0)}
                >
                  <ArrowDownCircle className="w-5 h-5 ml-2" />
                  طلب رصيد
                </Button>
                <Button
                  onClick={() => handleAddTransaction('payment')}
                  variant="outline"
                  className="h-12 font-bold rounded-xl border-2 border-accent/30 text-accent hover:bg-accent hover:text-accent-foreground"
                  disabled={(!syriatelAmount || Number(syriatelAmount) <= 0) && (!mtnAmount || Number(mtnAmount) <= 0)}
                >
                  <ArrowUpCircle className="w-5 h-5 ml-2" />
                  دفعة
                </Button>
              </div>
            </div>

            {/* Recent Transactions */}
            {account.transactions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground px-1">آخر العمليات</p>
                {account.transactions.slice(0, 5).map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onDelete={null} />
                ))}
                {account.transactions.length > 5 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setActiveTab('history')}>
                    عرض الكل ({account.transactions.length})
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {activeTab === 'history' && (
          <div className="space-y-1.5">
            {account.transactions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">لا توجد عمليات بعد</p>
            ) : (
              account.transactions.map((tx) => (
                <div key={tx.id} className="relative">
                  <TransactionRow tx={tx} onDelete={() => setShowDeleteConfirm(tx.id)} />
                  {showDeleteConfirm === tx.id && (
                    <div className="absolute inset-0 bg-card/95 rounded-xl flex items-center justify-center gap-2 z-10 border border-destructive/30">
                      <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleDelete(tx.id)}>
                        <Trash2 className="w-3 h-3 ml-1" />تأكيد الحذف
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowDeleteConfirm(null)}>
                        إلغاء
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== STATS TAB ===== */}
        {activeTab === 'stats' && (
          <div className="space-y-2">
            {/* Per-operator stats */}
            {OPERATORS.map((op) => {
              const opStats = getDistributorStats(op.id);
              if (opStats.transactionCount === 0) return null;
              return (
                <div key={op.id} className="bg-card border border-border rounded-xl p-4 shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-bold ${op.color}`}>{op.label}</span>
                    <span className="text-xs text-muted-foreground">{opStats.transactionCount} عملية</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">طلبات</span>
                      <span className="text-sm font-bold text-primary">+{opStats.totalTopups.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">دفعات</span>
                      <span className="text-sm font-bold text-accent">-{opStats.totalPayments.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">الرصيد</span>
                      <span className={`text-base font-bold ${opStats.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                        {opStats.balance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Total summary */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground">الإجمالي</span>
                <span className="text-xs text-muted-foreground">{stats.transactionCount} عملية</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">إجمالي الطلبات</span>
                  <span className="text-sm font-bold text-primary">+{stats.totalTopups.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">إجمالي الدفعات</span>
                  <span className="text-sm font-bold text-accent">-{stats.totalPayments.toLocaleString()}</span>
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">الرصيد</span>
                  <span className={`text-base font-bold ${stats.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {stats.balance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                بيانات الموزع
              </h3>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">اسم الموزع</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                    placeholder="مثال: أبو محمد" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">رقم الهاتف</label>
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="09XXXXXXXX" className="h-11 rounded-xl text-left" dir="ltr" inputMode="tel" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-accent" />
                تنبيه الرصيد المنخفض
              </h3>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">التنبيه عند انخفاض الرصيد تحت</label>
                <Input type="number" value={editAlert} onChange={(e) => setEditAlert(e.target.value)}
                  placeholder="50000" className="h-11 rounded-xl text-left" dir="ltr" inputMode="numeric" />
                <p className="text-[10px] text-muted-foreground">اكتب 0 لإيقاف التنبيهات</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                💬 رسالة واتساب
              </h3>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">نص الرسالة عند طلب الرصيد</label>
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  placeholder="مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س"
                  className="w-full min-h-[80px] rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="rtl"
                />
                <p className="text-[10px] text-muted-foreground">
                  استخدم <span className="font-mono bg-muted px-1 rounded">{'{amount}'}</span> للمبلغ و <span className="font-mono bg-muted px-1 rounded">{'{note}'}</span> للملاحظة
                </p>
              </div>
            </div>

            <Button onClick={handleSaveSettings} className="w-full h-11 font-bold rounded-xl">
              حفظ الإعدادات
            </Button>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

// Transaction Row Component
const TransactionRow = ({ tx, onDelete }: {
  tx: { id: string; type: string; operator?: string; amount: number; note: string; timestamp: number };
  onDelete: (() => void) | null;
}) => {
  const isTopup = tx.type === 'topup';
  const operatorLabel = tx.operator === 'mtn' ? 'MTN' : tx.operator === 'syriatel' ? 'سيريتل' : '';
  const operatorColor = tx.operator === 'mtn' ? 'text-yellow-500' : 'text-red-500';
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 shadow-card">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isTopup ? "bg-primary/10" : "bg-accent/10"
        }`}>
          {isTopup ? (
            <ArrowDownCircle className="w-4.5 h-4.5 text-primary" />
          ) : (
            <ArrowUpCircle className="w-4.5 h-4.5 text-accent" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {isTopup ? 'طلب رصيد' : 'دفعة'}
            {operatorLabel && <span className={`text-[10px] mr-1.5 ${operatorColor}`}>({operatorLabel})</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(tx.timestamp).toLocaleDateString("ar-SY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {tx.note && ` • ${tx.note}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${isTopup ? "text-primary" : "text-accent"}`}>
          {isTopup ? '+' : '-'}{tx.amount.toLocaleString()}
        </span>
        {onDelete && (
          <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-smooth">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Distributor;
