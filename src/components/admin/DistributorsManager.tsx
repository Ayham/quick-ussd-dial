import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Users, Search, UserPlus, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function DistributorsManager() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [distributors, setDistributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedDist, setSelectedDist] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: profiles, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setDistributors((profiles || []).filter((p: any) => p.role === "distributor"));
    } catch (err: any) {
      const msg = err?.message || (err instanceof Error ? err.message : JSON.stringify(err));
      setLoadError(msg);
      toast.error(msg || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAssign = async (dist: any) => {
    setSelectedDist(dist);
    setShowAssign(true);
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("role", "customer").order("display_name");
      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load customers");
      setCustomers([]);
    }
  };

  const handleAssign = async (customerId: string) => {
    if (!selectedDist) return;
    try {
      const user = await supabase.auth.getUser();
      const { error } = await supabase.from("distributor_customers").upsert({
        distributor_id: selectedDist.user_id,
        customer_id: customerId,
        assigned_by: user.data.user?.id || "",
      });
      if (error) throw error;
      toast.success(isArabic ? "تم تعيين العميل" : "Customer assigned");
      setShowAssign(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to assign customer");
    }
  };

  const filteredDistributors = distributors.filter(
    (d) =>
      !search ||
      d.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">{isArabic ? "الموزعون" : "Distributors"}</h2>
      </div>

      {loadError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isArabic ? "بحث..." : "Search..."}
            className="ps-10 h-10 rounded-xl"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">{isArabic ? "جاري التحميل..." : "Loading..."}</div>
      ) : !filteredDistributors.length ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{isArabic ? "لا يوجد موزعون" : "No distributors"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDistributors.map((dist) => (
            <div key={dist.user_id} className="bg-card border border-border rounded-2xl p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold">{dist.display_name || dist.email}</p>
                  <p className="text-[11px] text-muted-foreground">{dist.email || dist.phone}</p>
                </div>
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={() => openAssign(dist)}>
                  <UserPlus className="w-3.5 h-3.5 me-1" />
                  {isArabic ? "تعيين عميل" : "Assign"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAssign && selectedDist && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowAssign(false)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">{isArabic ? "تعيين عميل لـ" : "Assign customer to"} {selectedDist.display_name}</h3>
            <div className="flex-1 overflow-y-auto space-y-1">
              {!customers.length ? (
                <div className="text-center py-4 text-xs text-muted-foreground">{isArabic ? "لا يوجد عملاء" : "No customers"}</div>
              ) : (
                customers.map((c) => (
                  <button
                    key={c.user_id}
                    onClick={() => handleAssign(c.user_id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-smooth text-start"
                  >
                    <div>
                      <p className="text-xs font-bold">{c.display_name || c.email}</p>
                      <p className="text-[10px] text-muted-foreground">{c.email}</p>
                    </div>
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
            <Button variant="outline" className="w-full mt-3 h-9 rounded-xl text-xs" onClick={() => setShowAssign(false)}>
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
