import { getHistory, recordPrice } from "./transfer-history";
import { getActualDeductedAmount } from "./amount-utils";
import { distributorFee, getDistributorRate } from "./distributor-rate";
import i18n from "@/lib/i18n";

export type ReportPeriod = "day" | "week" | "month";

export interface ReportFilters {
  date_from?: string | null;
  date_to?: string | null;
  operator?: string | null;
  status?: string | null;
  user_id?: string | null;
  period: ReportPeriod;
  page: number;
  page_size: number;
}

export interface ReportRow {
  id: string;
  client_id: string | null;
  device_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  phone: string;
  amount: number;
  operator: string;
  status: string;
  created_at: string;
  access_source: string;
}

export interface ReportPeriodPoint {
  period_start: string;
  transfer_count: number;
  success_count: number;
  failure_count: number;
  amount_total: number;
}

export interface ReportDimension {
  key: string;
  label?: string;
  count: number;
  /** Sales: what the customer paid (the `price` field). */
  amount: number;
  /** Cost: the real SIM balance deducted (Syriatel amount / 100). */
  quantity?: number;
  /** Extra cost paid to the distributor for this slice. */
  distributor_fee?: number;
}

export interface TransferReport {
  ok: boolean;
  source: "offline";
  page: number;
  page_size: number;
  total: number;
  amount_total: number;
  success_count: number;
  failure_count: number;
  sync_total: number;
  sync_failed: number;
  rows: ReportRow[];
  periods: ReportPeriodPoint[];
  by_operator: ReportDimension[];
  by_status: ReportDimension[];
  by_device: ReportDimension[];
  by_user: ReportDimension[];
  by_sync_status: ReportDimension[];
  reason?: string;
}

export type FinancialBucketKey = "today" | "week" | "month" | "all";

export interface FinancialBucket {
  key: FinancialBucketKey;
  count: number;
  /** Sales total (customer-paid prices). */
  amount: number;
  /** Cost total (real deducted balance, Syriatel / 100). */
  quantity: number;
  /** Extra cost paid to the distributor (quantity x profile rate). */
  distributor_fee: number;
  success_count: number;
  failure_count: number;
  by_operator: ReportDimension[];
}

export interface DailyBreakdownRow {
  /** Local midnight of the day, ISO encoded. */
  date: string;
  count: number;
  /** Sales total (customer-paid prices). */
  amount: number;
  /** Cost total (real deducted balance, Syriatel / 100). */
  quantity: number;
  /** Extra cost paid to the distributor (quantity x profile rate). */
  distributor_fee: number;
  by_operator: ReportDimension[];
}

/**
 * Builds the transfer report purely from the local offline cache
 * (localStorage transfer history). No network access is involved.
 */
export async function fetchTransferReport(filters: ReportFilters): Promise<TransferReport> {
  return buildOfflineReport(filters);
}

const FINANCIAL_KEYS: FinancialBucketKey[] = ["today", "week", "month", "all"];

function bucketStart(key: FinancialBucketKey, now: Date): number | null {
  if (key === "all") return null;
  if (key === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (key === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * Sales / quantity totals for today / this week / this month / all time,
 * each broken down per operator. Computed from the local cache only.
 *
 * - `amount`          = sales: what the customer paid (`price`, via recordPrice).
 * - `quantity`        = cost: the real SIM balance deducted (Syriatel amount / 100).
 * - `distributor_fee` = quantity x distributor rate from settings (0 when unset).
 * - real profit       = amount - quantity - distributor_fee.
 */
export function buildFinancialSummary(now: Date = new Date()): FinancialBucket[] {
  const rate = getDistributorRate();
  const starts = new Map(FINANCIAL_KEYS.map((k) => [k, bucketStart(k, now)] as const));
  const acc = new Map<string, FinancialBucket & { ops: Map<string, ReportDimension> }>(
    FINANCIAL_KEYS.map((k) => [k, {
      key: k,
      count: 0,
      amount: 0,
      quantity: 0,
      distributor_fee: 0,
      success_count: 0,
      failure_count: 0,
      by_operator: [],
      ops: new Map<string, ReportDimension>(),
    }] as const),
  );

  for (const record of getHistory()) {
    const sales = recordPrice(record);
    const quantity = getActualDeductedAmount(record.operator, Number(record.amount));
    const fee = distributorFee(quantity, rate);
    const op = (record.operator || "unknown").toLowerCase();
    const ok = ["success", "completed"].includes(record.status);
    for (const key of FINANCIAL_KEYS) {
      const start = starts.get(key)!;
      if (start != null && record.timestamp < start) continue;
      const bucket = acc.get(key)!;
      bucket.count += 1;
      bucket.amount += sales;
      bucket.quantity += quantity;
      bucket.distributor_fee += fee;
      if (ok) bucket.success_count += 1;
      else bucket.failure_count += 1;
      const dim = bucket.ops.get(op) ?? { key: op, count: 0, amount: 0, quantity: 0, distributor_fee: 0 };
      dim.count += 1;
      dim.amount += sales;
      dim.quantity = (dim.quantity ?? 0) + quantity;
      dim.distributor_fee = (dim.distributor_fee ?? 0) + fee;
      bucket.ops.set(op, dim);
    }
  }

  return FINANCIAL_KEYS.map((key) => {
    const { ops, ...bucket } = acc.get(key)!;
    return {
      ...bucket,
      by_operator: [...ops.values()].sort((a, b) => b.count - a.count),
    };
  });
}

/**
 * Per-calendar-day totals for the last `days` days (index 0 = today,
 * descending to the oldest day). Each day carries sales (`amount`,
 * customer-paid prices), cost (`quantity`, Syriatel / 100), the distributor
 * fee and a per-operator breakdown. Days with no transfers come back as
 * zeros. Built from the local cache only.
 */
export function buildDailyBreakdown(days = 10, now: Date = new Date()): DailyBreakdownRow[] {
  const rate = getDistributorRate();
  const rows = new Map<number, DailyBreakdownRow & { ops: Map<string, ReportDimension> }>();
  const order: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    order.push(d.getTime());
    rows.set(d.getTime(), {
      date: d.toISOString(),
      count: 0,
      amount: 0,
      quantity: 0,
      distributor_fee: 0,
      by_operator: [],
      ops: new Map<string, ReportDimension>(),
    });
  }

  const windowStart = order[order.length - 1];
  for (const record of getHistory()) {
    if (record.timestamp < windowStart) continue;
    const d = new Date(record.timestamp);
    const row = rows.get(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    if (!row) continue;
    const sales = recordPrice(record);
    const quantity = getActualDeductedAmount(record.operator, Number(record.amount));
    const fee = distributorFee(quantity, rate);
    const op = (record.operator || "unknown").toLowerCase();
    row.count += 1;
    row.amount += sales;
    row.quantity += quantity;
    row.distributor_fee += fee;
    const dim = row.ops.get(op) ?? { key: op, count: 0, amount: 0, quantity: 0, distributor_fee: 0 };
    dim.count += 1;
    dim.amount += sales;
    dim.quantity = (dim.quantity ?? 0) + quantity;
    dim.distributor_fee = (dim.distributor_fee ?? 0) + fee;
    row.ops.set(op, dim);
  }

  return order.map((ts) => {
    const { ops, ...rest } = rows.get(ts)!;
    return { ...rest, by_operator: [...ops.values()].sort((a, b) => b.count - a.count) };
  });
}

function buildOfflineReport(filters: ReportFilters): TransferReport {
  const dateFrom = filters.date_from ? new Date(filters.date_from).getTime() : null;
  const dateTo = filters.date_to ? new Date(filters.date_to).getTime() : null;
  const rows = getHistory()
    .map((record, index): ReportRow => ({
      id: `offline-${record.timestamp}-${index}`,
      client_id: null,
      device_id: "offline",
      user_id: null,
      email: null,
      display_name: null,
      phone: record.phone,
      amount: getActualDeductedAmount(record.operator, Number(record.amount)),
      operator: (record.operator || "unknown").toLowerCase(),
      status: record.status,
      created_at: new Date(record.timestamp).toISOString(),
      access_source: "offline_cache",
    }))
    .filter((row) => {
      const timestamp = new Date(row.created_at).getTime();
      return (!dateFrom || timestamp >= dateFrom)
        && (!dateTo || timestamp < dateTo)
        && (!filters.operator || row.operator === filters.operator)
        && (!filters.status || row.status === filters.status);
    });

  const pageSize = Math.min(Math.max(filters.page_size || 50, 1), 100_000);
  const page = Math.max(filters.page || 1, 1);
  const offset = (page - 1) * pageSize;
  const successful = rows.filter((row) => ["success", "completed"].includes(row.status));

  return {
    ok: true,
    source: "offline",
    page,
    page_size: pageSize,
    total: rows.length,
    amount_total: rows.reduce((sum, row) => sum + row.amount, 0),
    success_count: successful.length,
    failure_count: rows.length - successful.length,
    sync_total: 0,
    sync_failed: 0,
    rows: rows.slice(offset, offset + pageSize),
    periods: groupPeriods(rows, filters.period),
    by_operator: groupDimension(rows, (row) => row.operator),
    by_status: groupDimension(rows, (row) => row.status),
    by_device: groupDimension(rows, (row) => row.device_id),
    by_user: [],
    by_sync_status: [],
  };
}

function groupPeriods(rows: ReportRow[], period: ReportPeriod): ReportPeriodPoint[] {
  const groups = new Map<string, ReportPeriodPoint>();
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (period === "month") date.setUTCDate(1);
    if (period === "week") {
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
    }
    date.setUTCHours(0, 0, 0, 0);
    const key = date.toISOString();
    const point = groups.get(key) ?? {
      period_start: key,
      transfer_count: 0,
      success_count: 0,
      failure_count: 0,
      amount_total: 0,
    };
    point.transfer_count += 1;
    point.amount_total += row.amount;
    if (["success", "completed"].includes(row.status)) point.success_count += 1;
    else point.failure_count += 1;
    groups.set(key, point);
  }
  return [...groups.values()].sort((a, b) => a.period_start.localeCompare(b.period_start));
}

function groupDimension(rows: ReportRow[], keyFor: (row: ReportRow) => string): ReportDimension[] {
  const groups = new Map<string, ReportDimension>();
  for (const row of rows) {
    const key = keyFor(row) || i18n.t("report.unknownValue");
    const item = groups.get(key) ?? { key, count: 0, amount: 0 };
    item.count += 1;
    item.amount += row.amount;
    groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
