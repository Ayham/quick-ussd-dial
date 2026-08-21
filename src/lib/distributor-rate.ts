const RATE_KEY = "distributor-rate-v1";

/**
 * Distributor rate (%) for the signed-in shop, e.g. 7 means the shop pays
 * 1070 for every 1000 of transferred balance. Mirrored locally so offline
 * reports can price the distributor fee without network access. The synced
 * source of truth is profiles.distributor_rate.
 */
export function getDistributorRate(): number {
  try {
    const parsed = Number(localStorage.getItem(RATE_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveDistributorRate(rate: number | null | undefined) {
  try {
    const value = Number(rate);
    localStorage.setItem(RATE_KEY, Number.isFinite(value) && value > 0 ? String(value) : "0");
  } catch {}
}

/** Distributor fee (SYP) owed on top of a transferred balance quantity. */
export function distributorFee(quantity: number, rate = getDistributorRate()): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(rate) || rate <= 0) return 0;
  return (quantity * rate) / 100;
}
