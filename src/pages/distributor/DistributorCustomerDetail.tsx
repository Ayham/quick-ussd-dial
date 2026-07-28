import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, UserCircle, Phone, Mail, Calendar, Wallet, AlertTriangle, StickyNote, Edit2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getCustomerAccount, updateCustomerNotes, getCustomerTransactions, type CustomerWithProfile, type CustomerTransaction } from "@/lib/distributor-management";

export default function DistributorCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [customer, setCustomer] = useState<CustomerWithProfile | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (id) load();
  }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cust, txs] = await Promise.all([
        getCustomerAccount(id),
        getCustomerTransactions(id),
      ]);
      setCustomer(cust);
      setNotes(cust?.notes || "");
      setTransactions(txs || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      await updateCustomerNotes(id, notes);
      setEditingNotes(false);
      toast.success(isArabic ? "تم الحفظ" : "Saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return <div className="min-h-dvh bg-background flex items-center justify-center"><div className="text-sm text-muted-foreground">{isArabic ? "جاري التحميل..." : "Loading..."}</div></div>;
  }

  if (!customer) {
    return <div className="min-h-dvh bg-background flex items-center justify-center"><div className="text-sm text-muted-foreground">{isArabic ? "العميل غير موجود" : "Customer not found"}</div></div>;
  }

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center gap-3 shadow-elevated">
        <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => nav("/dm/customers")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-primary-foreground text-lg font-bold tracking-tight">{customer.display_name || customer.email || "Customer"}</h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto pb-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card text-center">
            <Wallet className="w-6 h-6 mx-auto mb-1 text-success" />
            <p className="text-[10px] text-muted-foreground">{isArabic ? "الرصيد" : "Balance"}</p>
            <p className="text-xl font-bold text-success">{(customer.current_balance ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-destructive" />
            <p className="text-[10px] text-muted-foreground">{isArabic ? "الدين" : "Debt"}</p>
            <p className="text-xl font-bold text-destructive">{(customer.current_debt ?? 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
          <InfoRow icon={<UserCircle className="w-4 h-4" />} label={isArabic ? "الاسم" : "Name"} value={customer.display_name || "-"} />
          <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={customer.email || "-"} />
          <InfoRow icon={<Phone className="w-4 h-4" />} label={isArabic ? "الهاتف" : "Phone"} value={customer.phone || "-"} />
          <InfoRow icon={<Calendar className="w-4 h-4" />} label={isArabic ? "تاريخ التسجيل" : "Registered"} value={customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "-"} />
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-primary" />
              {isArabic ? "ملاحظات" : "Notes"}
            </h3>
            {!editingNotes ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotes(customer.notes || ""); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
          {editingNotes ? (
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 rounded-xl" />
          ) : (
            <p className="text-sm text-muted-foreground">{customer.notes || (isArabic ? "لا توجد ملاحظات" : "No notes")}</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold mb-2">{isArabic ? "المعاملات" : "Transactions"}</h3>
          {!transactions.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">{isArabic ? "لا توجد معاملات" : "No transactions"}</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold">{tx.type}</p>
                    <p className="text-[10px] text-muted-foreground">{tx.notes || ""}</p>
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold">{tx.amount.toLocaleString()} ل.س</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}