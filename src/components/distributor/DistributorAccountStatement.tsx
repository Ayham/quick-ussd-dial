import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, Download, Filter, Calendar, FileText,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCustomerTransactions, type CustomerTransaction } from "@/lib/distributor-management";

interface Props {
  customerId: string;
  onBack: () => void;
}

export function DistributorAccountStatement({ customerId, onBack }: Props) {
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const pageSize = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { transactions: txs, total: t } = await getCustomerTransactions(customerId, page, pageSize);
      setTransactions(txs);
      setTotal(t);
    } catch (e) {
      console.error("Load statement error:", e);
    }
    setLoading(false);
  }, [customerId, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (dateFrom && new Date(tx.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(tx.created_at) > new Date(dateTo + "T23:59:59")) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !tx.type.includes(s) &&
        !(tx.notes || "").toLowerCase().includes(s) &&
        !String(tx.amount).includes(s)
      ) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / pageSize);

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      topup: "شحن", payment: "دفعة", adjustment: "تعديل", debt: "دين", credit: "دائن"
    };
    return map[type] || type;
  };

  const typeColor = (type: string) => {
    const map: Record<string, string> = {
      topup: "text-primary", payment: "text-accent", adjustment: "text-muted-foreground",
      debt: "text-destructive", credit: "text-green-500"
    };
    return map[type] || "text-foreground";
  };

  const typeIcon = (type: string) => {
    if (type === "payment") return <ArrowUpCircle className="w-4 h-4 text-accent" />;
    if (type === "debt") return <AlertTriangle className="w-4 h-4 text-destructive" />;
    if (type === "credit") return <TrendingUp className="w-4 h-4 text-green-500" />;
    return <ArrowDownCircle className="w-4 h-4 text-primary" />;
  };

  const exportCSV = () => {
    const headers = ["التاريخ", "النوع", "المبلغ", "الرصيد قبل", "الرصيد بعد", "الدين قبل", "الدين بعد", "ملاحظات", "أنشأه"];
    const rows = filtered.map((tx) => [
      new Date(tx.created_at).toLocaleString("ar-SY"),
      typeLabel(tx.type),
      String(tx.amount),
      String(tx.balance_before),
      String(tx.balance_after),
      String(tx.debt_before),
      String(tx.debt_after),
      tx.notes || "",
      tx.created_by || "",
    ]);
    const csv = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement_${customerId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold">كشف الحساب</h2>
        <Button onClick={exportCSV} variant="outline" size="sm" className="h-8 text-[11px] rounded-lg">
          <Download className="w-3.5 h-3.5 ml-1" /> تصدير
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 shadow-card space-y-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث..."
          className="h-9 rounded-xl text-sm"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "topup", "payment", "debt", "credit", "adjustment"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {t === "all" ? "الكل" : typeLabel(t)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-xl text-[11px] flex-1"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-xl text-[11px] flex-1"
          />
        </div>
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>لا توجد عمليات</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((tx) => (
            <div key={tx.id} className="bg-card border border-border rounded-xl p-3 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {typeIcon(tx.type)}
                  <div>
                    <p className="text-xs font-bold text-foreground">{typeLabel(tx.type)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("ar-SY", {
                        year: "numeric", month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <span className={`text-sm font-bold ${typeColor(tx.type)}`}>
                    {tx.type === "payment" ? "-" : "+"}{tx.amount.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>رصيد: {tx.balance_after.toLocaleString()}</span>
                <span>دين: {tx.debt_after.toLocaleString()}</span>
                {tx.notes && <span className="max-w-[120px] truncate">{tx.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            variant="outline"
            size="sm"
            className="h-8 rounded-lg"
          >
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            variant="outline"
            size="sm"
            className="h-8 rounded-lg"
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
