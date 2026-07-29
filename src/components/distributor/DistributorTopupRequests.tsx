import { useState, useEffect, useCallback } from "react";
import {
  Clock, CheckCircle, XCircle, Loader2, RefreshCw,
  Phone, AlertTriangle, ArrowDownCircle, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/auth-session";
import {
  getDistributorTopupRequests,
  processTopupRequest,
  cancelTopupRequest,
  type TopupRequest,
} from "@/lib/distributor-management";

interface Props {
  customerId?: string; // If provided, show only this customer's requests
}

export function DistributorTopupRequests({ customerId }: Props) {
  const { user } = useAuthSession();
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user && !customerId) return;
    setLoading(true);
    try {
      // For distributor view, use distributor_id
      // For customer view, we need to filter by customer_id
      if (customerId) {
        // Customer's own requests - direct query
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("topup_requests")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });
        setRequests((data || []) as TopupRequest[]);
      } else if (user) {
        const data = await getDistributorTopupRequests(user.id, statusFilter === "all" ? undefined : statusFilter);
        setRequests(data);
      }
    } catch (e) {
      console.error("Load topup requests error:", e);
    }
    setLoading(false);
  }, [user, customerId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleProcess = async (id: string) => {
    setProcessingId(id);
    const { success, error } = await processTopupRequest(id);
    if (success) {
      toast.success("تمت معالجة الطلب");
      load();
    } else {
      toast.error(error || "فشلت المعالجة");
    }
    setProcessingId(null);
  };

  const handleCancel = async (id: string) => {
    const { success, error } = await cancelTopupRequest(id, "Cancelled by distributor");
    if (success) {
      toast.success("تم إلغاء الطلب");
      load();
    } else {
      toast.error(error || "فشل الإلغاء");
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-accent" />;
      case "processing": return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "completed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "cancelled": return <XCircle className="w-4 h-4 text-muted-foreground" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "معلق", processing: "قيد المعالجة", completed: "مكتمل", cancelled: "ملغي"
    };
    return map[status] || status;
  };

  const filtered = statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-3" dir="rtl">
      {/* Filter */}
      {!customerId && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(["all", "pending", "completed", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-smooth ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s === "all" ? "الكل" : statusLabel(s)}
              {s === "pending" && requests.filter(r => r.status === "pending").length > 0 && (
                <span className="mr-1 bg-accent/20 text-accent px-1.5 rounded-full">
                  {requests.filter(r => r.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Request List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ArrowDownCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>لا توجد طلبات شحن</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((req) => (
            <div key={req.id} className="bg-card border border-border rounded-xl p-3 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(req.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {req.operator === "syriatel" ? "سيريتل" : "MTN"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        req.status === "pending" ? "bg-accent/10 text-accent" :
                        req.status === "completed" ? "bg-success/10 text-success" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {statusLabel(req.status)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("ar-SY", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                    {req.notes && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{req.notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-sm font-bold text-primary">
                    {req.amount.toLocaleString()} ل.س
                  </span>
                </div>
              </div>

              {/* Action Buttons (distributor only, pending only) */}
              {!customerId && req.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={() => handleProcess(req.id)}
                    disabled={processingId === req.id}
                    size="sm"
                    className="h-8 text-[11px] rounded-lg flex-1"
                  >
                    {processingId === req.id ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-1" />
                    ) : (
                      <CheckCircle className="w-3 h-3 ml-1" />
                    )}
                    معالجة
                  </Button>
                  <Button
                    onClick={() => handleCancel(req.id)}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] rounded-lg text-destructive border-destructive/30"
                  >
                    <XCircle className="w-3 h-3 ml-1" />
                    إلغاء
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
