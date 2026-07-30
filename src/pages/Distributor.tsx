import { useState, useMemo } from "react";
import {
  Users, Plus, Minus, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, TrendingDown, Trash2, AlertTriangle, Settings, Calendar, Wallet, BarChart3
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trackEvent } from "@/lib/cloud-sync";
import {
  getDistributorAccount, saveDistributorAccount, addTransaction,
  deleteTransaction, getBalance, getDistributorStats, getActualCost,
  type TransactionType, type Operator,
} from "@/lib/distributor";

type ViewTab = 'main' | 'history' | 'stats' | 'settings';

const OPERATORS: { id: Operator; label: string; color: string }[] = [
  { id: 'syriatel', label: 'سيريتل', color: 'text-operator-syriatel' },
  { id: 'mtn', label: 'MTN', color: 'text-operator-mtn' },
];

const TABS: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
  { id: 'main', label: 'الرئيسية', icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'history', label: 'السجل', icon: <Calendar className="w-3.5 h-3.5" /> },
  { id: 'stats', label: 'الإحصائيات', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-3.5 h-3.5" /> },
];

const Distributor = () => {
  const [account, setAccount] = useState(() => getDistributorAccount());
  const [activeTab, setActiveTab] = useState<ViewTab>('main');
  const [txType, setTxType] = useState<TransactionType>('topup');
  const [syriatelAmount, setSyriatelAmount] = useState('');
  const [mtnAmount, setMtnAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');

  const [editName, setEditName] = useState(account.name);
  const [editPhone, setEditPhone] = useState(account.phone);
  const [editAlert, setEditAlert] = useState(String(account.lowBalanceAlert));
  const [editSyriatelMarkup, setEditSyriatelMarkup] = useState(String(account.syriatelMarkup || 0));
  const [editMtnMarkup, setEditMtnMarkup] = useState(String(account.mtnMarkup || 0));
  const [editMessage, setEditMessage] = useState(account.whatsappMessage || 'مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س\nسيريتل: {syriatel} | MTN: {mtn}');
  const [editWhatsappEnabled, setEditWhatsappEnabled] = useState(account.whatsappEnabled !== false);

  const syriatelBalance = useMemo(() => getBalance('syriatel'), [account]);
  const mtnBalance = useMemo(() => getBalance('mtn'), [account]);
  const totalBalance = syriatelBalance + mtnBalance;
  const stats = useMemo(() => getDistributorStats(), [account]);
  const isLowBalance = totalBalance <= account.lowBalanceAlert && account.lowBalanceAlert > 0;

  const sendWhatsApp = (syrAmount: number, mtnAmt: number, note: string) => {
    if (!account.whatsappEnabled && account.whatsappEnabled !== undefined) return;
    if (!account.phone) return;
    const phone = account.phone.replace(/^0/, '963');
    const totalAmount = syrAmount + mtnAmt;
    let message = (account.whatsappMessage || 'مرحبا {name} اذا ممكن تحويل رصيد\nسيريتل: {syriatel}\nMTN: {mtn}')
      .replace('{name}', account.name || '')
      .replace('{amount}', totalAmount.toLocaleString())
      .replace('{syriatel}', syrAmount > 0 ? syrAmount.toLocaleString() : '0')
      .replace('{mtn}', mtnAmt > 0 ? mtnAmt.toLocaleString() : '0')
      .replace('{note}', note || '');
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
    if (syrAmt > 0) {
      addTransaction(type, syrAmt, txNote.trim(), 'syriatel');
      trackEvent(type === 'topup' ? 'distributor_topup' : 'distributor_payment', { operator: 'syriatel', amount: syrAmt, note: txNote.trim() });
    }
    if (mtnAmt > 0) {
      addTransaction(type, mtnAmt, txNote.trim(), 'mtn');
      trackEvent(type === 'topup' ? 'distributor_topup' : 'distributor_payment', { operator: 'mtn', amount: mtnAmt, note: txNote.trim() });
    }
    setAccount(getDistributorAccount());
    if (type === 'topup') {
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
    const updated = { ...account, name: editName.trim(), phone: editPhone.trim(), lowBalanceAlert: Number(editAlert) || 0, whatsappEnabled: editWhatsappEnabled, whatsappMessage: editMessage.trim(), syriatelMarkup: Number(editSyriatelMarkup) || 0, mtnMarkup: Number(editMtnMarkup) || 0 };
    saveDistributorAccount(updated);
    setAccount(updated);
    toast.success("تم حفظ إعدادات الموزع");
  };

  return (
    <AppLayout title="الموزع">
      <div className="sticky top-0 z-20 bg-gradient-to-b from-white to-white/95 backdrop-blur-lg border-b border-border/60">
        <div className="flex gap-1 p-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                  : "text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-3 w-full overflow-y-auto pb-safe space-y-3" dir="rtl">

        {activeTab === 'main' && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {([['syriatel', syriatelBalance, 'text-operator-syriatel', 'bg-operator-syriatel/10', 'سيريتل'],
                 ['mtn', mtnBalance, 'text-operator-mtn', 'bg-operator-mtn/10', 'MTN']] as const).map(([op, bal, color, bg, label]) => (
                <div key={op} className="bg-white border border-border/60 rounded-2xl p-4 text-center shadow-sm">
                  <p className={`text-xs font-bold ${color} mb-1`}>{label}</p>
                  <p className={`text-2xl font-bold tracking-tight ${bal < 0 ? "text-destructive" : "text-foreground"}`}>
                    {bal.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">ل.س</p>
                </div>
              ))}
            </div>

            <div className={`bg-white border rounded-2xl p-4 text-center shadow-sm ${
              isLowBalance ? "border-destructive/30" : "border-border/60"
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
                <div className="flex items-center justify-center gap-1.5 mt-1.5 text-destructive text-[10px] font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  الرصيد منخفض
                </div>
              )}
            </div>

            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-bold text-foreground">إضافة عملية</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-operator-syriatel text-center block">سيريتل</label>
                  <Input
                    type="number"
                    value={syriatelAmount}
                    onChange={(e) => setSyriatelAmount(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-lg font-bold rounded-xl bg-background/50"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-operator-mtn text-center block">MTN</label>
                  <Input
                    type="number"
                    value={mtnAmount}
                    onChange={(e) => setMtnAmount(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-lg font-bold rounded-xl bg-background/50"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {(Number(syriatelAmount) > 0 || Number(mtnAmount) > 0) && (account.syriatelMarkup > 0 || account.mtnMarkup > 0) && (
                <div className="bg-muted/50 border border-border/60 rounded-xl p-2.5 text-center space-y-0.5">
                  <p className="text-[10px] text-muted-foreground">التكلفة الفعلية (مع العمولة)</p>
                  <div className="flex justify-center gap-4">
                    {Number(syriatelAmount) > 0 && account.syriatelMarkup > 0 && (
                      <span className="text-xs font-bold text-foreground">
                        سيريتل: {getActualCost(Number(syriatelAmount), 'syriatel').toLocaleString()}
                        <span className="text-[10px] text-muted-foreground mr-1">(+{account.syriatelMarkup}%)</span>
                      </span>
                    )}
                    {Number(mtnAmount) > 0 && account.mtnMarkup > 0 && (
                      <span className="text-xs font-bold text-foreground">
                        MTN: {getActualCost(Number(mtnAmount), 'mtn').toLocaleString()}
                        <span className="text-[10px] text-muted-foreground mr-1">(+{account.mtnMarkup}%)</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Input
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
                placeholder="ملاحظة (اختياري)"
                className="h-10 rounded-xl bg-background/50 text-sm"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  onClick={() => handleAddTransaction('topup')}
                  variant="outline"
                  className="h-12 font-bold rounded-xl border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                  disabled={(!syriatelAmount || Number(syriatelAmount) <= 0) && (!mtnAmount || Number(mtnAmount) <= 0)}
                >
                  <ArrowDownCircle className="w-5 h-5 ml-2" />
                  طلب رصيد
                </Button>
                <Button
                  onClick={() => handleAddTransaction('payment')}
                  variant="outline"
                  className="h-12 font-bold rounded-xl border-accent/30 text-accent hover:bg-accent hover:text-accent-foreground"
                  disabled={(!syriatelAmount || Number(syriatelAmount) <= 0) && (!mtnAmount || Number(mtnAmount) <= 0)}
                >
                  <ArrowUpCircle className="w-5 h-5 ml-2" />
                  دفعة
                </Button>
              </div>
            </div>

            {account.transactions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground px-1">آخر العمليات</p>
                {account.transactions.slice(0, 5).map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onDelete={null} />
                ))}
                {account.transactions.length > 5 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs text-primary" onClick={() => setActiveTab('history')}>
                    عرض الكل ({account.transactions.length})
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-1.5">
            {account.transactions.length === 0 ? (
              <div className="text-center py-16">
                <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">لا توجد عمليات بعد</p>
              </div>
            ) : (
              account.transactions.map((tx) => (
                <div key={tx.id} className="relative">
                  <TransactionRow tx={tx} onDelete={() => setShowDeleteConfirm(tx.id)} />
                  {showDeleteConfirm === tx.id && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl flex items-center justify-center gap-2 z-10 border border-destructive/30">
                      <Button size="sm" variant="destructive" className="text-xs rounded-xl" onClick={() => handleDelete(tx.id)}>
                        <Trash2 className="w-3 h-3 ml-1" />تأكيد الحذف
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs rounded-xl" onClick={() => setShowDeleteConfirm(null)}>
                        إلغاء
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-2.5">
            {OPERATORS.map((op) => {
              const opStats = getDistributorStats(op.id);
              if (opStats.transactionCount === 0) return null;
              return (
                <div key={op.id} className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-bold ${op.color}`}>{op.label}</span>
                    <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{opStats.transactionCount} عملية</span>
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
                    <div className="border-t border-border/60 pt-2.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">الرصيد</span>
                      <span className={`text-base font-bold ${opStats.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                        {opStats.balance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground">الإجمالي</span>
                <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{stats.transactionCount} عملية</span>
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
                {stats.totalMarkup > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">إجمالي العمولات</span>
                    <span className="text-sm font-bold text-destructive">{stats.totalMarkup.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-border/60 pt-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">المبلغ المتبقي</span>
                  <span className={`text-base font-bold ${stats.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {stats.balance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3 pb-4">
            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                بيانات الموزع
              </h3>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">اسم الموزع</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                    placeholder="مثال: أبو محمد" className="h-11 rounded-xl bg-background/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">رقم الهاتف</label>
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="09XXXXXXXX" className="h-11 rounded-xl bg-background/50 text-left" dir="ltr" inputMode="tel" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                عمولة الموزع (%)
              </h3>
              <p className="text-[10px] text-muted-foreground">نسبة العمولة التي يأخذها الموزع على كل طلب رصيد. مثال: 8 تعني 100,000 تكلفتها 108,000</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-operator-syriatel text-center block">سيريتل %</label>
                  <Input type="number" value={editSyriatelMarkup} onChange={(e) => setEditSyriatelMarkup(e.target.value)}
                    placeholder="0" className="h-11 rounded-xl text-center bg-background/50" dir="ltr" inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-operator-mtn text-center block">MTN %</label>
                  <Input type="number" value={editMtnMarkup} onChange={(e) => setEditMtnMarkup(e.target.value)}
                    placeholder="0" className="h-11 rounded-xl text-center bg-background/50" dir="ltr" inputMode="decimal" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-accent" />
                </div>
                تنبيه الرصيد المنخفض
              </h3>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">التنبيه عند انخفاض الرصيد تحت</label>
                <Input type="number" value={editAlert} onChange={(e) => setEditAlert(e.target.value)}
                  placeholder="50000" className="h-11 rounded-xl bg-background/50 text-left" dir="ltr" inputMode="numeric" />
                <p className="text-[10px] text-muted-foreground">اكتب 0 لإيقاف التنبيهات</p>
              </div>
            </div>

            <div className="bg-white border border-border/60 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-base leading-none">💬</span>
                  </div>
                  رسالة واتساب
                </h3>
                <button
                  onClick={() => setEditWhatsappEnabled(!editWhatsappEnabled)}
                  className={`w-11 h-6 rounded-full transition-all relative ${editWhatsappEnabled ? 'bg-primary shadow-sm' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${editWhatsappEnabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                </button>
              </div>
              {editWhatsappEnabled && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">نص الرسالة عند طلب الرصيد</label>
                  <textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    placeholder="مرحباً، أرجو تحويل رصيد بقيمة {amount} ل.س"
                    className="w-full min-h-[80px] rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    dir="rtl"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    المتغيرات: <span className="font-mono bg-muted px-1.5 rounded text-[9px]">{'{name}'}</span>
                    <span className="mx-1">·</span>
                    <span className="font-mono bg-muted px-1.5 rounded text-[9px]">{'{syriatel}'}</span>
                    <span className="mx-1">·</span>
                    <span className="font-mono bg-muted px-1.5 rounded text-[9px]">{'{mtn}'}</span>
                    <span className="mx-1">·</span>
                    <span className="font-mono bg-muted px-1.5 rounded text-[9px]">{'{note}'}</span>
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleSaveSettings} className="w-full h-11 font-bold rounded-xl shadow-sm">
              حفظ الإعدادات
            </Button>

            <div className="bg-white border border-destructive/20 rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                حذف جميع العمليات
              </h3>
              <p className="text-[11px] text-muted-foreground">سيتم حذف جميع عمليات الموزع نهائياً (الطلبات والدفعات). لا يمكن التراجع.</p>
              {!showClearAll ? (
                <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground rounded-xl"
                  onClick={() => setShowClearAll(true)}>
                  حذف جميع العمليات
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-destructive font-semibold">اكتب "حذف" للتأكيد:</p>
                  <Input
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="اكتب حذف هنا"
                    className="h-10 rounded-xl text-center border-destructive/30 bg-background/50"
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" className="flex-1 h-10 font-bold rounded-xl"
                      disabled={clearConfirmText !== 'حذف'}
                      onClick={() => {
                        const updated = { ...account, transactions: [] };
                        saveDistributorAccount(updated);
                        setAccount(updated);
                        setShowClearAll(false);
                        setClearConfirmText('');
                        toast.success("تم حذف جميع العمليات");
                      }}>
                      <Trash2 className="w-4 h-4 ml-1" />تأكيد الحذف
                    </Button>
                    <Button variant="outline" className="flex-1 h-10 rounded-xl"
                      onClick={() => { setShowClearAll(false); setClearConfirmText(''); }}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

const TransactionRow = ({ tx, onDelete }: {
  tx: { id: string; type: string; operator?: string; amount: number; note: string; timestamp: number };
  onDelete: (() => void) | null;
}) => {
  const isTopup = tx.type === 'topup';
  const operatorLabel = tx.operator === 'mtn' ? 'MTN' : tx.operator === 'syriatel' ? 'سيريتل' : '';
  const operatorColor = tx.operator === 'mtn' ? 'text-operator-mtn' : 'text-operator-syriatel';
  const actualCost = isTopup && tx.operator ? getActualCost(tx.amount, tx.operator as Operator) : tx.amount;
  const hasMarkup = isTopup && actualCost !== tx.amount;
  return (
    <div className="flex items-center justify-between bg-white border border-border/60 rounded-2xl px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
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
        <div className="text-left">
          <span className={`text-sm font-bold ${isTopup ? "text-primary" : "text-accent"}`}>
            {isTopup ? '+' : '-'}{(hasMarkup ? actualCost : tx.amount).toLocaleString()}
          </span>
          {hasMarkup && (
            <p className="text-[9px] text-muted-foreground">رصيد: {tx.amount.toLocaleString()}</p>
          )}
        </div>
        {onDelete && (
          <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Distributor;
