import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device-id";
import { getHistory } from "./transfer-history";

export type ReportPeriod = "day" | "week" | "month";

export interface ReportFilters {
  date_from?: string | null;
  date_to?: string | null;
  operator?: string | null;
  status?: string | null;
  user_id?: string | null;
  device_id?: string | null;
  trial_id?: string | null;
  license_id?: string | null;
  access_source?: string | null;
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
  license_id: string | null;
  trial_id: string | null;
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
  amount: number;
}

export interface TransferReport {
  ok: boolean;
  source: "server" | "offline";
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
  by_access: ReportDimension[];
  by_device: ReportDimension[];
  by_user: ReportDimension[];
  by_sync_status: ReportDimension[];
  reason?: string;
}

export async function fetchTransferReport(filters: ReportFilters): Promise<TransferReport> {
  if (navigator.onLine) {
    const { data, error } = await supabase.functions.invoke("reports", { body: filters });
    if (!error && data?.ok) return normalizeServerReport(data);
  }
  return buildOfflineReport(filters);
}

function normalizeServerReport(data: Record<string, unknown>): TransferReport {
  return {
    ok: true,
    source: "server",
    page: numberValue(data.page, 1),
    page_size: numberValue(data.page_size, 50),
    total: numberValue(data.total),
    amount_total: numberValue(data.amount_total),
    success_count: numberValue(data.success_count),
    failure_count: numberValue(data.failure_count),
    sync_total: numberValue(data.sync_total),
    sync_failed: numberValue(data.sync_failed),
    rows: Array.isArray(data.rows) ? data.rows.map(normalizeRow) : [],
    periods: Array.isArray(data.periods) ? data.periods.map((point) => ({
      period_start: String(point.period_start ?? ""),
      transfer_count: numberValue(point.transfer_count),
      success_count: numberValue(point.success_count),
      failure_count: numberValue(point.failure_count),
      amount_total: numberValue(point.amount_total),
    })) : [],
    by_operator: normalizeDimensions(data.by_operator),
    by_status: normalizeDimensions(data.by_status),
    by_access: normalizeDimensions(data.by_access),
    by_device: normalizeDimensions(data.by_device),
    by_user: normalizeDimensions(data.by_user),
    by_sync_status: normalizeDimensions(data.by_sync_status),
  };
}

function buildOfflineReport(filters: ReportFilters): TransferReport {
  const deviceId = getDeviceId();
  const dateFrom = filters.date_from ? new Date(filters.date_from).getTime() : null;
  const dateTo = filters.date_to ? new Date(filters.date_to).getTime() : null;
  const rows = getHistory()
    .map((record, index): ReportRow => ({
      id: `offline-${record.timestamp}-${index}`,
      client_id: null,
      device_id: deviceId,
      user_id: null,
      email: null,
      display_name: null,
      phone: record.phone,
      amount: Number(record.amount) || 0,
      operator: (record.operator || "unknown").toLowerCase(),
      status: record.status,
      created_at: new Date(record.timestamp).toISOString(),
      license_id: null,
      trial_id: null,
      access_source: "offline_cache",
    }))
    .filter((row) => {
      const timestamp = new Date(row.created_at).getTime();
      return (!dateFrom || timestamp >= dateFrom)
        && (!dateTo || timestamp < dateTo)
        && (!filters.operator || row.operator === filters.operator)
        && (!filters.status || row.status === filters.status)
        && (!filters.device_id || row.device_id === filters.device_id)
        && (!filters.access_source || row.access_source === filters.access_source);
    });

  const pageSize = Math.min(Math.max(filters.page_size || 50, 1), 100);
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
    by_access: groupDimension(rows, (row) => row.access_source),
    by_device: groupDimension(rows, (row) => row.device_id),
    by_user: [],
    by_sync_status: [],
    reason: "server_unavailable",
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
    const key = keyFor(row) || "unknown";
    const item = groups.get(key) ?? { key, count: 0, amount: 0 };
    item.count += 1;
    item.amount += row.amount;
    groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function normalizeDimensions(value: unknown): ReportDimension[] {
  return Array.isArray(value) ? value.map((item) => ({
    key: String(item.key ?? "unknown"),
    label: item.label ? String(item.label) : undefined,
    count: numberValue(item.count),
    amount: numberValue(item.amount),
  })) : [];
}

function normalizeRow(value: Record<string, unknown>): ReportRow {
  return {
    id: String(value.id ?? ""),
    client_id: value.client_id ? String(value.client_id) : null,
    device_id: String(value.device_id ?? ""),
    user_id: value.user_id ? String(value.user_id) : null,
    email: value.email ? String(value.email) : null,
    display_name: value.display_name ? String(value.display_name) : null,
    phone: String(value.phone ?? ""),
    amount: numberValue(value.amount),
    operator: String(value.operator ?? "unknown"),
    status: String(value.status ?? "unknown"),
    created_at: String(value.created_at ?? ""),
    license_id: value.license_id ? String(value.license_id) : null,
    trial_id: value.trial_id ? String(value.trial_id) : null,
    access_source: String(value.access_source ?? "none"),
  };
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
