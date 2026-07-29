import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Filter,
  RefreshCw,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTransferReport,
  type ReportDimension,
  type ReportFilters,
  type ReportPeriod,
  type ReportRow,
  type TransferReport,
} from "@/lib/reports";

type Range = "7" | "30" | "90" | "all" | "custom";
type Dimension = "operator" | "status" | "user" | "device" | "sync";

const PAGE_SIZE = 50;

const defaultState = {
  period: "day" as ReportPeriod,
  range: "30" as Range,
  operator: "",
  status: "",
  userId: "",
  customFrom: "",
  customTo: "",
  dimension: "operator" as Dimension,
};

const Reports = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<ReportPeriod>(defaultState.period);
  const [range, setRange] = useState<Range>(defaultState.range);
  const [operator, setOperator] = useState(defaultState.operator);
  const [status, setStatus] = useState(defaultState.status);
  const [userId, setUserId] = useState(defaultState.userId);
  const [customFrom, setCustomFrom] = useState(defaultState.customFrom);
  const [customTo, setCustomTo] = useState(defaultState.customTo);
  const [dimension, setDimension] = useState<Dimension>(defaultState.dimension);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<TransferReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo<ReportFilters>(() => {
    let from: string | null = null;
    let to: string | null = null;
    if (range === "custom") {
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
      status: status || null,
      user_id: userId || null,
      period,
      page,
      page_size: PAGE_SIZE,
    };
  }, [customFrom, customTo, operator, page, period, range, status, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTransferReport(filters)
      .then((next) => { if (active) setReport(next); })
      .catch((err) => {
        if (active) toast({ title: "تعذّر تحميل التقرير", description: String(err?.message ?? err), variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, reloadKey, toast]);

  const dimensions = useMemo(() => {
    if (!report) return [] as ReportDimension[];
    switch (dimension) {
      case "operator": return report.by_operator;
      case "status": return report.by_status;
      case "user": return report.by_user;
      case "device": return report.by_device;
      case "sync": return report.by_sync_status;
      default: return [];
    }
  }, [report, dimension]);

  const avgAmount = useMemo(() => {
    const total = report?.total ?? 0;
    return Math.round((report?.amount_total ?? 0) / total);
  }, [report]);

  const successRate = useMemo(() => {
    const total = report?.total ?? 0;
    return Math.round((report?.success_count ?? 0) / total);
  }, [report]);

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));
  const resetPage = (action: () => void) => { setPage(1); action(); };

  const activeFilterCount = [operator, status, userId]
    .filter(Boolean).length + (range === "custom" && (customFrom || customTo) ? 1 : 0);

  const clearFilters = () => {
    setPage(1);
    setRange(defaultState.range);
    setPeriod(defaultState.period);
    setOperator(""); setStatus("");
    setUserId("");
    setCustomFrom(""); setCustomTo("");
  };

  const exportCsv = () => {
    const rows = report?.rows ?? [];
    if (!rows.length) {
      toast({ title: "لا توجد بيانات للتصدير" });
      return;
    }
    const headers = ["date", "phone", "amount", "operator", "status", "user"];
    const csv = [headers.join(",")]
      .concat(rows.map((r: ReportRow) => [
        new Date(r.created_at).toISOString(),
        r.phone,
        r.amount,
        r.operator,
        r.status,
        r.display_name || r.email || r.user_id || "",
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
  };

  return (
    <AppLayout title="التقارير" titleIcon={<BarChart3 className="w-5 h-5 text-primary-foreground" />}>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]" dir="rtl">
        <section className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">تقارير التحويل</h2>
              <p className="text-xs text-muted-foreground">ملخصات مجمّعة، تصفية متقدمة، وتصدير CSV</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                report?.source === "offline" ? "border-warning/30 text-warning bg-warning/5" : "border-success/30 text-success bg-success/5"
              }`}>
                {report?.source === "offline" ? <WifiOff className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
                {report?.source === "offline" ? "بيانات محلية" : "بيانات الخادم"}
              </span>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!report?.rows.length}>
                <Download className="ml-1 h-4 w-4" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={clearFilters} disabled={!activeFilterCount && range === "30" && period === "day"}>
                <RotateCcw className="ml-1 h-4 w-4" /> مسح
              </Button>
              <Button size="icon" variant="outline" onClick={() => setReloadKey((v) => v + 1)} title="تحديث">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect label="الفترة" value={range} onChange={(v) => resetPage(() => setRange(v as Range))}>
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يوماً</option>
            <option value="90">آخر 90 يوماً</option>
            <option value="all">كل البيانات</option>
            <option value="custom">نطاق مخصص</option>
          </FilterSelect>
          <FilterSelect label="التجميع" value={period} onChange={(v) => resetPage(() => setPeriod(v as ReportPeriod))}>
            <option value="day">يومي</option>
            <option value="week">أسبوعي</option>
            <option value="month">شهري</option>
          </FilterSelect>
          <FilterSelect label="المشغل" value={operator} onChange={(v) => resetPage(() => setOperator(v))}>
            <option value="">كل المشغلين</option>
            <option value="mtn">MTN</option>
            <option value="syriatel">Syriatel</option>
          </FilterSelect>
          <FilterSelect label="الحالة" value={status} onChange={(v) => resetPage(() => setStatus(v))}>
            <option value="">كل الحالات</option>
            <option value="success">ناجح</option>
            <option value="completed">مكتمل</option>
            <option value="failed">فاشل</option>
            <option value="pending">قيد الانتظار</option>
          </FilterSelect>
        </section>

        {range === "custom" && (
          <section className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">من تاريخ</span>
              <Input type="date" value={customFrom} onChange={(e) => resetPage(() => setCustomFrom(e.target.value))} />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">إلى تاريخ</span>
              <Input type="date" value={customTo} onChange={(e) => resetPage(() => setCustomTo(e.target.value))} />
            </label>
          </section>
        )}

        <details className="border-y border-border py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            عوامل تصفية متقدمة
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{activeFilterCount}</span>
            )}
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <FilterInput label="معرف المستخدم" value={userId} onChange={(v) => resetPage(() => setUserId(v))} />
          </div>
        </details>

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Metric label="العمليات" value={fmt(report?.total ?? 0)} />
          <Metric label="إجمالي المبالغ" value={fmt(report?.amount_total ?? 0)} />
          <Metric label="متوسط العملية" value={fmt(avgAmount)} />
          <Metric label="نسبة النجاح" value={`${successRate}%`} tone={successRate >= 80 ? "success" : successRate >= 50 ? undefined : "danger"} />
          <Metric label="ناجحة" value={fmt(report?.success_count ?? 0)} tone="success" />
          <Metric label="غير ناجحة" value={fmt(report?.failure_count ?? 0)} tone="danger" />
        </section>

        {(report?.sync_total ?? 0) > 0 && (
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="عمليات المزامنة" value={fmt(report?.sync_total ?? 0)} />
            <Metric label="فشل المزامنة" value={fmt(report?.sync_failed ?? 0)} tone="danger" />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="min-h-[300px] border-y border-border py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <BarChart3 className="h-4 w-4" /> اتجاهاً
              </h3>
              <div className="flex items-center gap-1">
                {(["operator", "status", "device", "user", "sync"] as Dimension[]).map((d) => (
                  <button key={d} onClick={() => { setDimension(d); }}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                      dimension === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}>{dimLabel(d)}</button>
                ))}
              </div>
            </div>
            {dimensions.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dimensions.map((d) => ({ name: d.key, value: d.amount, count: d.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12 }} />
                  <Legend formatter={(v: string) => <span style={{ fontSize: 12 }}>{v === "value" ? "المبلغ" : v === "count" ? "العدد" : v}</span>} />
                  <Bar dataKey="value" name="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
          <div className="border-y border-border py-4 space-y-1 min-h-[300px]">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-2"><Activity className="h-4 w-4" /> ملخص</h3>
            {(dimensions.length > 0 ? dimensions : []).map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-xs">{dimensionLabel(dimension, d)}</span>
                <span className="text-xs font-bold">{fmt(d.count)} <span className="font-normal text-muted-foreground">عمليات</span></span>
              </div>
            ))}
            {!dimensions.length && <p className="text-xs text-muted-foreground text-center pt-12">لا توجد أبعاد للتقرير</p>}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Database className="h-4 w-4" /> السجل التفصيلي</h3>
            <span className="text-[10px] text-muted-foreground">
              {report?.total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, report.total)} من ${fmt(report.total)}` : "لا توجد بيانات"}
            </span>
          </div>
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[700px] text-right text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">التاريخ</th>
                  <th className="p-2 font-medium">الهاتف</th>
                  <th className="p-2 font-medium">المبلغ</th>
                  <th className="p-2 font-medium">المشغل</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-2">{new Date(row.created_at).toLocaleString("ar-SY")}</td>
                    <td className="p-2 font-mono" dir="ltr">{row.phone}</td>
                    <td className="p-2 font-semibold">{fmt(row.amount)}</td>
                    <td className="p-2 uppercase">{row.operator}</td>
                    <td className="p-2"><StatusBadge status={row.status} /></td>
                    <td className="max-w-[180px] break-all p-2">{row.display_name || row.email || row.user_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !(report?.rows.length) && <EmptyState />}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button size="icon" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((v) => Math.max(1, v - 1))} title="السابق">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
            <Button size="icon" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} title="التالي">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" className="font-mono text-xs" placeholder="—" />
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${
        tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground"
      }`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const cls = s === "success" || s === "completed"
    ? "bg-success/15 text-success"
    : s === "failed"
      ? "bg-destructive/15 text-destructive"
      : s === "pending"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";
  const label = s === "success" ? "ناجح" : s === "completed" ? "مكتمل" : s === "failed" ? "فاشل" : s === "pending" ? "قيد الانتظار" : status;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
        <BarChart3 className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">لا توجد بيانات مطابقة</p>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground">اختر بُعداً لعرض الرسم البياني</div>;
}

function dimLabel(d: Dimension): string {
  if (d === "operator") return "المشغل";
  if (d === "status") return "الحالة";
  if (d === "device") return "الجهاز";
  if (d === "user") return "المستخدم";
  if (d === "sync") return "المزامنة";
  return d;
}

function dimensionLabel(dim: Dimension, item: ReportDimension): string {
  if (dim === "status") return statusArabic(item.key);
  if (dim === "operator") return (item.label || item.key || "").toUpperCase();
  return item.label || item.key || "—";
}

function statusArabic(s: string): string {
  const k = (s || "").toLowerCase();
  if (k === "success") return "ناجح";
  if (k === "completed") return "مكتمل";
  if (k === "failed") return "فاشل";
  if (k === "pending") return "قيد الانتظار";
  return s || "—";
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("ar-SY");
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default Reports;
