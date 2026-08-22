import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  MonitorSmartphone,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  Inbox,
  RotateCcw,
  Undo2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getCustomerOrders,
  markCustomerOrderCancelled,
  revertCustomerOrderToPending,
  markCustomerOrderExecuted,
  CUSTOMER_ORDERS_CHANGED_EVENT,
  type CustomerOrder,
  type CustomerOrderStatus,
} from "@/features/customer-display/orders";
import { setCustomerTransferPending, sendCustomerTransferResult } from "@/features/customer-display/transfer-callback";
import { detectOperator, buildUssdCode, getCredentials, getSimAssignment } from "@/lib/ussd-profiles";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { addToHistory } from "@/lib/transfer-history";
import { trackTransfer } from "@/lib/cloud-sync";
import { ensureTransferAllowed } from "@/lib/license-cache";
import { isSimConfigured } from "@/lib/onboarding";
import { incrementTransferCount } from "@/lib/setup-wizard";
import { getShowTransferConfirmation } from "@/lib/transfer-confirmation";
import { getContactByPhone, normalizePhone } from "@/lib/android-contacts";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const NAME_CACHE_KEY = "customer_orders_names_v1";
const NAME_RESOLVE_LIMIT = 40;

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

type StatusFilter = "all" | CustomerOrderStatus;

const FILTERS: StatusFilter[] = ["all", "pending", "executed", "cancelled"];

const CustomerOrders = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>(() => getCustomerOrders());
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [confirmOrder, setConfirmOrder] = useState<CustomerOrder | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() => loadNameCache());
  const busyIdRef = useRef<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setOrders(getCustomerOrders());
    window.addEventListener(CUSTOMER_ORDERS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(CUSTOMER_ORDERS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const summary = useMemo(() => {
    const out = { all: orders.length, pending: 0, executed: 0, cancelled: 0 };
    for (const o of orders) out[o.status]++;
    return out;
  }, [orders]);

  const visible = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const missingPhones = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of visible) {
      const phone = normalizePhone(r.phone);
      if (!phone || seen.has(phone) || names[phone]) continue;
      seen.add(phone);
      out.push(phone);
      if (out.length >= NAME_RESOLVE_LIMIT) break;
    }
    return out;
  }, [visible, names]);

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

  /**
   * Executes the SAME transfer path used by the main transfer screen:
   * license guard -> SIM credentials -> USSD dial -> history + tracking.
   * No separate transfer/USSD/license logic is introduced here.
   */
  const executeOrder = useCallback(async (order: CustomerOrder) => {
    if (busyIdRef.current) return;
    busyIdRef.current = order.requestId;
    setBusyId(order.requestId);
    setConfirmOrder(null);

    try {
      const op = detectOperator(order.phone.trim());
      if (!op) {
        toast.error(t("index.selectOperator"));
        return;
      }
      const guard = await ensureTransferAllowed();
      if (!guard.allowed) {
        const reason = guard.reason || t("index.transferNotAllowed");
        toast.error(reason);
        await sendCustomerTransferResult("failed", reason);
        return;
      }
      const freshCredentials = await getCredentials();
      if (!isSimConfigured(freshCredentials)) {
        toast.error(t("index.configureSimFirst"));
        await sendCustomerTransferResult("failed", t("index.configureSimFirst"));
        navigate("/settings");
        return;
      }

      const ussd = buildUssdCode(op, order.phone.trim(), String(order.amount), freshCredentials);
      const simSlot = getSimAssignment()[op];

      await dialUssdDirect(ussd, simSlot);

      addToHistory({
        phone: order.phone.trim(),
        amount: String(order.amount),
        price: String(order.price),
        operator: op,
        timestamp: Date.now(),
        status: "success",
        transferType: "phone",
      });
      trackTransfer(order.phone.trim(), String(order.amount), op, "success", {
        package_price: order.price,
        package_name: `${order.amount}`,
      });
      incrementTransferCount();

      // Executed -> the confirm button disappears permanently.
      markCustomerOrderExecuted(order.requestId);

      toast.success(t("index.transferSuccess"));
      setCustomerTransferPending(order.requestId);
      await sendCustomerTransferResult("success", t("index.transferSuccess"));
    } catch {
      toast.error(t("index.transferFailed"));
      setCustomerTransferPending(order.requestId);
      await sendCustomerTransferResult("failed", t("index.transferFailed"));
    } finally {
      busyIdRef.current = null;
      setBusyId(null);
    }
  }, [navigate, t]);

  const handleConfirmClick = useCallback((order: CustomerOrder) => {
    if (getShowTransferConfirmation()) {
      setConfirmOrder(order);
      return;
    }
    void executeOrder(order);
  }, [executeOrder]);

  const handleReject = useCallback((order: CustomerOrder) => {
    if (markCustomerOrderCancelled(order.requestId)) {
      toast.info(t("customerOrders.rejectedToast"));
    }
  }, [t]);

  const handleUndoReject = useCallback((order: CustomerOrder) => {
    if (revertCustomerOrderToPending(order.requestId)) {
      toast.success(t("customerOrders.undoRejectToast"));
    }
  }, [t]);

  return (
    <AppLayout title={t("customerOrders.title")} titleIcon={<MonitorSmartphone className="w-5 h-5 text-white" />}>
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3.5 px-3 py-3 overflow-y-auto">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 animate-slide-up">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95",
                filter === f
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border/60 hover:border-primary/30 hover:text-primary",
              )}
            >
              {t(`customerOrders.filter.${f}`)}
              <span className={cn("ms-1.5 text-[10px]", filter === f ? "text-white/70" : "text-muted-foreground/70")}>
                {summary[f]}
              </span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-border/60 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">{t("customerOrders.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("customerOrders.emptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((order) => (
              <OrderCard
                key={order.requestId}
                order={order}
                name={names[normalizePhone(order.phone)] || ""}
                busy={busyId !== null}
                onConfirm={() => handleConfirmClick(order)}
                onReject={() => handleReject(order)}
                onUndoReject={() => handleUndoReject(order)}
                onReorder={() => handleConfirmClick(order)}
              />
            ))}
          </div>
        )}

        {/* Execution confirmation dialog — mirrors the main screen dialog */}
        <AlertDialog open={confirmOrder !== null} onOpenChange={(open) => !open && setConfirmOrder(null)}>
          <AlertDialogContent dir={i18n.dir()} className="rounded-2xl max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">{t("customerOrders.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <div className="bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-2xl p-4 space-y-3 border border-primary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogAmount")}</span>
                    <span className="font-bold text-foreground text-lg">{confirmOrder?.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogPrice")}</span>
                    <span className="font-bold text-foreground">{confirmOrder?.price.toLocaleString()} {t("common.currencySymbol")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("index.dialogPhone")}</span>
                    <span className="font-bold text-foreground font-mono" dir="ltr">{confirmOrder?.phone}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/60">
                    <span className="text-muted-foreground text-sm">{t("index.dialogOperator")}</span>
                    <OperatorBadge operator={confirmOrder?.phone ?? ""} />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmOrder) void executeOrder(confirmOrder);
                }}
                disabled={busyId !== null}
                className="rounded-xl flex-1 h-12 text-base font-bold shadow-sm"
              >
                {t("customerOrders.actionConfirm")}
              </AlertDialogAction>
              <AlertDialogCancel className="rounded-xl h-12 text-base">{t("common.cancel")}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </AppLayout>
  );
};

function OrderCard({
  order,
  name,
  busy,
  onConfirm,
  onReject,
  onUndoReject,
  onReorder,
}: {
  order: CustomerOrder;
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onUndoReject: () => void;
  onReorder: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-border/60 animate-slide-up space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <OperatorBadge operator={order.phone} />
          <div className="min-w-0">
            {name && (
              <p className="text-sm font-bold text-foreground truncate" dir="auto">{name}</p>
            )}
            <p className="font-mono text-sm font-medium text-foreground tracking-wider truncate" dir="ltr">
              {order.phone}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("index.dialogAmount")}: {order.amount.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-bold text-foreground text-base leading-tight" dir="ltr">
            {order.price.toLocaleString()} {t("common.currencySymbol")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {formatDateTime(order.receivedAt)}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold leading-none flex items-center gap-1">
            <MonitorSmartphone className="w-3 h-3" />
            {t("customerOrders.sourceBadge")}
          </span>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Actions depend on status */}
      <div className="flex gap-2 pt-0.5">
        {order.status === "pending" && (
          <>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={busy}
              className="flex-1 h-9 rounded-xl text-xs font-bold shadow-sm"
            >
              {busy ? <LoaderCircle className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 me-1.5" />}
              {t("customerOrders.actionConfirm")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={busy}
              className="flex-1 h-9 rounded-xl text-xs font-semibold border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive/50"
            >
              <XCircle className="w-3.5 h-3.5 me-1.5" />
              {t("customerOrders.actionReject")}
            </Button>
          </>
        )}
        {order.status === "cancelled" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUndoReject}
            disabled={busy}
            className="flex-1 h-9 rounded-xl text-xs font-semibold border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
          >
            <Undo2 className="w-3.5 h-3.5 me-1.5" />
            {t("customerOrders.actionUndoReject")}
          </Button>
        )}
        {order.status === "executed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReorder}
            disabled={busy}
            className="flex-1 h-9 rounded-xl text-xs font-semibold border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
          >
            <RotateCcw className="w-3.5 h-3.5 me-1.5" />
            {t("customerOrders.actionReorder")}
          </Button>
        )}
      </div>
    </div>
  );
}

function OperatorBadge({ operator }: { operator: string }) {
  const { t } = useTranslation();
  const op = detectOperator(operator);
  if (!op) return null;
  const label = op === "mtn" ? t("operator.mtn") : t("operator.syriatel");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-sm shrink-0",
        op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white",
      )}
    >
      <Phone className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: CustomerOrderStatus }) {
  const { t } = useTranslation();
  if (status === "pending") {
    return (
      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full leading-none flex items-center gap-1">
        <LoaderCircle className="w-3 h-3" />
        {t("customerOrders.statusPending")}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="text-[10px] font-bold text-destructive flex items-center gap-1">
        <XCircle className="w-3.5 h-3.5" />
        {t("customerOrders.statusCancelled")}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-success flex items-center gap-1">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {t("customerOrders.statusExecuted")}
    </span>
  );
}

export default CustomerOrders;
