import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Edit, Trash2, QrCode, MessageCircle, RefreshCw, AlertCircle } from "lucide-react";

interface PaymentMethod {
  id: string;
  title: string;
  description: string | null;
  details: string | null;
  qr_image_url: string | null;
  whatsapp_number: string | null;
  is_active: boolean;
  display_order: number;
}

export const PaymentMethodsAdmin = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadMethods = async () => {
    setLoading(true);
    setTableMissing(false);
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          setTableMissing(true);
        } else {
          throw error;
        }
      }
      setMethods(data || []);
    } catch (err: any) {
      if (err?.message?.includes("does not exist") || err?.code === "42P01") {
        setTableMissing(true);
      } else {
        toast.error(err.message || "Failed to load payment methods");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const handleOpenCreate = () => {
    setEditingMethod(null);
    setTitle("");
    setDescription("");
    setDetails("");
    setQrImageUrl("");
    setWhatsappNumber("");
    setIsActive(true);
    setDisplayOrder(methods.length + 1);
    setDialogOpen(true);
  };

  const handleOpenEdit = (m: PaymentMethod) => {
    setEditingMethod(m);
    setTitle(m.title);
    setDescription(m.description || "");
    setDetails(m.details || "");
    setQrImageUrl(m.qr_image_url || "");
    setWhatsappNumber(m.whatsapp_number || "");
    setIsActive(m.is_active);
    setDisplayOrder(m.display_order || 0);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        description: description || null,
        details: details || null,
        qr_image_url: qrImageUrl || null,
        whatsapp_number: whatsappNumber || null,
        is_active: isActive,
        display_order: Number(displayOrder),
      };

      if (editingMethod) {
        const { error } = await supabase
          .from("payment_methods")
          .update(payload)
          .eq("id", editingMethod.id);
        if (error) throw error;
        toast.success("Payment method updated successfully");
      } else {
        const { error } = await supabase
          .from("payment_methods")
          .insert([payload]);
        if (error) throw error;
        toast.success("Payment method created successfully");
      }
      setDialogOpen(false);
      loadMethods();
    } catch (err: any) {
      toast.error(err.message || "Failed to save payment method");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) return;
    try {
      const { error } = await supabase.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
      toast.success("Payment method deleted");
      loadMethods();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete payment method");
    }
  };

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">إدارة طرق الدفع</h2>
          <p className="text-xs text-muted-foreground">إضافة وتعديل طرق الدفع المتاحة للمستخدمين (شام كاش، سيرياتيل كاش، حوالات، إلخ)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={loadMethods} title="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" /> إضافة طريقة دفع
          </Button>
        </div>
      </div>

      {tableMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">جدول `payment_methods` غير موجود بعد في قاعدة بيانات Supabase.</p>
            <p>يرجى تنفيذ ملف الهجرة (Migration) أو سكربت SQL الخاص بنظام التفعيل في محرر SQL في لوحة تحكم Supabase لديك لإنشاء الجداول والدوال المطلوبة.</p>
          </div>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">العنوان / التفاصيل</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">رقم الواتساب</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الحالة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الترتيب</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-28" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-12" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-24" /></td>
                  </tr>
                ))
              ) : methods.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    {tableMissing ? "لا يمكن جلب طرق الدفع (الجدول غير موجود)" : "لا توجد طرق دفع متاحة حالياً."}
                  </td>
                </tr>
              ) : (
                methods.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{m.details || m.description || "-"}</div>
                    </td>
                    <td className="p-3 text-xs font-mono" dir="ltr">
                      {m.whatsapp_number ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <MessageCircle className="w-3.5 h-3.5" /> {m.whatsapp_number}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">
                      {m.is_active ? (
                        <Badge className="bg-success text-white">مفعلة</Badge>
                      ) : (
                        <Badge variant="secondary">معطلة</Badge>
                      )}
                    </td>
                    <td className="p-3 text-sm">{m.display_order}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleOpenEdit(m)}>
                          <Edit className="w-3.5 h-3.5" /> تعديل
                        </Button>
                        <Button size="sm" variant="destructive" className="h-8 text-xs gap-1" onClick={() => handleDelete(m.id)}>
                          <Trash2 className="w-3.5 h-3.5" /> حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMethod ? "تعديل طريقة الدفع" : "إضافة طريقة دفع جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-1">
            <div className="space-y-1.5">
              <Label>عنوان طريقة الدفع (مثال: شام كاش)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم طريقة الدفع" />
            </div>

            <div className="space-y-1.5">
              <Label>الوصف / التعليمات</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="تعليمات التحويل أو الإيداع للمستخدم" className="h-20" />
            </div>

            <div className="space-y-1.5">
              <Label>تفاصيل الحساب / الرقم</Label>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="رقم الحساب، اسم صاحب الحساب، أو أي تفاصيل أخرى" className="h-20 font-mono text-xs" />
            </div>

            <div className="space-y-1.5">
              <Label>رابط صورة QR أو كود QR (اختياري)</Label>
              <Input value={qrImageUrl} onChange={(e) => setQrImageUrl(e.target.value)} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label>رقم الواتساب لاستلام إشعارات الدفع (مع رمز الدولة)</Label>
              <Input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+9639xxxxxxxx" dir="ltr" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الترتيب</Label>
                <Input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} id="method_active" />
                <Label htmlFor="method_active">طريقة الدفع مفعلة وتظهر للمستخدمين</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ طريقة الدفع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
