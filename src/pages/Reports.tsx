import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  TrendingUp,
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
type Dimension = "operator" | "status" | "access" | "user" | "device" | "sync";

const PAGE_SIZE = 50;

const defaultState = {
  period: "day" as ReportPeriod,
  range: "30" as Range,
  operator: "",
  status: "",
  accessSource: "",
  userId: "",
  deviceId: "",
  trialId: "",
  licenseId: "",
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
  const [accessSource, setAccessSource] = useState(defaultState.accessSource);
  const [userId, setUserId] = useState(defaultState.userId);
  const [deviceId, setDeviceId] = useState(defaultState.deviceId);
  const [trialId, setTrialId] = useState(defaultState.trialId);
  const [licenseId, setLicenseId] = useState(defaultState.licenseId);
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
      device_id: deviceId || null,
      trial_id: trialId || null,
      license_id: licenseId || null,
      access_source: accessSource || null,
      period,
      page,
      page_size: PAGE_SIZE,
    };
  }, [accessSource, customFrom, customTo, deviceId, licenseId, operator, page, period, range, status, trialId, userId]);

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
    const map: Record<Dimension, ReportDimension[]> = {
      operator: report.by_operator,
      status: report.by_status,
      access: report.by_access,
      user: report.by_user,
      device: report.by_device,
      sync: report.by_sync_status,
    };
    return map[dimension] ?? [];
  }, [dimension, report]);

  const dimensionTotal = useMemo(
    () => dimensions.reduce((sum, item) => sum + item.count, 0),
    [dimensions],
  );

  const chartData = useMemo(() => (report?.periods ?? []).map((point) => ({
    period: new Date(point.period_start).toLocaleDateString("ar-SY", period === "month"
      ? { month: "short", year: "2-digit" }
      : { day: "numeric", month: "short" }),
    amount: point.amount_total,
    success: point.success_count,
    failed: point.failure_count,
  })), [period, report]);

  const successRate = useMemo(() => {
    const total = report?.total ?? 0;
    if (!total) return 0;
    return Math.round(((report?.success_count ?? 0) / total) * 100);
  }, [report]);

  const avgAmount = useMemo(() => {
    const total = report?.total ?? 0;
    if (!total) return 0;
    return Math.round((report?.amount_total ?? 0) / total);
  }, [report]);

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));
  const resetPage = (action: () => void) => { setPage(1); action(); };

  const activeFilterCount = [operator, status, accessSource, userId, deviceId, trialId, licenseId]
    .filter(Boolean).length + (range === "custom" && (customFrom || customTo) ? 1 : 0);

  const clearFilters = () => {
    setPage(1);
    setRange(defaultState.range);
    setPeriod(defaultState.period);
    setOperator(""); setStatus(""); setAccessSource("");
    setUserId(""); setDeviceId(""); setTrialId(""); setLicenseId("");
    setCustomFrom(""); setCustomTo("");
  };

  const exportCsv = () => {
    const rows = report?.rows ?? [];
    if (!rows.length) {
      toast({ title: "لا توجد بيانات للتصدير" });
      return;
    }
    const headers = ["date", "phone", "amount", "operator", "status", "access", "device", "user"];
    const csv = [headers.join(",")]
      .concat(rows.map((r: ReportRow) => [
        new Date(r.created_at).toISOString(),
        r.phone,
        r.amount,
        r.operator,
        r.status,
        r.access_source,
        r.device_id,
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
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                report?.source === "offline" ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"
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

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
          <FilterSelect label="نوع الوصول" value={accessSource} onChange={(v) => resetPage(() => setAccessSource(v))}>
            <option value="">الكل</option>
            <option value="trial">تجربة</option>
            <option value="temporary_license">ترخيص مؤقت</option>
            <option value="permanent_license">ترخيص دائم</option>
            <option value="offline_cache">ذاكرة الجهاز</option>
            <option value="none">بدون ترخيص</option>
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
            <FilterInput label="معرف الجهاز" value={deviceId} onChange={(v) => resetPage(() => setDeviceId(v))} />
            <FilterInput label="معرف التجربة" value={trialId} onChange={(v) => resetPage(() => setTrialId(v))} />
            <FilterInput label="معرف الترخيص" value={licenseId} onChange={(v) => resetPage(() => setLicenseId(v))} />
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
                <Activity className="h-4 w-4 text-primary" />
                حركة العمليات
              </h3>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ direction: "rtl" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="success" stackId="ops" name="ناجحة" fill="hsl(142 71% 45%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="failed" stackId="ops" name="فاشلة" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>

          <div className="border-y border-border py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <TrendingUp className="h-4 w-4 text-primary" />
                التوزيع
              </h3>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as Dimension)}
              >
                <option value="operator">حسب المشغل</option>
                <option value="status">حسب الحالة</option>
                <option value="access">حسب الوصول</option>
                <option value="user">حسب المستخدم</option>
                <option value="device">حسب الجهاز</option>
                <option value="sync">حسب المزامنة</option>
              </select>
            </div>
            <div className="max-h-[260px] space-y-2 overflow-y-auto pl-1">
              {dimensions.length ? dimensions.map((item) => {
                const pct = dimensionTotal ? Math.round((item.count / dimensionTotal) * 100) : 0;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium" title={item.label || item.key}>{dimensionLabel(dimension, item)}</span>
                      <span className="shrink-0 text-muted-foreground">{fmt(item.count)} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">مجموع: {fmt(item.amount)}</div>
                  </div>
                );
              }) : <EmptyState />}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">سجل العمليات</h3>
            <span className="text-xs text-muted-foreground">
              {report?.total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, report.total)} من ${fmt(report.total)}` : "لا توجد بيانات"}
            </span>
          </div>
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">التاريخ</th>
                  <th className="p-2 font-medium">الهاتف</th>
                  <th className="p-2 font-medium">المبلغ</th>
                  <th className="p-2 font-medium">المشغل</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">الوصول</th>
                  <th className="p-2 font-medium">الجهاز</th>
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
                    <td className="p-2">{accessLabel(row.access_source)}</td>
                    <td className="max-w-[220px] break-all p-2 font-mono text-[10px]" dir="ltr">{row.device_id}</td>
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
    <div className="border-b border-border px-2 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${
        tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "text-foreground"
      }`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const cls = s === "success" || s === "completed"
    ? "bg-emerald-100 text-emerald-700"
    : s === "failed"
      ? "bg-red-100 text-red-700"
      : s === "pending"
        ? "bg-amber-100 text-amber-700"
        : "bg-muted text-muted-foreground";
  const label = s === "success" ? "ناجح" : s === "completed" ? "مكتمل" : s === "failed" ? "فاشل" : s === "pending" ? "قيد الانتظار" : status;
  return <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function EmptyState() {
  return <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات مطابقة</p>;
}

function accessLabel(value: string): string {
  if (value === "trial") return "تجربة";
  if (value === "temporary_license") return "ترخيص مؤقت";
  if (value === "permanent_license") return "ترخيص دائم";
  if (value === "offline_cache") return "ذاكرة الجهاز";
  return "بدون ترخيص";
}

function dimensionLabel(dim: Dimension, item: ReportDimension): string {
  if (dim === "status") return statusArabic(item.key);
  if (dim === "access") return accessLabel(item.key);
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
