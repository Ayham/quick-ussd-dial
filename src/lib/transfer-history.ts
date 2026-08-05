import { getPresets, type Operator } from './ussd-profiles';
import { getActualDeductedAmount } from './amount-utils';

export interface TransferRecord {
  phone: string;
  amount: string;
  price?: string;
  operator: string;
  timestamp: number;
  status: "success" | "failed" | "pending";
  transferType?: "phone" | "secret";
}

const HISTORY_KEY = "transfer-history";

export function getHistory(): TransferRecord[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function addToHistory(record: TransferRecord) {
  const history = getHistory();
  history.unshift(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
}

/**
 * Returns the selling price (in SYP) of a transfer record.
 * The selling price is what the customer pays; `amount` is the transfer
 * quantity (the SIM balance being moved). Reports and customer-facing displays
 * must always prefer `price` over `amount`. Falls back to the actual deducted
 * balance for records that predate the `price` field being persisted, so the
 * raw Syriatel quantity is never used.
 */
export function recordPrice(record: TransferRecord): number {
  if (record.price != null && record.price !== "") {
    const parsed = Number(record.price);
    if (Number.isFinite(parsed)) return parsed;
  }
  const amount = Number(record.amount);
  if (Number.isFinite(amount)) {
    try {
      const presets = getPresets();
      const op = record.operator as Operator;
      const match = presets[op]?.find(p => p.amount === amount);
      if (match) return match.price;
    } catch {}
  }
  return getActualDeductedAmount(record.operator, Number(record.amount)) || 0;
}


