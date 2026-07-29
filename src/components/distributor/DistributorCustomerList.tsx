import { useState, useEffect, useCallback } from "react";
import {
  Search, ChevronLeft, Phone, Mail, Smartphone, AlertTriangle,
  UserCheck, UserX, Archive, MoreVertical, Edit3, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/auth-session";
import {
  getAllCustomersForDistributor,
  updateCustomerStatus,
  type DistributorCustomer,
  type CustomerStatus,
} from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onSelectCustomer: (customerId: string) => void;
  onBack: () => void;
}

export function DistributorCustomerList({ onSelectCustomer, onBack }: Props) {
  const { user } = useAuthSession();
  const [customers, setCustomers] = useState<DistributorCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "balance">("date");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getAllCustomersForDistributor(user.id);
      setCustomers(data);
    } catch (e) {
      console.error("Load customers error:", e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Enrich with account data
  const [enrichedCustomers, setEnrichedCustomers] = useState<DistributorCustomer[]>([]);
  useEffect(() => {
    async function enrich() {
      const enriched = await Promise.all(
        customers.map(async (c) => {
          const { data: account } = await supabase
            .from("customer_accounts")
            .select("current_balance, current_debt, last_topup, last_payment")
            .eq("customer_id", c.customer_id)
            .maybeSingle();
          return { ...c, account };
        })
      );
      setEnrichedCustomers(enriched);
    }
    if (customers.length > 0) enrich();
    else setEnrichedCustomers([]);
  }, [customers]);

  const filtered = enrichedCustomers
    .filter((c) => {
      const p = c.profile;
      if (!p) return false;
      const s = search.toLowerCase();
      const matchSearch = !s || 
        p.display_name?.toLowerCase().includes(s) ||
        p.email?.toLowerCase().includes(s) ||
        p.phone?.includes(s) ||
        p.user_id.toLowerCase().includes(s);
      const matchStatus = statusFilter === "all" || p.customer_status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "name") return (a.profile?.display_name || "").localeCompare(b.profile?.display_name || "");
      if (sortBy === "balance") return (b.account?.current_balance || 0) - (a.account?.current_balance || 0);
      return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime();
    });

  const handleStatusChange = async (customerId: string, status: CustomerStatus) => {
    const { success, error } = await updateCustomerStatus(customerId, status);
    if (success) {
      toast.success("تم تحديث حالة العميل");
      load();
    } else {
      toast.error(error || "فشل التحديث");
    }
    setMenuOpen(null);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      active: { label: "نشط", className: "bg-success/10 text-success" },
      blocked: { label: "محظور", className: "bg-destructive/10 text-destructive" },
      archived: { label: "مؤرشف", className: "bg-muted text-muted-foreground" },
    };
    const info = map[status] || map.active;
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.className}`}>
        {info.label}
      </span>
    );
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold">العملاء ({filtered.length})</h2>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم، الهاتف، البريد..."
          className="h-10 pr-9 rounded-xl text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", "active", "blocked", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-smooth ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "الكل" : s === "active" ? "نشط" : s === "blocked" ? "محظور" : "مؤرشف"}
          </button>
        ))}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground border-0"
        >
          <option value="date">الأحدث</option>
          <option value="name">الاسم</option>
          <option value="balance">الرصيد</option>
        </select>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{search ? "لا توجد نتائج" : "لم يتم تعيين عملاء بعد"}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => {
            const p = c.profile;
            if (!p) return null;
            return (
              <div
                key={c.customer_id}
                className="bg-card border border-border rounded-xl p-3 shadow-card"
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => onSelectCustomer(c.customer_id)}
                    className="flex-1 text-right"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground">
                        {p.display_name || "بدون اسم"}
                      </span>
                      {statusBadge(p.customer_status)}
                    </div>
                    {p.phone && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />{p.phone}
                      </p>
                    )}
                    {p.email && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />{p.email}
                      </p>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    {c.account && (
                      <div className="text-left">
                        <p className={`text-sm font-bold ${c.account.current_balance >= 0 ? "text-primary" : "text-destructive"}`}>
                          {c.account.current_balance.toLocaleString()}
                        </p>
                        {c.account.current_debt > 0 && (
                          <p className="text-[10px] text-destructive font-medium">
                            دين: {c.account.current_debt.toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === c.customer_id ? null : c.customer_id)}
                        className="p-1.5 rounded-lg hover:bg-muted"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                      {menuOpen === c.customer_id && (
                        <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-xl shadow-elevated z-20 min-w-[140px]">
                          <button
                            onClick={() => { onSelectCustomer(c.customer_id); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted rounded-t-xl"
                          >
                            <Eye className="w-3.5 h-3.5" /> عرض التفاصيل
                          </button>
                          {p.customer_status === "active" ? (
                            <button
                              onClick={() => handleStatusChange(c.customer_id, "blocked")}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-destructive"
                            >
                              <UserX className="w-3.5 h-3.5" /> حظر
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(c.customer_id, "active")}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-success"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> تفعيل
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(c.customer_id, "archived")}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted rounded-b-xl"
                          >
                            <Archive className="w-3.5 h-3.5" /> أرشفة
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Import Users icon for empty state
import { Users } from "lucide-react";
