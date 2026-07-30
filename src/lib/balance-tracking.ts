import type { Operator } from "./ussd-profiles";
import { getHistory } from "./transfer-history";

const BALANCE_STORAGE_KEY = "balance_tracking_v2";
const THRESHOLD_KEY = "low_balance_thresholds_v1";
const WARNING_SHOWN_KEY = "low_balance_warning_shown_v1";

export interface BalanceEntry {
  amount: number;
  timestamp: number;
}

export interface BalanceHistoryItem {
  timestamp: number;
  previousAmount: number;
  newAmount: number;
  change: number;
  reason: "inquiry" | "transfer";
}

export interface OperatorBalanceData {
  current: BalanceEntry | null;
  history: BalanceHistoryItem[];
}

export type BalanceStore = Record<Operator, OperatorBalanceData>;

export interface LowBalanceThresholds {
  mtn: number;
  syriatel: number;
}

const DEFAULT_THRESHOLDS: LowBalanceThresholds = {
  mtn: 2000,
  syriatel: 2000,
};

function getStore(): BalanceStore {
  try {
    const stored = localStorage.getItem(BALANCE_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as BalanceStore;
  } catch {}
  return { mtn: { current: null, history: [] }, syriatel: { current: null, history: [] } };
}

function saveStore(store: BalanceStore) {
  localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(store));
}

function migrateV1Balances(): void {
  const v1 = localStorage.getItem("saved_balances_v1");
  if (!v1) return;
  try {
    const old = JSON.parse(v1);
    const store = getStore();
    let changed = false;
    if (old.mtn?.amount != null && !store.mtn.current) {
      store.mtn.current = { amount: old.mtn.amount, timestamp: old.mtn.timestamp };
      changed = true;
    }
    if (old.syriatel?.amount != null && !store.syriatel.current) {
      store.syriatel.current = { amount: old.syriatel.amount, timestamp: old.syriatel.timestamp };
      changed = true;
    }
    if (changed) saveStore(store);
  } catch {}
}

migrateV1Balances();

export function getBalance(operator: Operator): BalanceEntry | null {
  return getStore()[operator].current;
}

export function getBalances(): BalanceStore {
  return getStore();
}

export function setBalance(operator: Operator, amount: number): void {
  const store = getStore();
  const prev = store[operator].current;
  store[operator].current = { amount, timestamp: Date.now() };
  store[operator].history.unshift({
    timestamp: Date.now(),
    previousAmount: prev?.amount ?? 0,
    newAmount: amount,
    change: amount - (prev?.amount ?? 0),
    reason: "inquiry",
  });
  store[operator].history = store[operator].history.slice(0, 50);
  saveStore(store);
}

export function getBalanceHistory(operator: Operator): BalanceHistoryItem[] {
  return getStore()[operator].history;
}

export function getEstimatedBalance(operator: Operator): number | null {
  const store = getStore();
  const current = store[operator].current;
  if (!current) return null;

  const transfers = getHistory().filter(
    (r) => r.operator === operator && r.status === "success" && r.timestamp > current.timestamp
  );

  const deducted = transfers.reduce((sum, r) => sum + Number(r.amount), 0);
  return Math.max(0, current.amount - deducted);
}

export function getEstimatedBalances(): { mtn: number | null; syriatel: number | null } {
  return {
    mtn: getEstimatedBalance("mtn"),
    syriatel: getEstimatedBalance("syriatel"),
  };
}

export function getLowBalanceThresholds(): LowBalanceThresholds {
  try {
    const stored = localStorage.getItem(THRESHOLD_KEY);
    if (stored) return JSON.parse(stored) as LowBalanceThresholds;
  } catch {}
  return DEFAULT_THRESHOLDS;
}

export function saveLowBalanceThresholds(thresholds: LowBalanceThresholds) {
  localStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
}

export function getTimeSince(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

function getWarningShown(): Record<Operator, boolean> {
  try {
    const stored = localStorage.getItem(WARNING_SHOWN_KEY);
    if (stored) return JSON.parse(stored) as Record<Operator, boolean>;
  } catch {}
  return { mtn: false, syriatel: false };
}

export function markWarningShown(operator: Operator): void {
  const shown = getWarningShown();
  shown[operator] = true;
  localStorage.setItem(WARNING_SHOWN_KEY, JSON.stringify(shown));
}

export function checkAndWarnLowBalance(operator: Operator, showToast: (msg: string) => void): void {
  const estimated = getEstimatedBalance(operator);
  if (estimated === null) return;
  const thresholds = getLowBalanceThresholds();
  if (estimated <= thresholds[operator]) {
    const shown = getWarningShown();
    if (!shown[operator]) {
      const name = operator === "mtn" ? "MTN" : "Syriatel";
      showToast(`⚠️ رصيد ${name} أوشك على الانتهاء، الرصيد الحالي: ${estimated.toLocaleString()} ل.س`);
      markWarningShown(operator);
    }
  }
}

export function resetWarningShown(): void {
  localStorage.removeItem(WARNING_SHOWN_KEY);
}

export function clearAllBalanceData(): void {
  localStorage.removeItem(BALANCE_STORAGE_KEY);
  localStorage.removeItem(THRESHOLD_KEY);
  localStorage.removeItem(WARNING_SHOWN_KEY);
  localStorage.removeItem("saved_balances_v1");
}
