import { beforeEach, describe, expect, it } from "vitest";
import { getEstimatedBalance } from "./balance-tracking";

function seedBalance(operator: "mtn" | "syriatel", amount: number, timestamp = 1000) {
  const store = {
    mtn: { current: { amount: 1000, timestamp: 1000 }, history: [] as unknown[] },
    syriatel: { current: { amount: 1000, timestamp: 1000 }, history: [] as unknown[] },
  };
  store[operator].current = { amount, timestamp };
  localStorage.setItem("balance_tracking_v2", JSON.stringify(store));
}

function seedHistory(records: unknown[]) {
  localStorage.setItem("transfer-history", JSON.stringify(records));
}

describe("getEstimatedBalance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("deducts the actual Syriatel balance (amount / 100), not the raw amount", () => {
    seedBalance("syriatel", 1000, 1000);
    seedHistory([
      { phone: "0933000000", amount: "2019", operator: "syriatel", timestamp: 2000, status: "success" },
      { phone: "0933000001", amount: "2307", operator: "syriatel", timestamp: 3000, status: "success" },
    ]);

    expect(getEstimatedBalance("syriatel")).toBe(1000 - (20.19 + 23.07));
  });

  it("keeps MTN deduction unchanged (raw amount)", () => {
    seedBalance("mtn", 1000, 1000);
    seedHistory([
      { phone: "0999000000", amount: "20", operator: "mtn", timestamp: 2000, status: "success" },
    ]);

    expect(getEstimatedBalance("mtn")).toBe(980);
  });

  it("ignores failed and pending transfers", () => {
    seedBalance("syriatel", 1000, 1000);
    seedHistory([
      { phone: "0933000000", amount: "2019", operator: "syriatel", timestamp: 2000, status: "failed" },
    ]);

    expect(getEstimatedBalance("syriatel")).toBe(1000);
  });
});
