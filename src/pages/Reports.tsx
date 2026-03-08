import { useState, useMemo } from "react";
import { ArrowLeft, BarChart3, Calendar, Smartphone, TrendingUp, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getHistory, type TransferRecord } from "@/lib/transfer-history";

type TabType = "all" | "daily" | "weekly" | "monthly" | "cards";
type Operator = "mtn" | "syriatel";

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selectedOperator, setSelectedOperator] = useState<Operator | "all">("all");
  const history = useMemo(() => getHistory(), []);

  const filteredHistory = useMemo(() => {
    const successful = history.filter((r) => r.status === "success");
    if (selectedOperator === "all") return successful;
    return successful.filter((r) => r.operator === selectedOperator);
  }, [history, selectedOperator]);

  // Helper: get week label
  const getWeekLabel = (ts: number) => {
    const d = new Date(ts);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `الأسبوع ${weekNum} - ${d.getFullYear()}`;
  };

  // Group by day
  const dailyTotals = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; mtn: number; syriatel: number; mtnCount: number; syrCount: number }>();
    filteredHistory.forEach((r) => {
      const day = new Date(r.timestamp).toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
      const prev = map.get(day) || { count: 0, sum: 0, mtn: 0, syriatel: 0, mtnCount: 0, syrCount: 0 };
      map.set(day, {
        count: prev.count + 1,
        sum: prev.sum + Number(r.amount),
        mtn: prev.mtn + (r.operator === "mtn" ? Number(r.amount) : 0),
        syriatel: prev.syriatel + (r.operator === "syriatel" ? Number(r.amount) : 0),
        mtnCount: prev.mtnCount + (r.operator === "mtn" ? 1 : 0),
        syrCount: prev.syrCount + (r.operator === "syriatel" ? 1 : 0),
      });
    });
    return Array.from(map.entries());
  }, [filteredHistory]);

  // Group by week
  const weeklyTotals = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; mtn: number; syriatel: number; mtnCount: number; syrCount: number }>();
    filteredHistory.forEach((r) => {
      const week = getWeekLabel(r.timestamp);
      const prev = map.get(week) || { count: 0, sum: 0, mtn: 0, syriatel: 0, mtnCount: 0, syrCount: 0 };
      map.set(week, {
        count: prev.count + 1,
        sum: prev.sum + Number(r.amount),
        mtn: prev.mtn + (r.operator === "mtn" ? Number(r.amount) : 0),
        syriatel: prev.syriatel + (r.operator === "syriatel" ? Number(r.amount) : 0),
        mtnCount: prev.mtnCount + (r.operator === "mtn" ? 1 : 0),
        syrCount: prev.syrCount + (r.operator === "syriatel" ? 1 : 0),
      });
    });
    return Array.from(map.entries());
  }, [filteredHistory]);

  // Group by month
  const monthlyTotals = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; mtn: number; syriatel: number; mtnCount: number; syrCount: number }>();
    filteredHistory.forEach((r) => {
      const month = new Date(r.timestamp).toLocaleDateString("ar-SY", { year: "numeric", month: "long" });
      const prev = map.get(month) || { count: 0, sum: 0, mtn: 0, syriatel: 0, mtnCount: 0, syrCount: 0 };
      map.set(month, {
        count: prev.count + 1,
        sum: prev.sum + Number(r.amount),
        mtn: prev.mtn + (r.operator === "mtn" ? Number(r.amount) : 0),
        syriatel: prev.syriatel + (r.operator === "syriatel" ? Number(r.amount) : 0),
        mtnCount: prev.mtnCount + (r.operator === "mtn" ? 1 : 0),
        syrCount: prev.syrCount + (r.operator === "syriatel" ? 1 : 0),
      });
    });
    return Array.from(map.entries());
  }, [filteredHistory]);

  // Per-card stats (grouped by operator then by amount)
  const cardStats = useMemo(() => {
    const buildStats = (records: TransferRecord[]) => {
      const amountMap = new Map<number, { count: number; today: number; week: number; month: number }>();
      const now = new Date();
      const todayStr = now.toDateString();
      const weekAgo = now.getTime() - 7 * 86400000;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      records.forEach((r) => {
        const amt = Number(r.amount);
        const prev = amountMap.get(amt) || { count: 0, today: 0, week: 0, month: 0 };
        prev.count++;
        if (new Date(r.timestamp).toDateString() === todayStr) prev.today++;
        if (r.timestamp >= weekAgo) prev.week++;
        if (r.timestamp >= monthStart) prev.month++;
        amountMap.set(amt, prev);
      });

      return Array.from(amountMap.entries()).sort((a, b) => a[0] - b[0]);
    };

    const mtnRecords = filteredHistory.filter((r) => r.operator === "mtn");
    const syrRecords = filteredHistory.filter((r) => r.operator === "syriatel");

    return {
      mtn: buildStats(selectedOperator === "syriatel" ? [] : mtnRecords),
      syriatel: buildStats(selectedOperator === "mtn" ? [] : syrRecords),
      mtnTotal: mtnRecords.reduce((s, r) => s + Number(r.amount), 0),
      syrTotal: syrRecords.reduce((s, r) => s + Number(r.amount), 0),
      mtnCount: mtnRecords.length,
      syrCount: syrRecords.length,
    };
  }, [filteredHistory, selectedOperator]);

  const tabs: { id: TabType; label: string }[] = [
    { id: "all", label: "الكل" },
    { id: "daily", label: "يومي" },
    { id: "weekly", label: "أسبوعي" },
    { id: "monthly", label: "شهري" },
    { id: "cards", label: "البطاقات" },
  ];

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "success") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />;
  };

  const PeriodRow = ({ label, data }: { label: string; data: { count: number; sum: number; mtn: number; syriatel: number; mtnCount: number; syrCount: number } }) => (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{data.count} عملية</span>
          <span className="text-xs font-bold text-foreground">{data.sum.toLocaleString()}</span>
        </div>
      </div>
      {selectedOperator === "all" && (data.mtn > 0 || data.syriatel > 0) && (
        <div className="flex gap-2 text-[10px]">
          {data.mtn > 0 && (
            <span className="bg-operator-mtn/15 text-operator-mtn-foreground px-1.5 py-0.5 rounded">
              MTN: {data.mtnCount}× — {data.mtn.toLocaleString()}
            </span>
          )}
          {data.syriatel > 0 && (
            <span className="bg-operator-syriatel/15 text-operator-syriatel-foreground px-1.5 py-0.5 rounded">
              SYR: {data.syrCount}× — {data.syriatel.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const CardSection = ({ operator, cards, total, count }: { operator: Operator; cards: [number, { count: number; today: number; week: number; month: number }][]; total: number; count: number }) => {
    if (cards.length === 0) return null;
    const isMtn = operator === "mtn";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className={`w-4 h-4 ${isMtn ? "text-operator-mtn" : "text-operator-syriatel"}`} />
            <span className="font-bold text-sm text-foreground">{isMtn ? "MTN" : "Syriatel"}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {count} عملية — {total.toLocaleString()}
          </div>
        </div>
        <div className="space-y-1">
          {cards.map(([amount, stats]) => (
            <div key={amount} className="bg-card border border-border rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-bold ${isMtn ? "text-operator-mtn" : "text-operator-syriatel"}`}>
                  بطاقة {amount}
                </span>
                <span className="text-xs font-bold text-foreground">{stats.count} عملية</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-muted rounded px-2 py-1 text-center">
                  <p className="text-[9px] text-muted-foreground">اليوم</p>
                  <p className="text-xs font-bold text-foreground">{stats.today}</p>
                </div>
                <div className="bg-muted rounded px-2 py-1 text-center">
                  <p className="text-[9px] text-muted-foreground">الأسبوع</p>
                  <p className="text-xs font-bold text-foreground">{stats.week}</p>
                </div>
                <div className="bg-muted rounded px-2 py-1 text-center">
                  <p className="text-[9px] text-muted-foreground">الشهر</p>
                  <p className="text-xs font-bold text-foreground">{stats.month}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets">
      <header className="bg-primary px-3 py-3 flex items-center gap-3 shadow-md pt-safe">
        <button onClick={() => navigate("/")} className="text-primary-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <BarChart3 className="w-5 h-5 text-primary-foreground" />
        <h1 className="text-primary-foreground text-lg font-bold">التقارير</h1>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-2 bg-muted/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Operator Filter */}
      <div className="flex gap-1 px-3 pt-2">
        {(["all", "mtn", "syriatel"] as const).map((op) => (
          <button
            key={op}
            onClick={() => setSelectedOperator(op)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
              selectedOperator === op
                ? op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground"
                : op === "syriatel" ? "bg-operator-syriatel text-operator-syriatel-foreground"
                : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {op === "all" ? "الكل" : op === "mtn" ? "MTN" : "Syriatel"}
          </button>
        ))}
      </div>

      <main className="flex-1 p-3 w-full overflow-y-auto pb-safe" dir="rtl">
        {/* Summary */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">العمليات</p>
            <p className="text-sm font-bold text-foreground">{filteredHistory.length}</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">الإجمالي</p>
            <p className="text-sm font-bold text-foreground">
              {filteredHistory.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()}
            </p>
          </div>
          {selectedOperator === "all" && (
            <>
              <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
                <p className="text-[10px] text-operator-mtn font-bold">MTN</p>
                <p className="text-sm font-bold text-foreground">{cardStats.mtnCount}</p>
              </div>
              <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
                <p className="text-[10px] text-operator-syriatel font-bold">SYR</p>
                <p className="text-sm font-bold text-foreground">{cardStats.syrCount}</p>
              </div>
            </>
          )}
        </div>

        {/* ALL tab */}
        {activeTab === "all" && (
          <div className="space-y-1">
            {history.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد عمليات</p>
            )}
            {history
              .filter((r) => selectedOperator === "all" || r.operator === selectedOperator)
              .map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-foreground" dir="ltr">{r.phone}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.timestamp).toLocaleDateString("ar-SY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    r.operator === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
                  }`}>
                    {r.operator === "mtn" ? "MTN" : "SYR"}
                  </span>
                  <span className="font-bold text-xs text-foreground">{Number(r.amount).toLocaleString()}</span>
                  <StatusIcon status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DAILY tab */}
        {activeTab === "daily" && (
          <div className="space-y-1">
            {dailyTotals.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>}
            {dailyTotals.map(([day, data]) => (
              <PeriodRow key={day} label={day} data={data} />
            ))}
          </div>
        )}

        {/* WEEKLY tab */}
        {activeTab === "weekly" && (
          <div className="space-y-1">
            {weeklyTotals.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>}
            {weeklyTotals.map(([week, data]) => (
              <PeriodRow key={week} label={week} data={data} />
            ))}
          </div>
        )}

        {/* MONTHLY tab */}
        {activeTab === "monthly" && (
          <div className="space-y-1">
            {monthlyTotals.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>}
            {monthlyTotals.map(([month, data]) => (
              <PeriodRow key={month} label={month} data={data} />
            ))}
          </div>
        )}

        {/* CARDS tab */}
        {activeTab === "cards" && (
          <div className="space-y-4">
            {cardStats.mtn.length === 0 && cardStats.syriatel.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>
            )}
            <CardSection operator="mtn" cards={cardStats.mtn} total={cardStats.mtnTotal} count={cardStats.mtnCount} />
            <CardSection operator="syriatel" cards={cardStats.syriatel} total={cardStats.syrTotal} count={cardStats.syrCount} />
          </div>
        )}
      </main>
    </div>
  );
};

export default Reports;
