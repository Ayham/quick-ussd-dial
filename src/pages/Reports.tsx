import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Filter,
  Network,
  Phone,
  RefreshCw,
  RotateCcw,
  Rotate3D,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  TrendingUp,
  User,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTransferReport,
  type ReportDimension,
  type ReportFilters,
  type ReportPeriod,
  type ReportRow,
  type TransferReport,
} from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";

type Range = "today" | "yesterday" | "7" | "30" | "90" | "all" | "custom";
type Dimension = "operator" | "user" | "device";
type SortField = "date" | "phone" | "amount" | "operator";
type SortDir = "asc" | "desc";
type TabView = "daily" | "weekly" | "monthly";

const PAGE_SIZE = 50;
const NAME_CACHE_KEY = "report_contact_names_v1";

const defaultState = {
  period: "day" as ReportPeriod,
  range: "30" as Range,
  operator: "",
  phoneSearch: "",
  customFrom: "",
  customTo: "",
  dimension: "operator" as Dimension,
};

interface TopCustomer {
  phone: string;
  name: string;
  count: number;
  totalAmount: number;
  lastDate: string;
  operator: string;
}

let nameCache: Record<string, string> = {};
try {
  const stored = localStorage.getItem(NAME_CACHE_KEY);
  if (stored) nameCache = JSON.parse(stored);
} catch {}

function saveNameCache() {
  try {
    localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(nameCache));
  } catch {}
}

async function resolveContactName(phone: string): Promise<string | null> {
  if (nameCache[phone]) return nameCache[phone];
  try {
    const { data } = await supabase
      .from("contacts")
      .select("name")
      .eq("phone_normalized", phone.replace(/[^\d+]/g, "").replace(/^\+963/, "0"))
      .maybeSingle();
    if (data?.name) {
      nameCache[phone] = data.name;
      saveNameCache();
      return data.name;
    }
  } catch {}
  return null;
}

async function resolveBatchNames(phones: string[]): Promise<Record<string, string>> {
  const uncached = phones.filter((p) => !nameCache[p]);
  if (uncached.length === 0) return nameCache;
  try {
    const normalized = uncached.map((p) => p.replace(/[^\d+]/g, "").replace(/^\+963/, "0"));
    const { data } = await supabase
      .from("contacts")
      .select("phone_normalized, name")
      .in("phone_normalized", normalized);
    if (data) {
      const phoneToNorm: Record<string, string> = {};
      uncached.forEach((p, i) => { phoneToNorm[p] = normalized[i]; });
      for (const row of data) {
        for (const [orig, norm] of Object.entries(phoneToNorm)) {
          if (row.phone_normalized === norm) {
            nameCache[orig] = row.name;
          }
        }
      }
      saveNameCache();
    }
  } catch {}
  return nameCache;
}

const Reports = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<ReportPeriod>(defaultState.period);
  const [range, setRange] = useState<Range>(defaultState.range);
  const [operator, setOperator] = useState(defaultState.operator);
  const [phoneSearch, setPhoneSearch] = useState(defaultState.phoneSearch);
  const [customFrom, setCustomFrom] = useState(defaultState.customFrom);
  const [customTo, setCustomTo] = useState(defaultState.customTo);
  const [dimension, setDimension] = useState<Dimension>(defaultState.dimension);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<TransferReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tabView, setTabView] = useState<TabView>("daily");
  const [showFilters, setShowFilters] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>(nameCache);
  const [resolvingNames, setResolvingNames] = useState(false);

  const mainFilters = useMemo<ReportFilters>(() => {
    let from: string | null = null;
    let to: string | null = null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    if (range === "today") {
      from = todayStart.toISOString();
      to = todayEnd.toISOString();
    } else if (range === "yesterday") {
      const yStart = new Date(todayStart.getTime() - 86400000);
      from = yStart.toISOString();
      to = todayStart.toISOString();
    } else if (range === "custom") {
      from = customFrom ? new Date(customFrom).toISOString() : null;
      if (customTo) {
        const d = new Date(customTo);
        d.setHours(23, 59, 59, 999);
        to = d.toISOString();
      }
    } else if (range !== "all") {
      from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
    }
    return {
      date_from: from,
      date_to: to,
      operator: operator || null,
      status: null,
      user_id: null,
      period,
      page,
      page_size: PAGE_SIZE,
    };
  }, [customFrom, customTo, operator, page, period, range]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTransferReport(mainFilters)
      .then((next) => { if (active) setReport(next); })
      .catch((err) => {
        if (active) toast({ title: "تعذّر تحميل التقرير", description: String(err?.message ?? err), variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mainFilters, reloadKey, toast]);

  const allRows = useMemo(() => report?.rows ?? [], [report]);

  const phoneFilteredRows = useMemo(() => {
    if (!phoneSearch.trim()) return allRows;
    const q = phoneSearch.trim().toLowerCase();
    return allRows.filter((r) => r.phone.toLowerCase().includes(q));
  }, [allRows, phoneSearch]);

  useEffect(() => {
    const phones = [...new Set(allRows.map((r) => r.phone))];
    const uncached = phones.filter((p) => !contactNames[p]);
    if (uncached.length === 0) return;
    setResolvingNames(true);
    resolveBatchNames(phones).then((updated) => {
      setContactNames({ ...updated });
      setResolvingNames(false);
    });
  }, [allRows]);

  const today = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + 86400000;
    const todaysRows = allRows.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= start && t < end;
    });
    return {
      count: todaysRows.length,
      amount: todaysRows.reduce((s, r) => s + r.amount, 0),
    };
  }, [allRows]);

  const dimensions = useMemo(() => {
    if (!report) return [] as ReportDimension[];
    switch (dimension) {
      case "operator": return report.by_operator;
      case "user": return report.by_user;
      case "device": return report.by_device;
      default: return [];
    }
  }, [report, dimension]);

  const avgAmount = useMemo(() => {
    const total = report?.total ?? 0;
    return total > 0 ? Math.round((report?.amount_total ?? 0) / total) : 0;
  }, [report]);

  const operatorData = useMemo(() => {
    const ops = report?.by_operator ?? [];
    const total = ops.reduce((s, o) => s + o.amount, 0);
    return ops.map((o) => ({
      name: o.key === "mtn" ? "MTN" : o.key === "syriatel" ? "Syriatel" : o.key.toUpperCase(),
      key: o.key,
      count: o.count,
      amount: o.amount,
      pct: total > 0 ? Math.round((o.amount / total) * 100) : 0,
    }));
  }, [report]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, TopCustomer>();
    for (const row of phoneFilteredRows) {
      const existing = map.get(row.phone);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += row.amount;
        if (row.created_at > existing.lastDate) {
          existing.lastDate = row.created_at;
          existing.operator = row.operator;
        }
      } else {
        map.set(row.phone, {
          phone: row.phone,
          name: contactNames[row.phone] || "",
          count: 1,
          totalAmount: row.amount,
          lastDate: row.created_at,
          operator: row.operator,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  }, [phoneFilteredRows, contactNames]);

  const periodChartData = useMemo(() => {
    if (!report?.periods) return [];
    return report.periods.map((p) => ({
      date: formatPeriodLabel(p.period_start, period),
      count: p.transfer_count,
      amount: p.amount_total,
    }));
  }, [report, period]);

  const sortedRows = useMemo(() => {
    const rows = [...phoneFilteredRows];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case "phone": cmp = a.phone.localeCompare(b.phone); break;
        case "amount": cmp = a.amount - b.amount; break;
        case "operator": cmp = a.operator.localeCompare(b.operator); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [phoneFilteredRows, sortField, sortDir]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totalFiltered = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const resetPage = (action: () => void) => { setPage(1); action(); };

  const activeFilterCount = [operator, phoneSearch]
    .filter(Boolean).length + (range !== "30" ? 1 : 0) + (range === "custom" && (customFrom || customTo) ? 1 : 0);

  const clearFilters = () => {
    setPage(1);
    setRange(defaultState.range);
    setPeriod(defaultState.period);
    setOperator("");
    setPhoneSearch("");
    setCustomFrom(""); setCustomTo("");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const exportCsv = useCallback(() => {
    const rows = sortedRows;
    if (!rows.length) {
      toast({ title: "لا توجد بيانات للتصدير" });
      return;
    }
    const headers = ["التاريخ", "رقم الهاتف", "الاسم", "المشغل", "المبلغ"];
    const csv = [headers.join(",")]
      .concat(rows.map((r) => [
        formatDateTime(r.created_at),
        r.phone,
        contactNames[r.phone] || "",
        r.operator,
        r.amount,
      ].map(csvCell).join(",")))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfers-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم تصدير الملف" });
  }, [sortedRows, contactNames, toast]);

  const exportMonthly = useCallback(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    fetchTransferReport({
      date_from: firstDay,
      date_to: lastDay,
      period: "month",
      page: 1,
      page_size: 10000,
    }).then((monthlyReport) => {
      const rows = monthlyReport?.rows ?? [];
      if (!rows.length) {
        toast({ title: "لا توجد بيانات للشهر الحالي" });
        return;
      }
      const headers = ["التاريخ", "رقم الهاتف", "المشغل", "المبلغ"];
      const csv = [headers.join(",")]
        .concat(rows.map((r) => [
          formatDateTime(r.created_at),
          r.phone,
          r.operator,
          r.amount,
        ].map(csvCell).join(",")))
        .join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monthly-report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير التقرير الشهري" });
    }).catch(() => {
      toast({ title: "فشل تصدير التقرير الشهري", variant: "destructive" });
    });
  }, [toast]);

  return (
    <AppLayout title="التقارير" titleIcon={<BarChart3 className="w-5 h-5 text-white" />}>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 pb-3" dir="rtl">

        {/* 1. DASHBOARD HEADER */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label="تحويلات اليوم"
            value={fmt(today.count)}
            subtext={`من ${fmt(report?.total ?? 0)} إجمالي`}
            color="primary"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="قيمة اليوم"
            value={fmtCurrency(today.amount)}
            subtext={today.count > 0 ? `معدل ${fmt(Math.round(today.amount / today.count))}` : "—"}
            color="success"
          />
          <SummaryCard
            icon={<Rotate3D className="h-5 w-5" />}
            label="إجمالي التحويلات"
            value={fmt(report?.total ?? 0)}
            subtext={fmtCurrency(report?.amount_total ?? 0)}
            color="info"
          />
          <SummaryCard
            icon={<Network className="h-5 w-5" />}
            label="مشغلين"
            value={fmt(operatorData.length)}
            subtext={operatorData.map((o) => o.name).join(" و ")}
            color="accent"
          />
        </div>

        {/* 2. TIME PERIOD CHARTS */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="h-4 w-4 text-primary" /> تحليل الفترات الزمنية
            </h3>
            <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-0.5">
              {(["daily", "weekly", "monthly"] as TabView[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTabView(t);
                    setPeriod(t === "daily" ? "day" : t === "weekly" ? "week" : "month");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all",
                    tabView === t ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "daily" ? "يومي" : t === "weekly" ? "أسبوعي" : "شهري"}
                </button>
              ))}
            </div>
          </div>
          {periodChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={periodChartData}>
                <defs>
                  <linearGradient id="amountGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="countGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="amount" name="القيمة" stroke="hsl(var(--primary))" fill="url(#amountGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="count" name="العدد" stroke="hsl(var(--info))" fill="url(#countGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground">
              {loading ? "جاري التحميل..." : "لا توجد بيانات للفترة المحددة"}
            </div>
          )}
          {periodChartData.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/60">
              <MiniStat label="إجمالي التحويلات" value={fmt(periodChartData.reduce((s, p) => s + p.count, 0))} />
              <MiniStat label="إجمالي المبلغ" value={fmtCurrency(periodChartData.reduce((s, p) => s + p.amount, 0))} />
              <MiniStat label="متوسط العملية" value={fmtCurrency(avgAmount)} />
            </div>
          )}
        </div>

        {/* 3. ADVANCED FILTERS */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-between w-full text-right"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">التصفية</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-bold">{activeFilterCount}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="h-8 text-xs rounded-xl">
                <RotateCcw className="ml-1 h-3 w-3" /> مسح
              </Button>
              {showFilters ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {showFilters && (
            <div className="mt-4 space-y-3 animate-slide-down">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterInput
                  label="رقم الهاتف"
                  value={phoneSearch}
                  onChange={(v) => resetPage(() => setPhoneSearch(v))}
                  placeholder="ابحث برقم الهاتف..."
                  icon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
                />
                <FilterSelect label="الفترة" value={range} onChange={(v) => resetPage(() => setRange(v as Range))}>
                  <option value="today">اليوم</option>
                  <option value="yesterday">أمس</option>
                  <option value="7">آخر 7 أيام</option>
                  <option value="30">آخر 30 يوماً</option>
                  <option value="90">آخر 90 يوماً</option>
                  <option value="all">كل البيانات</option>
                  <option value="custom">نطاق مخصص</option>
                </FilterSelect>
                <FilterSelect label="المشغل" value={operator} onChange={(v) => resetPage(() => setOperator(v))}>
                  <option value="">الكل</option>
                  <option value="mtn">MTN</option>
                  <option value="syriatel">Syriatel</option>
                </FilterSelect>
              </div>

              {range === "custom" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">من تاريخ</span>
                    <Input type="date" value={customFrom} onChange={(e) => resetPage(() => setCustomFrom(e.target.value))} className="rounded-xl h-10" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">إلى تاريخ</span>
                    <Input type="date" value={customTo} onChange={(e) => resetPage(() => setCustomTo(e.target.value))} className="rounded-xl h-10" />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4 + 5. CUSTOMER ANALYTICS + OPERATOR ANALYSIS */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* Top Customers */}
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <User className="h-4 w-4 text-primary" /> أفضل العملاء
              </h3>
              <span className="text-[10px] text-muted-foreground">{topCustomers.length} عميل</span>
            </div>
            {topCustomers.length > 0 ? (
              <div className="space-y-2">
                {topCustomers.slice(0, 10).map((c, i) => (
                  <div
                    key={c.phone}
                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                        i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{c.name || c.phone}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.count} تحويلة • {fmtCurrency(c.totalAmount)}
                        </p>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 text-left" dir="ltr">
                      <p>{formatDate(c.lastDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                لا توجد بيانات عملاء
              </div>
            )}
          </div>

          {/* Operator Analysis */}
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Network className="h-4 w-4 text-primary" /> تحليل المشغلين
              </h3>
            </div>
            {operatorData.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={operatorData.map((o) => ({ name: o.name, value: o.amount }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {operatorData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.key === "mtn" ? "hsl(var(--operator-mtn))" : "hsl(var(--operator-syriatel))"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {operatorData.map((o) => (
                    <div key={o.key} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          o.key === "mtn" ? "bg-operator-mtn" : "bg-operator-syriatel"
                        )} />
                        <span className="text-xs font-bold">{o.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{o.count} تحويلة</span>
                        <span className="text-xs font-bold">{fmtCurrency(o.amount)}</span>
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          o.key === "mtn" ? "bg-operator-mtn/15 text-operator-mtn-foreground" : "bg-operator-syriatel/15 text-operator-syriatel-foreground"
                        )}>
                          {o.pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                لا توجد بيانات مشغلين
              </div>
            )}
          </div>
        </div>

        {/* Dimension Chart */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 min-h-[300px]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <BarChart3 className="h-4 w-4 text-primary" /> توزيع حسب
              </h3>
              <div className="flex items-center gap-1">
                {(["operator", "user", "device"] as Dimension[]).map((d) => (
                  <button key={d} onClick={() => { setDimension(d); }}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all",
                      dimension === d ? "bg-primary text-white shadow-sm" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}>{dimLabel(d)}</button>
                ))}
              </div>
            </div>
            {dimensions.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dimensions.map((d) => ({ name: dimItemLabel(dimension, d), value: d.amount, count: d.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12 }} />
                  <Legend formatter={(v: string) => <span style={{ fontSize: 12 }}>{v === "value" ? "المبلغ" : v === "count" ? "العدد" : v}</span>} />
                  <Bar dataKey="value" name="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground">
                اختر بُعداً لعرض الرسم البياني
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 min-h-[300px]">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-3"><Activity className="h-4 w-4 text-primary" /> ملخص</h3>
            <div className="space-y-1">
              {(dimensions.length > 0 ? dimensions : []).map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                  <span className="text-xs font-medium flex items-center gap-2">
                    {dimension === "operator" && (
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        d.key === "mtn" ? "bg-operator-mtn" : d.key === "syriatel" ? "bg-operator-syriatel" : "bg-muted-foreground"
                      )} />
                    )}
                    {dimItemLabel(dimension, d)}
                  </span>
                  <span className="text-xs font-bold">{fmt(d.count)} <span className="font-normal text-muted-foreground">تحويلة</span></span>
                </div>
              ))}
              {!dimensions.length && <p className="text-xs text-muted-foreground text-center pt-12">لا توجد أبعاد للتقرير</p>}
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label="إجمالي العمليات" value={fmt(report?.total ?? 0)} />
          <Metric label="إجمالي المبالغ" value={fmtCurrency(report?.amount_total ?? 0)} />
          <Metric label="متوسط العملية" value={fmtCurrency(avgAmount)} />
          <Metric label="عدد المشغلين" value={fmt(operatorData.length)} />
        </div>

        {/* 6. DETAILED TRANSFERS TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Database className="h-4 w-4 text-primary" /> سجل التحويلات
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {totalFiltered > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalFiltered)} من ${fmt(totalFiltered)}` : "لا توجد بيانات"}
              </span>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!sortedRows.length} className="rounded-xl h-8 text-xs">
                <Download className="ml-1 h-3 w-3" /> CSV
              </Button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto border border-border/60 rounded-xl">
            <table className="w-full min-w-[700px] text-right text-xs">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground">
                  <SortHeader field="date" label="التاريخ" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-3 font-semibold">الاسم</th>
                  <SortHeader field="phone" label="رقم الهاتف" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader field="operator" label="المشغل" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader field="amount" label="المبلغ" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => (
                  <tr key={row.id} className={cn("border-t border-border/60 align-top transition-colors hover:bg-muted/30", idx % 2 === 0 ? "bg-white" : "bg-muted/20")}>
                    <td className="whitespace-nowrap p-3">{formatDateTime(row.created_at)}</td>
                    <td className="p-3 font-semibold">{contactNames[row.phone] || "—"}</td>
                    <td className="p-3 font-mono font-semibold" dir="ltr">{row.phone}</td>
                    <td className="p-3">
                      <OperatorBadge operator={row.operator} />
                    </td>
                    <td className="p-3 font-semibold">{fmtCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !pagedRows.length && <TableEmpty />}
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {pagedRows.map((row) => (
              <MobileTransferCard key={row.id} row={row} name={contactNames[row.phone] || ""} />
            ))}
            {!loading && !pagedRows.length && <TableEmpty />}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button size="icon" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((v) => Math.max(1, v - 1))} title="السابق" className="rounded-xl h-9 w-9">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
              <Button size="icon" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} title="التالي" className="rounded-xl h-9 w-9">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <h3 className="flex items-center gap-2 text-sm font-bold mb-3">
            <Download className="h-4 w-4 text-primary" /> تصدير التقارير
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!sortedRows.length} className="rounded-xl h-9">
              <Download className="ml-1.5 h-4 w-4" /> تصدير النتائج الحالية (CSV)
            </Button>
            <Button size="sm" variant="outline" onClick={exportMonthly} className="rounded-xl h-9">
              <FileText className="ml-1.5 h-4 w-4" /> التقرير الشهري
            </Button>
          </div>
        </div>

      </div>
    </AppLayout>
  );
};

/* ============================================ */
/* COMPONENTS                                   */
/* ============================================ */

function SortHeader({ field, label, sortField, sortDir, onSort }: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th className="p-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </th>
  );
}

function SummaryCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode; label: string; value: string; subtext: string; color: "primary" | "success" | "info" | "accent";
}) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    accent: "bg-amber-100 text-amber-700",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className="bg-white rounded-2xl border border-border/60 p-4 shadow-sm press-effect animate-scale-in">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", colors[color])}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtext}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-bold", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="bg-white border border-border/60 rounded-xl px-4 py-3.5 shadow-sm animate-fade-in">
      <p className="text-xs text-muted-foreground mb-1 font-medium">{label}</p>
      <p className={cn("text-xl font-bold", tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground")}>{value}</p>
    </div>
  );
}

function MobileTransferCard({ row, name }: { row: ReportRow; name: string }) {
  return (
    <div className="bg-white border border-border/60 rounded-xl p-3.5 space-y-2 press-effect">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold">{name || "—"}</span>
          <OperatorBadge operator={row.operator} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-bold">{fmtCurrency(row.amount)}</span>
          <span className="text-[10px] text-muted-foreground mr-1.5">قيمة التحويل</span>
        </div>
        <span className="text-xs font-mono" dir="ltr">{row.phone}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {formatDateTime(row.created_at)}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <select
        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function FilterInput({ label, value, onChange, placeholder, icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; icon?: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{icon}</span>
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className={cn("font-mono text-xs rounded-xl h-10", icon && "pr-9")}
          placeholder={placeholder || "—"}
        />
      </div>
    </label>
  );
}

function OperatorBadge({ operator }: { operator: string }) {
  const op = (operator || "").toLowerCase();
  if (op === "mtn") {
    return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-operator-mtn/15 text-operator-mtn-foreground">MTN</span>;
  }
  if (op === "syriatel") {
    return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-operator-syriatel/15 text-operator-syriatel-foreground">Syriatel</span>;
  }
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">{operator}</span>;
}

function TableEmpty() {
  return (
    <div className="py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
        <BarChart3 className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">لا توجد بيانات مطابقة</p>
    </div>
  );
}

/* ============================================ */
/* HELPERS                                      */
/* ============================================ */

function dimLabel(d: Dimension): string {
  if (d === "operator") return "المشغل";
  if (d === "user") return "المستخدم";
  if (d === "device") return "الجهاز";
  return d;
}

function dimItemLabel(dim: Dimension, item: ReportDimension): string {
  if (dim === "operator") {
    const k = (item.label || item.key || "").toLowerCase();
    return k === "mtn" ? "MTN" : k === "syriatel" ? "Syriatel" : (item.label || item.key || "").toUpperCase();
  }
  return item.label || item.key || "—";
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("ar-SY");
}

function fmtCurrency(n: number): string {
  const v = (n ?? 0).toLocaleString("ar-SY");
  return `${v} SYP`;
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatPeriodLabel(iso: string, period: ReportPeriod): string {
  const d = new Date(iso);
  if (period === "day") return formatDate(d);
  if (period === "week") return `أسبوع ${formatDate(d)}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default Reports;
