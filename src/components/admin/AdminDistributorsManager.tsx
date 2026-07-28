import { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, Search, ChevronDown, Shield, ArrowLeftRight,
  RefreshCw, Phone, Mail, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuthSession } from "@/lib/auth-session";
import {
  getAllDistributors,
  getAllCustomers,
  assignCustomerToDistributor,
  moveCustomerToDistributor,
  getAllTopupRequests,
  type DistributorProfile,
  type TopupRequest,
} from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

export function AdminDistributorsManager() {
  const { user } = useAuthSession();
  const [activeTab, setActiveTab] = useState<"distributors" | "customers" | "topups">("distributors");
  const [distributors, setDistributors] = useState<DistributorProfile[]>([]);
  const [customers, setCustomers] = useState<DistributorProfile[]>([]);
  const [topupRequests, setTopupRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigningCustomer, setAssigningCustomer] = useState<string | null>(null);
  const [selectedDistributor, setSelectedDistributor] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c, t] = await Promise.all([
        getAllDistributors(),
        getAllCustomers(),
        getAllTopupRequests(),
      ]);
      setDistributors(d);
      setCustomers(c);
      setTopupRequests(t);
    } catch (e) {
      console.error("Admin load error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (customerId: string, distributorId: string) => {
    if (!user) return;
    const { success, error } = await assignCustomerToDistributor(customerId, distributorId, user.id);
    if (success) {
      toast.success("تم تعيين العميل بنجاح");
      load();
    } else {
      toast.error(error || "فشل التعيين");
    }
    setAssigningCustomer(null);
    setSelectedDistributor("");
  };

  const handleMove = async (customerId: string, newDistributorId: string) => {
    if (!user) return;
    const { success, error } = await moveCustomerToDistributor(customerId, newDistributorId, user.id);
    if (success) {
      toast.success("تم نقل العميل بنجاح");
      load();
    } else {
      toast.error(error || "فشل النقل");
    }
  };

  const filteredDistributors = distributors.filter((d) => {
    const s = search.toLowerCase();
    return !s || d.display_name?.toLowerCase().includes(s) || d.email?.toLowerCase().includes(s) || d.phone?.includes(s);
  });

  const filteredCustomers = customers.filter((c) => {
    const s = search.toLowerCase();
    return !s || c.display_name?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.phone?.includes(s);
  });

  return (
    <div className="space-y-4" dir="rtl">
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: "distributors" as const, label: "الموزعون", icon: Users, count: distributors.length },
          { id: "customers" as const, label: "العملاء", icon: UserPlus, count: customers.length },
          { id: "topups" as const, label: "طلبات الشحن", icon: RefreshCw, count: topupRequests.filter(t => t.status === "pending").length },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
              activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 rounded-full ${
                activeTab === tab.id ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث..."
          className="h-10 pr-9 rounded-xl text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>
      ) : (
        <>
          {/* Distributors Tab */}
          {activeTab === "distributors" && (
            <div className="space-y-2">
              {filteredDistributors.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">لا يوجد موزعون</p>
              ) : (
                filteredDistributors.map((d) => (
                  <div key={d.user_id} className="bg-card border border-border rounded-xl p-4 shadow-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold text-foreground">{d.display_name || "بدون اسم"}</span>
                        </div>
                        {d.phone && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                            <Phone className="w-3 h-3" />{d.phone}
                          </p>
                        )}
                        {d.email && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />{d.email}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {d.user_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Customers Tab */}
          {activeTab === "customers" && (
            <div className="space-y-2">
              {filteredCustomers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">لا يوجد عملاء</p>
              ) : (
                filteredCustomers.map((c) => (
                  <div key={c.user_id} className="bg-card border border-border rounded-xl p-3 shadow-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{c.display_name || "بدون اسم"}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            c.customer_status === "active" ? "bg-green-500/10 text-green-600" :
                            c.customer_status === "blocked" ? "bg-red-500/10 text-red-600" :
                            "bg-gray-500/10 text-gray-600"
                          }`}>
                            {c.customer_status === "active" ? "نشط" : c.customer_status === "blocked" ? "محظور" : "مؤرشف"}
                          </span>
                        </div>
                        {c.phone && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                            <Phone className="w-3 h-3" />{c.phone}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {c.distributor_id ? (
                          <span className="text-[10px] text-muted-foreground">
                            معيّن لـ {distributors.find(d => d.user_id === c.distributor_id)?.display_name || "?"}
                          </span>
                        ) : null}
                        <div className="relative">
                          <button
                            onClick={() => setAssigningCustomer(assigningCustomer === c.user_id ? null : c.user_id)}
                            className="p-1.5 rounded-lg hover:bg-muted text-primary"
                            title="تعيين لموزع"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                          {assigningCustomer === c.user_id && (
                            <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-xl shadow-elevated z-20 min-w-[180px] p-2">
                              <select
                                value={selectedDistributor}
                                onChange={(e) => {
                                  setSelectedDistributor(e.target.value);
                                  if (e.target.value) handleAssign(c.user_id, e.target.value);
                                }}
                                className="w-full text-xs p-2 rounded-lg border border-border"
                              >
                                <option value="">اختر موزعاً...</option>
                                {distributors.map((d) => (
                                  <option key={d.user_id} value={d.user_id}>
                                    {d.display_name || d.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Topup Requests Tab */}
          {activeTab === "topups" && (
            <div className="space-y-2">
              {topupRequests.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات شحن</p>
              ) : (
                topupRequests.map((req) => (
                  <div key={req.id} className="bg-card border border-border rounded-xl p-3 shadow-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {req.operator === "syriatel" ? "سيريتل" : "MTN"}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            req.status === "pending" ? "bg-accent/10 text-accent" :
                            req.status === "completed" ? "bg-green-500/10 text-green-600" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {req.status === "pending" ? "معلق" : req.status === "completed" ? "مكتمل" : req.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(req.created_at).toLocaleDateString("ar-SY")}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {req.amount.toLocaleString()} ل.س
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
