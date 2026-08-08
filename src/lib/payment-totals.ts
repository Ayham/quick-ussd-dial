export interface PaymentTotalsRow {
  currency: string;
  total: number;
  count: number;
}

export interface TotalInput {
  amount: number;
  currency?: string | null;
}

const VALID_CURRENCIES = ["SYP", "USD"] as const;
export const PAYMENT_CURRENCIES: readonly string[] = VALID_CURRENCIES;

const VALID_METHODS = ["sham_cash", "syriatel_cash", "mtn_cash", "cash"] as const;
export const PAYMENT_METHODS: readonly string[] = VALID_METHODS;

export function normalizeCurrency(currency: string | null | undefined): string {
  const c = (currency || "SYP").trim().toUpperCase();
  return VALID_CURRENCIES.includes(c as (typeof VALID_CURRENCIES)[number]) ? c : "SYP";
}

export function isKnownMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  return VALID_METHODS.includes(method.trim() as (typeof VALID_METHODS)[number]);
}

export function formatMethodKey(method: string | null | undefined): string {
  if (!isKnownMethod(method)) return "";
  const m = method as string;
  return `adminPayments.method${m[0].toUpperCase()}${m.slice(1)}`;
}

export function isValidPaymentAmount(amount: number | null | undefined): boolean {
  return amount !== null && amount !== undefined && Number.isFinite(amount) && amount > 0;
}

/**
 * Sum payments grouped per currency. NEVER mixes currencies.
 */
export function computePaymentTotals(input: TotalInput[]): PaymentTotalsRow[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const p of input) {
    const currency = normalizeCurrency(p.currency);
    const entry = map.get(currency) || { total: 0, count: 0 };
    entry.total += Number(p.amount) || 0;
    entry.count += 1;
    map.set(currency, entry);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({ currency, total: v.total, count: v.count }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatAmount(value: number): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
