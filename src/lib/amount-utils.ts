import type { Operator } from "./ussd-profiles";

/**
 * Returns the real balance that gets deducted from the SIM for a transfer.
 *
 * Syriatel stores its USSD transfer quantity as `amount` in units of 1/100
 * (e.g. `{ amount: 2019 }` represents 20.19 SYP), so the actual deducted
 * balance is `amount / 100`. All other operators use the raw `amount` as the
 * deducted balance.
 *
 * Every balance deduction and report calculation must go through this helper
 * so Syriatel never uses the raw transfer quantity.
 */
export function getActualDeductedAmount(
  operator: string | Operator | null | undefined,
  amount: number,
): number {
  if ((operator || "").toLowerCase() === "syriatel") {
    return amount / 100;
  }
  return amount;
}
