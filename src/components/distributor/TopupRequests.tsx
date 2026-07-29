import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getDistributorTopupRequests,
  completeTopupRequest,
  cancelTopupRequest,
  type TopupRequest,
} from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

export function TopupRequests({ distributorId }: { distributorId: string }) {
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [cancelNotes, setCancelNotes] = useState<Record<string, string>>({});
  const [showCancelFor, setShowCancelFor] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<Map<string, string>>(new Map());

  const load = async () => {
    setLoading(true);
    const data = await getDistributorTopupRequests(distributorId);
    setRequests(data);

    if (data.length > 0) {
      const customerIds = [...new Set(data.map(r => r.customer_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", customerIds);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.display_name || "Unknown"]));
      setCustomerNames(nameMap);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [distributorId]);

  const handleComplete = async (id: string) => {
    setBusy(id);
    const result = await completeTopupRequest(id);
    setBusy(null);
    if (result.ok) {
      toast.success("Topup completed");
      load();
    } else {
      toast.error(result.error || "Failed");
    }
  };

  const handleCancel = async (id: string) => {
    setBusy(id);
    const result = await cancelTopupRequest(id, cancelNotes[id] || undefined);
    setBusy(null);
    if (result.ok) {
      toast.success("Request cancelled");
      setShowCancelFor(null);
      load();
    } else {
      toast.error(result.error || "Failed");
    }
  };

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-accent" />;
      case "processing": return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "completed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "cancelled": return <XCircle className="w-4 h-4 text-destructive" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-accent/10 text-accent";
      case "processing": return "bg-primary/10 text-primary";
      case "completed": return "bg-success/10 text-success";
      case "cancelled": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Topup Requests</h2>
        {pendingCount > 0 && (
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {["all", "pending", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-smooth ${
              filter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No requests found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <div key={req.id} className="bg-card border border-border rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {statusIcon(req.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{req.amount.toLocaleString()}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${statusColor(req.status)}`}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {customerNames.get(req.customer_id) || "Customer"} · {req.operator.toUpperCase()} · {new Date(req.created_at).toLocaleDateString("ar-SY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {req.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{req.notes}</p>}
                  </div>
                </div>
              </div>

              {req.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={busy === req.id}
                    onClick={() => handleComplete(req.id)}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/30"
                    disabled={busy === req.id}
                    onClick={() => setShowCancelFor(showCancelFor === req.id ? null : req.id)}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />Cancel
                  </Button>
                </div>
              )}

              {showCancelFor === req.id && (
                <div className="mt-2 space-y-2">
                  <Input
                    placeholder="Cancellation reason (optional)"
                    value={cancelNotes[req.id] || ""}
                    onChange={(e) => setCancelNotes({ ...cancelNotes, [req.id]: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    disabled={busy === req.id}
                    onClick={() => handleCancel(req.id)}
                  >
                    Confirm Cancel
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
