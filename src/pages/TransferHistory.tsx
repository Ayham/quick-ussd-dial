import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  Banknote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { getHistory, recordPrice, type TransferRecord } from "@/lib/transfer-history";
import { getContactByPhone, normalizePhone } from "@/lib/android-contacts";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAME_CACHE_KEY = "transfer_history_names_v1";
const NAME_RESOLVE_LIMIT = 40;
const PAGE_SIZE = 50;

function loadNameCache(): Record<string, string> {
  try {
    const stored = localStorage.getItem(NAME_CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function saveNameCache(cache: Record<string, string>) {
  try {
    localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const TransferHistory = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<TransferRecord[]>(() => getHistory());
  const [names, setNames] = useState<Record<string, string>>(() => loadNameCache());
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handleFocus = () => setRecords(getHistory());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(records.length / PAGE_SIZE)), [records]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedRecords = useMemo(
    () => records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [records, page]
  );

  const missingPhones = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of pagedRecords) {
      const phone = normalizePhone(r.phone);
      if (!phone || seen.has(phone) || names[phone]) continue;
      seen.add(phone);
      out.push(phone);
      if (out.length >= NAME_RESOLVE_LIMIT) break;
    }
    return out;
  }, [pagedRecords, names]);

  useEffect(() => {
    if (missingPhones.length === 0) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const next: Record<string, string> = {};
      for (const phone of missingPhones) {
        if (cancelled) return;
        const contact = await getContactByPhone(phone);
        if (contact?.contactId && contact.displayName) {
          next[phone] = contact.displayName;
        }
      }
      if (cancelled) return;
      setNames((prev) => {
        const merged = { ...prev, ...next };
        saveNameCache(merged);
        return merged;
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [missingPhones]);

  const summary = useMemo(() => {
    let count = 0;
    let value = 0;
    for (const r of records) {
      count++;
      value += recordPrice(r);
    }
    return { count, value };
  }, [records]);

  return (
    <AppLayout title={t("transferHistory.title")} titleIcon={<History className="w-5 h-5 text-white" />}>
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3.5 px-3 py-3 overflow-y-auto">
        {records.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 animate-slide-up">
            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-border/60 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">{t("transferHistory.count", { count: summary.count })}</p>
              <p className="text-lg font-bold text-foreground">{summary.count.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-border/60 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">{t("transferHistory.totalValue")}</p>
              <p className="text-lg font-bold text-foreground">{summary.value.toLocaleString()} {t("common.currencySymbol")}</p>
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-border/60 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Banknote className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">{t("transferHistory.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("transferHistory.emptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pagedRecords.map((record, index) => (
              <TransferCard
                key={`${record.timestamp}-${index}`}
                record={record}
                name={names[normalizePhone(record.phone)] || ""}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1 pb-2 animate-fade-in">
            <Button
              size="icon"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
              aria-label={t("common.previous")}
              className="rounded-xl h-10 w-10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("transferHistory.pageInfo", { page, totalPages })}
            </span>
            <Button
              size="icon"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
              aria-label={t("common.next")}
              className="rounded-xl h-10 w-10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

function TransferCard({ record, name }: { record: TransferRecord; name: string }) {
  const { t } = useTranslation();
  const amount = recordPrice(record);
  const isSecret = record.transferType === "secret";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-border/60 animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <OperatorBadge operator={record.operator} />
          <div className="min-w-0">
            {name ? (
              <p className="text-sm font-bold text-foreground truncate" dir="auto">{name}</p>
            ) : null}
            <p className="font-mono text-sm text-muted-foreground tracking-wider truncate" dir="ltr">
              {record.phone}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold text-foreground text-base leading-tight" dir="ltr">
            {amount.toLocaleString()} {t("common.currencySymbol")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {formatDateTime(record.timestamp)}
        </span>
        <div className="flex items-center gap-1.5">
          {isSecret && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold leading-none">
              🔑 {t("transferHistory.secretBadge")}
            </span>
          )}
          <StatusBadge status={record.status} />
        </div>
      </div>
    </div>
  );
}

function OperatorBadge({ operator }: { operator: string }) {
  const { t } = useTranslation();
  const op = (operator || "").toLowerCase();
  const isMtn = op === "mtn";
  const label = isMtn ? t("operator.mtn") : t("operator.syriatel");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-sm shrink-0",
        isMtn ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white"
      )}
    >
      <Phone className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: TransferRecord["status"] }) {
  const { t } = useTranslation();
  if (status === "failed") {
    return (
      <span className="text-[10px] font-bold text-destructive flex items-center gap-1" title={t("transferHistory.statusFailed")}>
        <XCircle className="w-3.5 h-3.5" />
        {t("transferHistory.statusFailed")}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1" title={t("transferHistory.statusPending")}>
        <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
        {t("transferHistory.statusPending")}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-success flex items-center gap-1" title={t("transferHistory.statusSuccess")}>
      <CheckCircle2 className="w-3.5 h-3.5" />
      {t("transferHistory.statusSuccess")}
    </span>
  );
}

export default TransferHistory;
