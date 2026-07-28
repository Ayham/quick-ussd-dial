import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ArrowLeft, ChevronLeft, ChevronRight, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  searchCustomers,
  type CustomerWithProfile,
} from "@/lib/distributor-management";

export default function DistributorCustomers() {
  const { i18n } = useTranslation();
  const nav = useNavigate();
  const isArabic = i18n.language === "ar";
  const [customers, setCustomers] = useState<CustomerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await searchCustomers(debouncedSearch);
      setCustomers(results);
    } catch (err: any) {
      toast.error(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center gap-3 shadow-elevated">
        <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => nav("/dm")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-primary-foreground text-lg font-bold tracking-tight">
            {isArabic ? "العملاء" : "Customers"}
          </h1>
          <p className="text-sm text-muted-foreground">{customers.length} customers</p>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto pb-8 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isArabic ? "بحث بالاسم أو البريد..." : "Search by name or email..."}
              className="ps-10 h-11 rounded-xl"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{isArabic ? "جاري التحميل..." : "Loading..."}</div>
        ) : !customers.length ? (
          <div className="text-center py-12">
            <UserCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{isArabic ? "لا يوجد عملاء" : "No customers found"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customers.map((customer) => (
              <button
                key={customer.user_id}
                onClick={() => nav(`/dm/customer/${customer.user_id}`)}
                className="w-full bg-card border border-border rounded-2xl p-4 shadow-card hover:bg-muted/50 transition-smooth text-start"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <UserCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{customer.display_name || customer.email || "Customer"}</p>
                      <p className="text-[11px] text-muted-foreground">{customer.email || customer.phone}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    customer.customer_status === "active" ? "bg-success/10 text-success" :
                    customer.customer_status === "blocked" ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {customer.customer_status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {isArabic ? "الرصيد" : "Balance"}: <span className="font-bold">{(customer.current_balance ?? 0).toLocaleString()} ل.س</span>
                  </span>
                  <span className="text-muted-foreground">
                    {isArabic ? "الدين" : "Debt"}: <span className={`font-bold ${(customer.current_debt ?? 0) > 0 ? "text-destructive" : ""}`}>{(customer.current_debt ?? 0).toLocaleString()} ل.س</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}