import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Filter,
  Loader2,
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
  Wallet,
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
  buildDailyBreakdown,
  buildFinancialSummary,
  fetchTransferReport,
  type DailyBreakdownRow,
  type FinancialBucket,
  type FinancialBucketKey,
  type ReportDimension,
  type ReportFilters,
  type ReportPeriod,
  type ReportRow,
  type TransferReport,
} from "@/lib/reports";
import { getContactByPhone } from "@/lib/android-contacts";

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

const Reports = () => {
const { t, i18n } = useTranslation();
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
  const [financial, setFinancial] = useState<FinancialBucket[]>(() => buildFinancialSummary());
  const [dailyRows, setDailyRows] = useState<DailyBreakdownRow[]>(() => buildDailyBreakdown());
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tabView, setTabView] = useState<TabView>("daily");
  const [showFilters, setShowFilters] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>(nameCache);

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
    setFinancial(buildFinancialSummary());
    setDailyRows(buildDailyBreakdown());
    fetchTransferReport(mainFilters)
      .then((next) => { if (active) setReport(next); })
      .catch((err) => {
        if (active) toast({ title: t("reports.loadFailed"), description: String(err?.message ?? err), variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mainFilters, reloadKey, toast, t]);

  const allRows = useMemo(() => report?.rows ?? [], [report]);

  const phoneFilteredRows = useMemo(() => {
    if (!phoneSearch.trim()) return allRows;
    const q = phoneSearch.trim().toLowerCase();
    return allRows.filter((r) => r.phone.toLowerCase().includes(q));
  }, [allRows, phoneSearch]);

  const financialOperators = useMemo(() => {
    const set = new Set<string>();
    for (const bucket of financial) {
      for (const dim of bucket.by_operator) set.add(dim.key);
    }
    return [...set];
  }, [financial]);

  const dailyOperators = useMemo(() => {
    const set = new Set<string>();
    for (const row of dailyRows) {
      for (const dim of row.by_operator) set.add(dim.key);
    }
    return [...set];
  }, [dailyRows]);

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
      name: o.key === "mtn" ? t("operator.mtn") : o.key === "syriatel" ? t("operator.syriatel") : o.key.toUpperCase(),
      key: o.key,
      count: o.count,
      amount: o.amount,
      pct: total > 0 ? Math.round((o.amount / total) * 100) : 0,
    }));
  }, [report, t]);

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

  useEffect(() => {
    const phones = [...new Set([
      ...pagedRows.map((r) => r.phone),
      ...topCustomers.slice(0, 10).map((c) => c.phone),
    ])].filter((p) => p && !nameCache[p]).slice(0, 20);
    if (phones.length === 0) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const next: Record<string, string> = {};
      for (const phone of phones) {
        if (cancelled) return;
        const contact = await getContactByPhone(phone);
        if (contact?.contactId && contact.displayName) {
          next[phone] = contact.displayName;
        }
      }
      if (cancelled || Object.keys(next).length === 0) return;
      Object.assign(nameCache, next);
      saveNameCache();
      setContactNames({ ...nameCache });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [pagedRows, topCustomers]);

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
      toast({ title: t("reports.noDataExport") });
      return;
    }
    const headers = t("reports.csvHeaders");
    const csv = [headers]
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
    toast({ title: t("reports.exportSuccess") });
  }, [sortedRows, contactNames, toast, t]);

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
        toast({ title: t("reports.noMonthlyData") });
        return;
      }
      const headers = t("reports.monthlyCsvHeaders");
      const csv = [headers]
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
      toast({ title: t("reports.monthlyExportSuccess") });
    }).catch(() => {
      toast({ title: t("reports.monthlyExportFailed"), variant: "destructive" });
    });
  }, [toast, t]);

  return (
    <AppLayout title={t("reports.pageTitle")} titleIcon={<BarChart3 className="w-5 h-5 text-white" />}>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 pb-3" dir={i18n.dir()}>

        {/* 1. DASHBOARD HEADER */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label={t("reports.todayTransfers")}
            value={fmt(today.count)}
            subtext={`${t("reports.of")} ${fmt(report?.total ?? 0)} ${t("reports.totalWord")}`}
            color="primary"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5" />}
            label={t("reports.todayValue")}
            value={fmtCurrency(today.amount)}
            subtext={today.count > 0 ? `${t("reports.avgWord")} ${fmt(Math.round(today.amount / today.count))}` : "—"}
            color="success"
          />
          <SummaryCard
            icon={<Rotate3D className="h-5 w-5" />}
            label={t("reports.totalTransfersLabel")}
            value={fmt(report?.total ?? 0)}
            subtext={fmtCurrency(report?.amount_total ?? 0)}
            color="info"
          />
          <SummaryCard
            icon={<Network className="h-5 w-5" />}
            label={t("reports.operators")}
            value={fmt(operatorData.length)}
            subtext={operatorData.map((o) => o.name).join(t("reports.andJoin"))}
            color="accent"
          />
        </div>

        {/* 1.5 FINANCIAL SUMMARY (daily / weekly / monthly / all, per operator) */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Wallet className="h-4 w-4 text-primary" /> {t("reports.financialSummary")}
            </h3>
            <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {t("reports.localData")}
            </span>
          </div>
          {loading && !report ? (
            <FinancialSkeleton />
          ) : (
            <div className="overflow-x-auto border border-border/60 rounded-xl">
              <table className="w-full min-w-[720px] text-right text-xs">
                <thead>
                  <tr className="bg-muted/60 text-muted-foreground">
                    <th className="p-3 font-semibold">{t("reports.periodCol")}</th>
                    <th className="p-3 font-semibold">{t("reports.totalTransfersLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.salesHint")}>{t("reports.totalAmountLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.quantityHint")}>{t("reports.quantityLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.feeHint")}>{t("reports.distributorFeeCol")}</th>
                    <th className="p-3 font-semibold" title={t("reports.profitHint")}>{t("reports.profitLabel")}</th>
                    {financialOperators.map((op) => (
                      <th key={op} className="p-3 font-semibold">{operatorDisplayName(op, t)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {financial.map((bucket, idx) => {
                    const profit = bucket.amount - bucket.quantity - bucket.distributor_fee;
                    return (
                      <tr key={bucket.key} className={cn("border-t border-border/60", idx % 2 === 0 ? "bg-white" : "bg-muted/20")}>
                        <td className="p-3 font-bold whitespace-nowrap">
                          {bucketLabel(bucket.key, t)}
                        </td>
                        <td className="p-3 text-muted-foreground">{fmt(bucket.count)}</td>
                        <td className="p-3 font-bold whitespace-nowrap">{fmtCurrency(bucket.amount)}</td>
                        <td className="p-3 font-semibold whitespace-nowrap">{fmtCurrency(bucket.quantity)}</td>
                        <td className="p-3 whitespace-nowrap text-warning">{fmtCurrency(bucket.distributor_fee)}</td>
                        <td className={cn(
                          "p-3 font-bold whitespace-nowrap",
                          profit > 0 ? "text-success" : profit < 0 ? "text-destructive" : ""
                        )}>
                          {fmtCurrency(profit)}
                        </td>
                        {financialOperators.map((op) => {
                          const dim = bucket.by_operator.find((d) => d.key === op);
                          if (!dim) return <td key={op} className="p-3 whitespace-nowrap">—</td>;
                          return (
                            <td key={op} className="p-3 whitespace-nowrap">
                              <div>{fmtCurrency(dim.amount)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {t("reports.quantityLabel")}: {fmtCurrency(dim.quantity ?? 0)} • {t("reports.distributorFeeCol")}: {fmtCurrency(dim.distributor_fee ?? 0)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 1.6 LAST 10 DAYS: one row per calendar date, per operator */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <CalendarDays className="h-4 w-4 text-primary" /> {t("reports.last10Detail")}
            </h3>
            <span className="text-[10px] text-muted-foreground">{t("reports.last10Hint")}</span>
          </div>
          {loading && !report ? (
            <FinancialSkeleton />
          ) : (
            <div className="overflow-x-auto border border-border/60 rounded-xl">
              <table className="w-full min-w-[760px] text-right text-xs">
                <thead>
                  <tr className="bg-muted/60 text-muted-foreground">
                    <th className="p-3 font-semibold">{t("reports.dateCol")}</th>
                    <th className="p-3 font-semibold">{t("reports.totalTransfersLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.salesHint")}>{t("reports.totalAmountLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.quantityHint")}>{t("reports.quantityLabel")}</th>
                    <th className="p-3 font-semibold" title={t("reports.feeHint")}>{t("reports.distributorFeeCol")}</th>
                    <th className="p-3 font-semibold" title={t("reports.profitHint")}>{t("reports.profitLabel")}</th>
                    {dailyOperators.map((op) => (
                      <th key={op} className="p-3 font-semibold">{operatorDisplayName(op, t)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row, idx) => {
                    const profit = row.amount - row.quantity - row.distributor_fee;
                    const empty = row.count === 0;
                    return (
                      <tr key={row.date} className={cn("border-t border-border/60", idx % 2 === 0 ? "bg-white" : "bg-muted/20", idx === 0 && "bg-primary/5 font-semibold")}>
                        <td className="p-3 font-bold whitespace-nowrap">
                          {formatDate(row.date)}
                          {idx === 0 && <span className="text-[10px] text-muted-foreground"> ({t("reports.bucketToday")})</span>}
                        </td>
                        <td className="p-3 text-muted-foreground">{empty ? "—" : fmt(row.count)}</td>
                        <td className="p-3 font-bold whitespace-nowrap">{empty ? "—" : fmtCurrency(row.amount)}</td>
                        <td className="p-3 font-semibold whitespace-nowrap">{empty ? "—" : fmtCurrency(row.quantity)}</td>
                        <td className="p-3 whitespace-nowrap text-warning">{empty ? "—" : fmtCurrency(row.distributor_fee)}</td>
                        <td className={cn(
                          "p-3 font-bold whitespace-nowrap",
                          !empty && profit > 0 ? "text-success" : !empty && profit < 0 ? "text-destructive" : ""
                        )}>
                          {empty ? "—" : fmtCurrency(profit)}
                        </td>
                        {dailyOperators.map((op) => {
                          const dim = row.by_operator.find((d) => d.key === op);
                          if (!dim || dim.count === 0) {
                            return <td key={op} className="p-3 text-muted-foreground">—</td>;
                          }
                          return (
                            <td key={op} className="p-3 whitespace-nowrap">
                              <div className="font-semibold">{fmt(dim.count)} {t("reports.transferUnit")} • {fmtCurrency(dim.amount)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {t("reports.quantityLabel")}: {fmtCurrency(dim.quantity ?? 0)} • {t("reports.distributorFeeCol")}: {fmtCurrency(dim.distributor_fee ?? 0)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 2. TIME PERIOD CHARTS */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="h-4 w-4 text-primary" /> {t("reports.periodAnalysis")}
            </h3>
            <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-0.5">
              {(["daily", "weekly", "monthly"] as TabView[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setTabView(tab);
                    setPeriod(tab === "daily" ? "day" : tab === "weekly" ? "week" : "month");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all",
                    tabView === tab ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "daily" ? t("reports.daily") : tab === "weekly" ? t("reports.weekly") : t("reports.monthly")}
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
                <Area type="monotone" dataKey="amount" name={t("reports.amount")} stroke="hsl(var(--primary))" fill="url(#amountGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="count" name={t("reports.count")} stroke="hsl(var(--info))" fill="url(#countGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("reports.noPeriodData")
              )}
            </div>
          )}
          {periodChartData.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/60">
              <MiniStat label={t("reports.totalTransfersLabel")} value={fmt(periodChartData.reduce((s, p) => s + p.count, 0))} />
              <MiniStat label={t("reports.totalAmountLabel")} value={fmtCurrency(periodChartData.reduce((s, p) => s + p.amount, 0))} />
              <MiniStat label={t("reports.avgOperation")} value={fmtCurrency(avgAmount)} />
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
              <span className="text-sm font-bold">{t("reports.filters")}</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-bold">{activeFilterCount}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="h-8 text-xs rounded-xl">
                <RotateCcw className="ml-1 h-3 w-3" /> {t("reports.clearFilters")}
              </Button>
              {showFilters ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {showFilters && (
            <div className="mt-4 space-y-3 animate-slide-down">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterInput
                  label={t("reports.phoneFilter")}
                  value={phoneSearch}
                  onChange={(v) => resetPage(() => setPhoneSearch(v))}
                  placeholder={t("reports.phoneSearchPlaceholder")}
                  icon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
                />
                <FilterSelect label={t("reports.periodFilter")} value={range} onChange={(v) => resetPage(() => setRange(v as Range))}>
                  <option value="today">{t("reports.rangeToday")}</option>
                  <option value="yesterday">{t("reports.rangeYesterday")}</option>
                  <option value="7">{t("reports.range7")}</option>
                  <option value="30">{t("reports.range30")}</option>
                  <option value="90">{t("reports.range90")}</option>
                  <option value="all">{t("reports.rangeAll")}</option>
                  <option value="custom">{t("reports.rangeCustom")}</option>
                </FilterSelect>
                <FilterSelect label={t("reports.operatorFilter")} value={operator} onChange={(v) => resetPage(() => setOperator(v))}>
                  <option value="">{t("common.all")}</option>
                  <option value="mtn">{t("operator.mtn")}</option>
                  <option value="syriatel">{t("operator.syriatel")}</option>
                </FilterSelect>
              </div>

              {range === "custom" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">{t("reports.fromDate")}</span>
                    <Input type="date" value={customFrom} onChange={(e) => resetPage(() => setCustomFrom(e.target.value))} className="rounded-xl h-10" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">{t("reports.toDate")}</span>
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
                <User className="h-4 w-4 text-primary" /> {t("reports.topCustomers")}
              </h3>
              <span className="text-[10px] text-muted-foreground">{t("reports.clientsCount", { count: topCustomers.length })}</span>
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
                          {c.count} {t("reports.transferUnit")} • {fmtCurrency(c.totalAmount)}
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
                {t("reports.noCustomerData")}
              </div>
            )}
          </div>

          {/* Operator Analysis */}
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Network className="h-4 w-4 text-primary" /> {t("reports.operatorAnalysis")}
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
                          o.key === "mtn" ? "bg-operator-mtn" : o.key === "syriatel" ? "bg-operator-syriatel" : "bg-muted-foreground"
                        )} />
                        <span className="text-xs font-bold">{o.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{o.count} {t("reports.transferUnit")}</span>
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
                {t("reports.noOperatorData")}
              </div>
            )}
          </div>
        </div>

        {/* Dimension Chart */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 min-h-[300px]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <BarChart3 className="h-4 w-4 text-primary" /> {t("reports.distributionBy")}
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
                  <Legend formatter={(v: string) => <span style={{ fontSize: 12 }}>{v === "value" ? t("reports.amount") : v === "count" ? t("reports.count") : v}</span>} />
                  <Bar dataKey="value" name="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground">
                {t("reports.selectDimension")}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5 min-h-[300px]">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-3"><Activity className="h-4 w-4 text-primary" /> {t("reports.totalOperations")}</h3>
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
                  <span className="text-xs font-bold">{fmt(d.count)} <span className="font-normal text-muted-foreground">{t("reports.transferUnit")}</span></span>
                </div>
              ))}
              {!dimensions.length && <p className="text-xs text-muted-foreground text-center pt-12">{t("reports.noDimensionData")}</p>}
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label={t("reports.totalOperations")} value={fmt(report?.total ?? 0)} />
          <Metric label={t("reports.totalAmountLabel")} value={fmtCurrency(report?.amount_total ?? 0)} />
          <Metric label={t("reports.avgOperation")} value={fmtCurrency(avgAmount)} />
          <Metric label={t("reports.operatorCount")} value={fmt(operatorData.length)} />
        </div>

        {/* 6. DETAILED TRANSFERS TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Database className="h-4 w-4 text-primary" /> {t("reports.transferLog")}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {totalFiltered > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalFiltered)} ${t("reports.of")} ${fmt(totalFiltered)}` : t("common.noData")}
              </span>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!sortedRows.length} className="rounded-xl h-8 text-xs">
                <Download className="ml-1 h-3 w-3" /> CSV
              </Button>
              <Button size="icon" variant="outline" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} title={t("common.refresh")} className="rounded-xl h-8 w-8">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto border border-border/60 rounded-xl">
            <table className="w-full min-w-[700px] text-right text-xs">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground">
                  <SortHeader field="date" label={t("reports.dateHeader")} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-3 font-semibold">{t("reports.nameHeader")}</th>
                  <SortHeader field="phone" label={t("reports.phoneHeader")} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader field="operator" label={t("reports.operatorHeader")} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader field="amount" label={t("reports.amountHeader")} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {loading && pagedRows.length === 0 && <TableSkeletonRows cols={5} />}
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
            {loading && pagedRows.length === 0 && [0, 1, 2].map((i) => (
              <div key={`sk-m-${i}`} className="bg-white border border-border/60 rounded-xl p-3.5 space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              </div>
            ))}
            {pagedRows.map((row) => (
              <MobileTransferCard key={row.id} row={row} name={contactNames[row.phone] || ""} />
            ))}
            {!loading && !pagedRows.length && <TableEmpty />}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button size="icon" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((v) => Math.max(1, v - 1))} title={t("common.previous")} className="rounded-xl h-9 w-9">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{t("reports.pageInfo", { page, totalPages })}</span>
              <Button size="icon" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} title={t("common.next")} className="rounded-xl h-9 w-9">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl shadow-sm border border-border/60 p-4.5">
          <h3 className="flex items-center gap-2 text-sm font-bold mb-3">
            <Download className="h-4 w-4 text-primary" /> {t("reports.exportReports")}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!sortedRows.length} className="rounded-xl h-9">
              <Download className="ml-1.5 h-4 w-4" /> {t("reports.exportCurrentCsv")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportMonthly} className="rounded-xl h-9">
              <FileText className="ml-1.5 h-4 w-4" /> {t("reports.monthlyReport")}
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

function FinancialSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-24 rounded-xl bg-muted animate-pulse" />
          <div className="h-9 flex-1 rounded-xl bg-muted animate-pulse" />
          <div className="hidden sm:block h-9 w-28 rounded-xl bg-muted animate-pulse" />
          <div className="hidden sm:block h-9 w-28 rounded-xl bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function TableSkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <tr key={`sk-${i}`} className="border-t border-border/60">
          <td colSpan={cols} className="p-3">
            <div className="h-4 rounded bg-muted animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

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
  const { t } = useTranslation();
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
          <span className="text-[10px] text-muted-foreground mr-1.5">{t("reports.transferValue")}</span>
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
    return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-operator-mtn/15 text-operator-mtn-foreground">{i18n.t("operator.mtn")}</span>;
  }
  if (op === "syriatel") {
    return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-operator-syriatel/15 text-operator-syriatel-foreground">{i18n.t("operator.syriatel")}</span>;
  }
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">{operator}</span>;
}

function TableEmpty() {
  const { t } = useTranslation();
  return (
    <div className="py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
        <BarChart3 className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{t("reports.noMatchingData")}</p>
    </div>
  );
}

/* ============================================ */
/* HELPERS                                      */
/* ============================================ */

function dimLabel(d: Dimension): string {
  if (d === "operator") return i18n.t("reports.operatorDim");
  if (d === "user") return i18n.t("reports.userDim");
  if (d === "device") return i18n.t("reports.deviceDim");
  return d;
}

function dimItemLabel(dim: Dimension, item: ReportDimension): string {
  if (dim === "operator") {
    const k = (item.label || item.key || "").toLowerCase();
    return k === "mtn" ? i18n.t("operator.mtn") : k === "syriatel" ? i18n.t("operator.syriatel") : (item.label || item.key || "").toUpperCase();
  }
  return item.label || item.key || "—";
}

function operatorDisplayName(key: string, t: (k: string) => string): string {
  const k = (key || "").toLowerCase();
  if (k === "mtn") return t("operator.mtn");
  if (k === "syriatel") return t("operator.syriatel");
  return (key || "—").toUpperCase();
}

function bucketLabel(key: FinancialBucketKey, t: (k: string) => string): string {
  if (key === "today") return t("reports.bucketToday");
  if (key === "week") return t("reports.bucketWeek");
  if (key === "month") return t("reports.bucketMonth");
  return t("reports.bucketAll");
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
  if (period === "week") return `${i18n.t("reports.week")} ${formatDate(d)}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default Reports;
