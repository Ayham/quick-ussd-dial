import { useState, useMemo } from "react";
import { ArrowLeft, BarChart3, Calendar, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getHistory, type TransferRecord } from "@/lib/transfer-history";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type TabType = "all" | "daily" | "monthly" | "network";

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const history = useMemo(() => getHistory(), []);

  const successfulOnly = useMemo(
    () => history.filter((r) => r.status === "success"),
    [history]
  );

  // Group by day
  const dailyTotals = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    successfulOnly.forEach((r) => {
      const day = new Date(r.timestamp).toLocaleDateString("ar-SY", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const prev = map.get(day) || { count: 0, sum: 0 };
      map.set(day, { count: prev.count + 1, sum: prev.sum + Number(r.amount) });
    });
    return Array.from(map.entries());
  }, [successfulOnly]);

  // Group by month
  const monthlyTotals = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    successfulOnly.forEach((r) => {
      const month = new Date(r.timestamp).toLocaleDateString("ar-SY", {
        year: "numeric",
        month: "long",
      });
      const prev = map.get(month) || { count: 0, sum: 0 };
      map.set(month, { count: prev.count + 1, sum: prev.sum + Number(r.amount) });
    });
    return Array.from(map.entries());
  }, [successfulOnly]);

  // Network breakdown
  const networkTotals = useMemo(() => {
    const mtn = successfulOnly.filter((r) => r.operator === "mtn");
    const syr = successfulOnly.filter((r) => r.operator === "syriatel");
    return {
      mtn: { count: mtn.length, sum: mtn.reduce((s, r) => s + Number(r.amount), 0) },
      syriatel: { count: syr.length, sum: syr.reduce((s, r) => s + Number(r.amount), 0) },
    };
  }, [successfulOnly]);

  const tabs: { id: TabType; label: string }[] = [
    { id: "all", label: "الكل" },
    { id: "daily", label: "يومي" },
    { id: "monthly", label: "شهري" },
    { id: "network", label: "الشبكة" },
  ];

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "success") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />;
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

      <main className="flex-1 p-3 max-w-md mx-auto w-full overflow-y-auto pb-safe">
        {/* Summary bar */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">إجمالي العمليات</p>
            <p className="text-sm font-bold text-foreground">{successfulOnly.length}</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">إجمالي المبالغ</p>
            <p className="text-sm font-bold text-foreground">
              {successfulOnly.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()}
            </p>
          </div>
        </div>

        {activeTab === "all" && (
          <div className="space-y-1">
            {history.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد عمليات</p>
            )}
            {history.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-foreground" dir="ltr">
                    {r.phone}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.timestamp).toLocaleDateString("ar-SY", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      r.operator === "mtn"
                        ? "bg-operator-mtn text-operator-mtn-foreground"
                        : "bg-operator-syriatel text-operator-syriatel-foreground"
                    }`}
                  >
                    {r.operator === "mtn" ? "MTN" : "SYR"}
                  </span>
                  <span className="font-bold text-xs text-foreground">
                    {Number(r.amount).toLocaleString()}
                  </span>
                  <StatusIcon status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "daily" && (
          <div className="space-y-1">
            {dailyTotals.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>
            )}
            {dailyTotals.map(([day, data]) => (
              <div
                key={day}
                className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{day}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">{data.count} عملية</span>
                  <span className="text-xs font-bold text-foreground">
                    {data.sum.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "monthly" && (
          <div className="space-y-1">
            {monthlyTotals.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>
            )}
            {monthlyTotals.map(([month, data]) => (
              <div
                key={month}
                className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{month}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">{data.count} عملية</span>
                  <span className="text-xs font-bold text-foreground">
                    {data.sum.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "network" && (
          <div className="space-y-2">
            <div className="bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-operator-mtn" />
                  <span className="font-bold text-sm text-foreground">MTN</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>عدد العمليات: {networkTotals.mtn.count}</span>
                <span className="font-bold text-foreground">
                  {networkTotals.mtn.sum.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-operator-syriatel" />
                  <span className="font-bold text-sm text-foreground">Syriatel</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>عدد العمليات: {networkTotals.syriatel.count}</span>
                <span className="font-bold text-foreground">
                  {networkTotals.syriatel.sum.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">الإجمالي</span>
                <span className="font-bold text-foreground">
                  {(networkTotals.mtn.sum + networkTotals.syriatel.sum).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Reports;
