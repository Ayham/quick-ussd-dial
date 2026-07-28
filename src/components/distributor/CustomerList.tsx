import { useState, useEffect } from "react";
import { Search, Users, Phone, Mail, ArrowLeft, AlertTriangle } from "lucide-react";
import { getDistributorCustomers, type CustomerWithProfile } from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  distributorId: string;
  onSelectCustomer: (userId: string) => void;
}

export function CustomerList({ distributorId, onSelectCustomer }: Props) {
  const [customers, setCustomers] = useState<CustomerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Map<string, { balance: number; debt: number }>>(new Map());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await getDistributorCustomers(distributorId);
      setCustomers(data);

      if (data.length > 0) {
        const ids = data.map((c) => c.user_id);
        const { data: accData } = await supabase
          .from("customer_accounts")
          .select("customer_id, current_balance, current_debt")
          .in("customer_id", ids);

        const map = new Map<string, { balance: number; debt: number }>();
        (accData || []).forEach((a) => {
          map.set(a.customer_id, { balance: a.current_balance, debt: a.current_debt });
        });
        setAccounts(map);
      }
      setLoading(false);
    }
    load();
  }, [distributorId]);

  const filtered = customers.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (c.display_name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-600";
      case "blocked": return "bg-destructive/10 text-destructive";
      case "archived": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Customers</h2>
        <span className="text-xs text-muted-foreground">{customers.length} total</span>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search by name, email, or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading customers...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {customers.length === 0 ? "No customers assigned yet" : "No customers match your search"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => {
            const acc = accounts.get(customer.user_id);
            return (
              <button
                key={customer.user_id}
                onClick={() => onSelectCustomer(customer.user_id)}
                className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/50 transition-smooth text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{customer.display_name || "Unknown"}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${statusColor(customer.customer_status || "active")}`}>
                      {(customer.customer_status || "active").toUpperCase()}
                    </span>
                  </div>
                  {customer.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />{customer.phone}
                    </p>
                  )}
                  {customer.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                      <Mail className="w-3 h-3" />{customer.email}
                    </p>
                  )}
                </div>
                <div className="text-left shrink-0">
                  {acc && (
                    <>
                      <p className="text-xs font-bold text-primary">{acc.balance.toLocaleString()}</p>
                      {acc.debt > 0 && (
                        <p className="text-[10px] text-destructive flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />{acc.debt.toLocaleString()}
                        </p>
                      )}
                    </>
                  )}
                  <ArrowLeft className="w-4 h-4 text-muted-foreground mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
