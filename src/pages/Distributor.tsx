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
  type TransactionType,
} from "@/lib/distributor";

type ViewTab = 'main' | 'history' | 'stats' | 'settings';

const Distributor = () => {
  const [account, setAccount] = useState(() => getDistributorAccount());
  const [activeTab, setActiveTab] = useState<ViewTab>('main');
  const [txType, setTxType] = useState<TransactionType>('topup');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Settings edit
  const [editName, setEditName] = useState(account.name);
  const [editPhone, setEditPhone] = useState(account.phone);
  const [editAlert, setEditAlert] = useState(String(account.lowBalanceAlert));
  const [editMessage, setEditMessage] = useState(account.whatsappMessage || 'مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س');

  const balance = useMemo(() => getBalance(), [account]);
  const stats = useMemo(() => getDistributorStats(), [account]);
  const isLowBalance = balance <= account.lowBalanceAlert && account.lowBalanceAlert > 0;

  const sendWhatsApp = (amount: number, note: string) => {
    const phone = account.phone.replace(/^0/, '963');
    let message = (account.whatsappMessage || 'مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س')
      .replace('{amount}', amount.toLocaleString())
      .replace('{note}', note || '');
    if (note && !message.includes(note)) {
      message += `\nملاحظة: ${note}`;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleAddTransaction = (type?: TransactionType) => {
    const actualType = type || txType;
    const amount = Number(txAmount);
    if (!amount || amount <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    if (actualType === 'payment' && amount > balance) {
      toast.error("المبلغ أكبر من الرصيد المتاح");
      return;
    }
    addTransaction(actualType, amount, txNote.trim());
    setAccount(getDistributorAccount());
    // Send WhatsApp for topup requests if phone exists
    if (actualType === 'topup' && account.phone) {
      sendWhatsApp(amount, txNote.trim());
    }
    setTxAmount('');
    setTxNote('');
    toast.success(actualType === 'topup' ? 'تم تسجيل طلب الرصيد' : 'تم تسجيل الدفعة');
  };

  const handleDelete = (id: string) => {
    deleteTransaction(id);
    setAccount(getDistributorAccount());
    setShowDeleteConfirm(null);
    toast.info("تم حذف العملية");
  };

  const handleSaveSettings = () => {
    const updated = { ...account, name: editName.trim(), phone: editPhone.trim(), lowBalanceAlert: Number(editAlert) || 0 };
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
            {/* Balance Card */}
            <div className={`rounded-2xl p-5 text-center shadow-card ${
              isLowBalance
                ? "bg-destructive/10 border-2 border-destructive/30"
                : "bg-card border border-border"
            }`}>
              {account.name && (
                <p className="text-xs text-muted-foreground mb-1">{account.name}</p>
              )}
              <p className="text-xs text-muted-foreground">الرصيد عند الموزع</p>
              <p className={`text-4xl font-bold tracking-tight mt-1 ${
                balance < 0 ? "text-destructive" : isLowBalance ? "text-accent" : "text-primary"
              }`}>
                {balance.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">ل.س</p>
              {isLowBalance && balance > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-3 text-destructive text-xs font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  الرصيد منخفض — أقل من {account.lowBalanceAlert.toLocaleString()}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-card border border-border rounded-xl p-3 text-center shadow-card">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ArrowDownCircle className="w-4 h-4 text-primary" />
                  <span className="text-[11px] text-muted-foreground">إجمالي الطلبات</span>
                </div>
                <p className="text-lg font-bold text-foreground">{stats.totalTopups.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center shadow-card">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ArrowUpCircle className="w-4 h-4 text-accent" />
                  <span className="text-[11px] text-muted-foreground">إجمالي الدفعات</span>
                </div>
                <p className="text-lg font-bold text-foreground">{stats.totalPayments.toLocaleString()}</p>
              </div>
            </div>

            {/* Add Transaction */}
            <div className="space-y-2">
              <Input
                type="number"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                placeholder="المبلغ"
                className="h-12 text-center text-lg font-bold rounded-xl border-2 border-border"
                dir="ltr"
                inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTransaction()}
              />

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
                  disabled={!txAmount || Number(txAmount) <= 0}
                >
                  <ArrowDownCircle className="w-5 h-5 ml-2" />
                  طلب رصيد
                </Button>
                <Button
                  onClick={() => handleAddTransaction('payment')}
                  variant="outline"
                  className="h-12 font-bold rounded-xl border-2 border-accent/30 text-accent hover:bg-accent hover:text-accent-foreground"
                  disabled={!txAmount || Number(txAmount) <= 0}
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
            {/* Summary row */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground">الملخص</span>
                <span className="text-xs text-muted-foreground">{stats.transactionCount} عملية</span>
              </div>
              <div className="space-y-2.5">
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

            {/* Period rows */}
            {[
              { label: 'اليوم', topups: stats.todayTopups, payments: stats.todayPayments },
              { label: 'هذا الأسبوع', topups: stats.weekTopups, payments: stats.weekPayments },
              { label: 'هذا الشهر', topups: stats.monthTopups, payments: stats.monthPayments },
            ].map((period) => (
              (period.topups > 0 || period.payments > 0) && (
                <div key={period.label} className="bg-card border border-border rounded-xl px-4 py-3 shadow-card flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{period.label}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-primary font-bold">+{period.topups.toLocaleString()}</span>
                    <span className="text-accent font-bold">-{period.payments.toLocaleString()}</span>
                  </div>
                </div>
              )
            ))}
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
const TransactionRow = ({ tx, onDelete }: { tx: { id: string; type: string; amount: number; note: string; timestamp: number }; onDelete: (() => void) | null }) => {
  const isTopup = tx.type === 'topup';
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
          <p className="text-sm font-medium text-foreground">{isTopup ? 'طلب رصيد' : 'دفعة'}</p>
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