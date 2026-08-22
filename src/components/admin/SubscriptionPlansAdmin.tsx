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
import { Plus, Edit, Trash2, Star, CheckCircle, XCircle, RefreshCw, AlertCircle } from "lucide-react";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  duration_days: number;
  price: number;
  currency: string;
  max_devices: number;
  is_active: boolean;
  is_featured?: boolean;
  display_order: number;
}

export const SubscriptionPlansAdmin = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableOrColumnMissing, setTableOrColumnMissing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [price, setPrice] = useState(0);
  const [currency, setCurrency] = useState("SYP");
  const [maxDevices, setMaxDevices] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    setTableOrColumnMissing(false);
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          setTableOrColumnMissing(true);
        } else {
          throw error;
        }
      }
      setPlans(data || []);
    } catch (err: any) {
      if (err?.message?.includes("does not exist") || err?.code === "42P01" || err?.message?.includes("column")) {
        setTableOrColumnMissing(true);
      } else {
        toast.error(err.message || "Failed to load plans");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setCode("");
    setName("");
    setDescription("");
    setDurationDays(30);
    setPrice(0);
    setCurrency("SYP");
    setMaxDevices(1);
    setIsActive(true);
    setIsFeatured(false);
    setDisplayOrder(plans.length + 1);
    setDialogOpen(true);
  };

  const handleOpenEdit = (p: Plan) => {
    setEditingPlan(p);
    setCode(p.code);
    setName(p.name);
    setDescription(p.description || "");
    setDurationDays(p.duration_days);
    setPrice(p.price);
    setCurrency(p.currency || "SYP");
    setMaxDevices(p.max_devices || 1);
    setIsActive(p.is_active);
    setIsFeatured(p.is_featured ?? false);
    setDisplayOrder(p.display_order || 0);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!code || !name) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        code,
        name,
        description: description || null,
        duration_days: Number(durationDays),
        price: Number(price),
        currency,
        max_devices: Number(maxDevices),
        is_active: isActive,
        display_order: Number(displayOrder),
      };

      try {
        payload.is_featured = isFeatured;
      } catch (e) {
        // ignore if column missing
      }

      if (editingPlan) {
        const { error } = await supabase
          .from("subscription_plans")
          .update(payload)
          .eq("id", editingPlan.id);
        if (error) throw error;
        toast.success("Plan updated successfully");
      } else {
        const { error } = await supabase
          .from("subscription_plans")
          .insert([payload]);
        if (error) throw error;
        toast.success("Plan created successfully");
      }
      setDialogOpen(false);
      loadPlans();
    } catch (err: any) {
      toast.error(err.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;
    try {
      const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
      if (error) throw error;
      toast.success("Plan deleted");
      loadPlans();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete plan");
    }
  };

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">إدارة الباقات</h2>
          <p className="text-xs text-muted-foreground">إضافة وتعديل باقات الاشتراك المتاحة للمستخدمين</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={loadPlans} title="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" /> إضافة باقة جديدة
          </Button>
        </div>
      </div>

      {tableOrColumnMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">التحديثات الجديدة لقاعدة البيانات (مثل عمود `is_featured` أو جدول `payment_methods`) لم تُنفذ بعد في Supabase.</p>
            <p>يرجى تشغيل سكربت الهجرة في محرر SQL في لوحة تحكم Supabase لتفعيل كافة الميزات.</p>
          </div>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الكود / الاسم</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">المدة (أيام)</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">السعر</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الأجهزة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">الحالة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">عروض خاصة</th>
                <th className="text-start p-3 font-semibold text-xs text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-12" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-8 w-24" /></td>
                  </tr>
                ))
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    لا توجد باقات متاحة حالياً.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                    </td>
                    <td className="p-3 text-sm">{p.duration_days} يوم</td>
                    <td className="p-3 font-semibold">{Number(p.price).toLocaleString()} {p.currency}</td>
                    <td className="p-3 text-sm">{p.max_devices}</td>
                    <td className="p-3">
                      {p.is_active ? (
                        <Badge className="bg-success text-white">مفعلة</Badge>
                      ) : (
                        <Badge variant="secondary">معطلة</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {p.is_featured ? (
                        <Badge className="bg-amber-500 text-white gap-1"><Star className="w-3 h-3 fill-white" /> عرض خاص</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleOpenEdit(p)}>
                          <Edit className="w-3.5 h-3.5" /> تعديل
                        </Button>
                        <Button size="sm" variant="destructive" className="h-8 text-xs gap-1" onClick={() => handleDelete(p.id)}>
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
            <DialogTitle>{editingPlan ? "تعديل الباقة" : "إضافة باقة جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>كود الباقة (رمز فريد)</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. monthly_pro" />
              </div>
              <div className="space-y-1.5">
                <Label>اسم الباقة</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الباقة الشهرية" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>الوصف</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر للباقة ومميزاتها" className="h-20" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>مدة التفعيل (بالأيام)</Label>
                <Input type="number" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>السعر</Label>
                <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>العملة</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>عدد الأجهزة</Label>
                <Input type="number" value={maxDevices} onChange={(e) => setMaxDevices(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>الترتيب</Label>
                <Input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} id="is_active" />
                <Label htmlFor="is_active">الباقة مفعلة وتظهر للمستخدمين</Label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="is_featured" />
                <Label htmlFor="is_featured">عرض خاص (مميزة / الأكثر تميزاً)</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الباقة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
