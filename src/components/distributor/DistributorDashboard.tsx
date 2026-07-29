import { useEffect, useState } from "react";
import { Users, Wallet, AlertTriangle, Clock, Activity, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown } from "lucide-react";
import { getDistributorStats, type DistributorStats } from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

export function DistributorDashboard({ distributorId }: { distributorId: string }) {
  const [stats, setStats] = useState<DistributorStats | null>(null);
  const [recentTx, setRecentTx] = useState<Array<{ id: string; type: string; amount: number; notes: string | null; created_at: string; customer_name?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, txResult] = await Promise.all([
        getDistributorStats(distributorId),
        supabase
          .from("customer_transactions")
          .select("id, type, amount, notes, created_at, customer_id")
          .eq("distributor_id", distributorId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setStats(s);

      if (txResult.data && txResult.data.length > 0) {
        const customerIds = [...new Set(txResult.data.map((t) => t.customer_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", customerIds);
        const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name]));
        setRecentTx(
          txResult.data.map((t) => ({
            ...t,
            customer_name: nameMap.get(t.customer_id) || undefined,
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [distributorId]);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>;
  }

  if (!stats) {
    return <div className="p-4 text-sm text-muted-foreground text-center">Failed to load dashboard</div>;
  }

  const txTypeIcon = (type: string) => {
    switch (type) {
      case "topup": return <ArrowDownCircle className="w-4 h-4 text-primary" />;
      case "payment": return <ArrowUpCircle className="w-4 h-4 text-accent" />;
      case "debt": return <TrendingDown className="w-4 h-4 text-destructive" />;
      case "credit": return <TrendingUp className="w-4 h-4 text-success" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const txTypeLabel = (type: string) => {
    switch (type) {
      case "topup": return "Topup";
      case "payment": return "Payment";
      case "debt": return "Debt";
      case "credit": return "Credit";
      case "adjustment": return "Adjustment";
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Dashboard</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Customers</span>
          </div>
          <p className="text-2xl font-bold">{stats.totalCustomers}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Total Debt</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{stats.totalDebt.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Balance</span>
          </div>
          <p className="text-2xl font-bold text-primary">{stats.totalBalance.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-accent" />
            <span className="text-xs text-muted-foreground">Pending Topups</span>
          </div>
          <p className="text-2xl font-bold text-accent">{stats.pendingTopups}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold">Today's Activity</span>
          <span className="text-xs text-muted-foreground">{stats.todayTransactions} transactions</span>
        </div>
      </div>

      {recentTx.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  {txTypeIcon(tx.type)}
                  <div>
                    <p className="text-xs font-medium">{txTypeLabel(tx.type)}</p>
                    {tx.customer_name && (
                      <p className="text-[10px] text-muted-foreground">{tx.customer_name}</p>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <p className={`text-xs font-bold ${tx.type === "payment" || tx.type === "credit" ? "text-primary" : "text-foreground"}`}>
                    {tx.type === "payment" || tx.type === "credit" ? "+" : "-"}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString("ar-SY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
