import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, CheckCircle, XCircle, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type TopupRequest } from "@/lib/distributor-management";

export default function DistributorRequests() {
  const { i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("topup_requests")
        .select("*, profiles:customer_id(display_name, email)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRequests((data || []) as any);
    } catch (err: any) {
      toast.error(err.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (req: TopupRequest) => {
    setProcessingId(req.id);
    try {
      const { error } = await supabase.rpc("complete_topup_request", { p_request_id: req.id });
      if (error) throw error;
      toast.success(isArabic ? "تمت المعالجة" : "Completed");
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (req: TopupRequest) => {
    if (!confirm(isArabic ? "إلغاء هذا الطلب؟" : "Cancel this request?")) return;
    setProcessingId(req.id);
    try {
      const { error } = await supabase.rpc("cancel_topup_request", { p_request_id: req.id });
      if (error) throw error;
      toast.success(isArabic ? "تم الإلغاء" : "Cancelled");
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-accent/10 text-accent", label: isArabic ? "معلق" : "Pending" },
      processing: { cls: "bg-primary/10 text-primary", label: isArabic ? "جاري" : "Processing" },
      completed: { cls: "bg-success/10 text-success", label: isArabic ? "مكتمل" : "Completed" },
      cancelled: { cls: "bg-muted text-muted-foreground", label: isArabic ? "ملغي" : "Cancelled" },
    };
    return map[s] || map.pending;
  };

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center gap-3 shadow-elevated">
        <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => nav("/dm")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-primary-foreground text-lg font-bold tracking-tight">
            {isArabic ? "طلبات الرصيد" : "Topup Requests"}
          </h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto pb-8 space-y-4">
        <div className="flex gap-2 overflow-x-auto">
          {["all", "pending", "processing", "completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
              }`}
            >
              {s === "all" ? (isArabic ? "الكل" : "All") : statusBadge(s).label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{isArabic ? "جاري التحميل..." : "Loading..."}</div>
        ) : !requests.length ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد طلبات" : "No requests"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const badge = statusBadge(req.status);
              const isPending = req.status === "pending" || req.status === "processing";
              return (
                <div key={req.id} className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold">{(req as any).profiles?.display_name || (req as any).profiles?.email || "Customer"}</p>
                      <p className="text-[11px] text-muted-foreground">{req.operator} • {req.amount.toLocaleString()} ل.س</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>
                  {isPending && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 rounded-xl font-bold" disabled={processingId === req.id} onClick={() => handleComplete(req)}>
                        {processingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 me-1" />}
                        {isArabic ? "إتمام" : "Complete"}
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl text-destructive border-destructive/30" disabled={processingId === req.id} onClick={() => handleCancel(req)}>
                        <XCircle className="w-3.5 h-3.5 me-1" />
                        {isArabic ? "إلغاء" : "Cancel"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}