import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { computePaymentTotals } from "@/lib/payment-totals";

export interface PaymentRecord {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string | null;
  method: string | null;
  payment_for: string | null;
  notes: string | null;
  reference: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
}

export interface PaymentTotalsRow {
  currency: string;
  total: number;
  count: number;
}

interface PaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

const CURRENCIES = ["SYP", "USD"] as const;
const METHODS = ["sham_cash", "syriatel_cash", "mtn_cash", "cash"] as const;

function toLocalInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoString(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const emptyForm = {
  amount: "",
  currency: "SYP",
  date: "",
  method: "cash",
  paymentFor: "",
};

export function PaymentsDialog({ open, onOpenChange, userId, userName }: PaymentsDialogProps) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totals, setTotals] = useState<PaymentTotalsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState<PaymentRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalsShown: PaymentTotalsRow[] =
    totals.length > 0
      ? totals
      : payments.length > 0
        ? computePaymentTotals(payments.map((p) => ({ amount: p.amount, currency: p.currency })))
        : [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_user_payments", { _user_id: userId });
      if (error) throw error;
      const result = data as unknown as { ok: boolean; payments?: PaymentRecord[]; totals?: PaymentTotalsRow[] };
      if (!result?.ok) throw new Error((result as { reason?: string })?.reason || "failed");
      setPayments(result.payments || []);
      setTotals(result.totals || []);
    } catch {
      setPayments([]);
      setTotals([]);
      toast.error(t("adminPayments.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setFormOpen(false);
      setEditing(null);
      setDeleting(null);
      load();
    }
  }, [open, load]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const amount = Number(form.amount);
    if (form.amount.trim() === "") e.amount = t("adminPayments.amountRequired");
    else if (!Number.isFinite(amount) || amount <= 0) e.amount = t("adminPayments.amountPositive");
    if (!form.currency) e.currency = t("adminPayments.currencyRequired");
    if (!form.date) e.date = t("adminPayments.dateRequired");
    if (!form.method) e.method = t("adminPayments.methodRequired");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: toLocalInputValue(new Date().toISOString()) || "" });
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (p: PaymentRecord) => {
    setEditing(p);
    setForm({
      amount: String(p.amount),
      currency: p.currency && CURRENCIES.includes(p.currency as (typeof CURRENCIES)[number]) ? p.currency : "SYP",
      date: toLocalInputValue(p.payment_date),
      method: p.method && METHODS.includes(p.method as (typeof METHODS)[number]) ? p.method : "cash",
      paymentFor: p.payment_for || "",
    });
    setErrors({});
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        _amount: Number(form.amount),
        _currency: form.currency,
        _payment_date: toIsoString(form.date),
        _payment_method: form.method,
        _payment_for: form.paymentFor.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.rpc("admin_update_payment", { _payment_id: editing.id, ...payload });
        if (error) throw error;
        toast.success(t("adminPayments.updateSuccess"));
      } else {
        const { error } = await supabase.rpc("admin_add_payment", { _user_id: userId, ...payload });
        if (error) throw error;
        toast.success(t("adminPayments.addSuccess"));
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminPayments.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_delete_payment", { _payment_id: deleting.id });
      if (error) throw error;
      toast.success(t("adminPayments.deleteSuccess"));
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminPayments.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("adminPayments.title")}</DialogTitle>
          <DialogDescription>{userName}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          {totalsShown.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("adminPayments.total")}: 0</p>
          ) : (
            totalsShown.map((row) => (
              <span key={row.currency} className="text-xs px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-semibold whitespace-nowrap">
                {t("adminPayments.totalFor", { currency: row.currency })}:{" "}
                <span dir="ltr">{Number(row.total).toLocaleString()}</span> {row.currency}
              </span>
            ))
          )}
          <div className="flex-1" />
          <Button size="sm" variant="default" className="h-9 rounded-xl text-xs" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 me-1" />
            {t("adminPayments.add")}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 rounded-xl text-xs" onClick={load} title={t("common.refresh")}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("adminPayments.noPayments")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminPayments.amount")}</th>
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminPayments.currency")}</th>
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminPayments.date")}</th>
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminPayments.method")}</th>
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminPayments.paymentFor")}</th>
                  <th className="text-start p-3 font-semibold text-xs text-muted-foreground">{t("adminActivationRequests.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-smooth">
                    <td className="p-3 font-semibold whitespace-nowrap" dir="ltr">{Number(p.amount).toLocaleString()}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{p.currency || "SYP"}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{formatDateTime(p.payment_date)}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {p.method && METHODS.includes(p.method as (typeof METHODS)[number])
                        ? t(`adminPayments.method${p.method[0].toUpperCase()}${p.method.slice(1)}`)
                        : p.payment_method || "-"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground break-all min-w-[120px]">{p.payment_for || "-"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" title={t("adminPayments.edit")} onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5 me-1" />
                          {t("adminPayments.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-destructive" title={t("adminPayments.delete")} onClick={() => setDeleting(p)}>
                          <Trash2 className="w-3.5 h-3.5 me-1" />
                          {t("adminPayments.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="rounded-2xl max-w-sm">
            <DialogHeader>
              <DialogTitle>{editing ? t("adminPayments.edit") : t("adminPayments.add")}</DialogTitle>
              <DialogDescription>{userName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label>{t("adminPayments.amount")} *</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="rounded-xl"
                  dir="ltr"
                />
                {errors.amount && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.amount}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("adminPayments.currency")} *</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SYP">{t("adminPayments.currencySYP")} (SYP)</SelectItem>
                    <SelectItem value="USD">{t("adminPayments.currencyUSD")} (USD)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.currency && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.currency}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("adminPayments.date")} *</Label>
                <Input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-xl"
                />
                {errors.date && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.date}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("adminPayments.method")} *</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sham_cash">{t("adminPayments.methodShamCash")}</SelectItem>
                    <SelectItem value="syriatel_cash">{t("adminPayments.methodSyriatelCash")}</SelectItem>
                    <SelectItem value="mtn_cash">{t("adminPayments.methodMtnCash")}</SelectItem>
                    <SelectItem value="cash">{t("adminPayments.methodCash")}</SelectItem>
                  </SelectContent>
                </Select>
                {errors.method && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.method}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("adminPayments.paymentFor")}</Label>
                <Input
                  value={form.paymentFor}
                  onChange={(e) => setForm({ ...form, paymentFor: e.target.value })}
                  placeholder={t("adminPayments.paymentForPlaceholder")}
                  className="rounded-xl"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                {t("adminPayments.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
                {t("adminPayments.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
          <DialogContent className="rounded-2xl max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("adminPayments.confirmDelete")}</DialogTitle>
            </DialogHeader>
            {deleting && (
              <div className="space-y-1 text-sm bg-muted/30 rounded-xl p-3">
                <p>{t("adminPayments.amount")}: <b dir="ltr">{Number(deleting.amount).toLocaleString()} {deleting.currency || "SYP"}</b></p>
                <p>{t("adminPayments.date")}: {formatDateTime(deleting.payment_date)}</p>
                <p>{t("adminPayments.method")}: {deleting.method && METHODS.includes(deleting.method as (typeof METHODS)[number]) ? t(`adminPayments.method${deleting.method[0].toUpperCase()}${deleting.method.slice(1)}`) : deleting.payment_method || "-"}</p>
                {deleting.payment_for && <p>{t("adminPayments.paymentFor")}: {deleting.payment_for}</p>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("adminPayments.confirmDeleteDesc")}</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)} disabled={saving}>
                {t("adminPayments.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
                {t("adminPayments.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
