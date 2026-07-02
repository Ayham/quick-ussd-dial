import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Filter,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchTransferReport,
  type ReportDimension,
  type ReportFilters,
  type ReportPeriod,
  type TransferReport,
} from "@/lib/reports";

type Range = "7" | "30" | "90" | "all";
type Dimension = "operator" | "status" | "access" | "user" | "device" | "sync";

const PAGE_SIZE = 50;

const Reports = () => {
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [range, setRange] = useState<Range>("30");
  const [operator, setOperator] = useState("");
  const [status, setStatus] = useState("");
  const [accessSource, setAccessSource] = useState("");
  const [userId, setUserId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [trialId, setTrialId] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [dimension, setDimension] = useState<Dimension>("operator");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<TransferReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo<ReportFilters>(() => {
    const from = range === "all"
      ? null
      : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
    return {
      date_from: from,
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
  }, [accessSource, deviceId, licenseId, operator, page, period, range, status, trialId, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTransferReport(filters)
      .then((next) => {
        if (active) setReport(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, reloadKey]);

  const dimensions = useMemo(() => {
    if (!report) return [];
    const map: Record<Dimension, ReportDimension[]> = {
      operator: report.by_operator,
      status: report.by_status,
      access: report.by_access,
      user: report.by_user,
      device: report.by_device,
      sync: report.by_sync_status,
    };
    return map[dimension];
  }, [dimension, report]);

  const chartData = useMemo(() => (report?.periods ?? []).map((point) => ({
    period: new Date(point.period_start).toLocaleDateString("ar-SY", period === "month"
      ? { month: "short", year: "2-digit" }
      : { day: "numeric", month: "short" }),
    amount: point.amount_total,
    success: point.success_count,
    failed: point.failure_count,
  })), [period, report]);

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));
  const resetPage = (action: () => void) => {
    setPage(1);
    action();
  };

  return (
    <AppLayout title="التقارير" titleIcon={<BarChart3 className="w-5 h-5 text-primary-foreground" />}>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]" dir="rtl">
        <section className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">تقارير التحويل</h2>
              <p className="text-xs text-muted-foreground">ملخصات مجمعة وصفحات محدودة للأداء مع البيانات الكبيرة</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                report?.source === "offline" ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"
              }`}>
                {report?.source === "offline" ? <WifiOff className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
                {report?.source === "offline" ? "بيانات الجهاز" : "بيانات الخادم"}
              </span>
              <Button size="icon" variant="outline" onClick={() => setReloadKey((value) => value + 1)} title="تحديث">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect label="الفترة" value={range} onChange={(value) => resetPage(() => setRange(value as Range))}>
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يوماً</option>
            <option value="90">آخر 90 يوماً</option>
            <option value="all">كل البيانات</option>
          </FilterSelect>
          <FilterSelect label="التجميع" value={period} onChange={(value) => resetPage(() => setPeriod(value as ReportPeriod))}>
            <option value="day">يومي</option>
            <option value="week">أسبوعي</option>
            <option value="month">شهري</option>
          </FilterSelect>
          <FilterSelect label="المشغل" value={operator} onChange={(value) => resetPage(() => setOperator(value))}>
            <option value="">كل المشغلين</option>
            <option value="mtn">MTN</option>
            <option value="syriatel">Syriatel</option>
          </FilterSelect>
          <FilterSelect label="الحالة" value={status} onChange={(value) => resetPage(() => setStatus(value))}>
            <option value="">كل الحالات</option>
            <option value="success">ناجح</option>
            <option value="completed">مكتمل</option>
            <option value="failed">فاشل</option>
            <option value="pending">قيد الانتظار</option>
          </FilterSelect>
          <FilterSelect label="نوع الوصول" value={accessSource} onChange={(value) => resetPage(() => setAccessSource(value))}>
            <option value="">الكل</option>
            <option value="trial">تجربة</option>
            <option value="temporary_license">ترخيص مؤقت</option>
            <option value="permanent_license">ترخيص دائم</option>
            <option value="none">بدون ترخيص</option>
          </FilterSelect>
        </section>

        <details className="border-y border-border py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            عوامل تصفية متقدمة
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <FilterInput label="معرف المستخدم" value={userId} onChange={(value) => resetPage(() => setUserId(value))} />
            <FilterInput label="معرف الجهاز" value={deviceId} onChange={(value) => resetPage(() => setDeviceId(value))} />
            <FilterInput label="معرف التجربة" value={trialId} onChange={(value) => resetPage(() => setTrialId(value))} />
            <FilterInput label="معرف الترخيص" value={licenseId} onChange={(value) => resetPage(() => setLicenseId(value))} />
          </div>
        </details>

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Metric label="العمليات" value={(report?.total ?? 0).toLocaleString()} />
          <Metric label="إجمالي المبالغ" value={(report?.amount_total ?? 0).toLocaleString()} />
          <Metric label="ناجحة" value={(report?.success_count ?? 0).toLocaleString()} tone="success" />
          <Metric label="غير ناجحة" value={(report?.failure_count ?? 0).toLocaleString()} tone="danger" />
          <Metric label="المزامنة" value={(report?.sync_total ?? 0).toLocaleString()} />
          <Metric label="فشل المزامنة" value={(report?.sync_failed ?? 0).toLocaleString()} tone="danger" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="min-h-[300px] border-y border-border py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Activity className="h-4 w-4 text-primary" />
                حركة المبالغ
              </h3>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="amount" name="المبلغ" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>

          <div className="border-y border-border py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">التوزيع</h3>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={dimension}
                onChange={(event) => setDimension(event.target.value as Dimension)}
              >
                <option value="operator">حسب المشغل</option>
                <option value="status">حسب الحالة</option>
                <option value="access">حسب التجربة/الترخيص</option>
                <option value="user">حسب المستخدم</option>
                <option value="device">حسب الجهاز</option>
                <option value="sync">حسب المزامنة</option>
              </select>
            </div>
            <div className="max-h-[250px] space-y-1 overflow-y-auto">
              {dimensions.length ? dimensions.map((item) => (
                <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border py-2 text-xs">
                  <span className="break-all font-medium">{item.label || item.key}</span>
                  <span className="text-muted-foreground">{item.count.toLocaleString()}</span>
                  <span className="font-semibold">{item.amount.toLocaleString()}</span>
                </div>
              )) : <EmptyState />}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">سجل العمليات</h3>
            <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
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
                    <td className="p-2 font-semibold">{row.amount.toLocaleString()}</td>
                    <td className="p-2">{row.operator}</td>
                    <td className="p-2">{row.status}</td>
                    <td className="p-2">{accessLabel(row.access_source)}</td>
                    <td className="max-w-[220px] break-all p-2 font-mono" dir="ltr">{row.device_id}</td>
                    <td className="max-w-[180px] break-all p-2">{row.display_name || row.email || row.user_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !(report?.rows.length) && <EmptyState />}
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              title="الصفحة السابقة"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              title="الصفحة التالية"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} dir="ltr" className="font-mono text-xs" />
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

export default Reports;
