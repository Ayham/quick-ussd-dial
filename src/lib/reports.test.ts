import { beforeEach, describe, expect, it } from "vitest";
import { buildDailyBreakdown, buildFinancialSummary, fetchTransferReport } from "./reports";

describe("offline reports", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("transfer-history", JSON.stringify([
      { phone: "0999000000", amount: "20", price: "25", operator: "mtn", timestamp: Date.UTC(2026, 6, 1), status: "success" },
      { phone: "0933000000", amount: "2019", price: "25", operator: "syriatel", timestamp: Date.UTC(2026, 6, 1), status: "failed" },
    ]));
  });

  it("builds filtered, paged summaries from the offline cache using the deducted balance", async () => {
    const report = await fetchTransferReport({
      operator: "mtn",
      period: "day",
      page: 1,
      page_size: 20,
    });

    expect(report.source).toBe("offline");
    expect(report.total).toBe(1);
    expect(report.amount_total).toBe(20);
    expect(report.success_count).toBe(1);
    expect(report.by_operator).toEqual([{ key: "mtn", count: 1, amount: 20 }]);
  });

  it("reports the actual deducted balance for Syriatel (amount / 100)", async () => {
    const report = await fetchTransferReport({
      operator: "syriatel",
      period: "day",
      page: 1,
      page_size: 20,
    });

    expect(report.source).toBe("offline");
    expect(report.total).toBe(1);
    expect(report.amount_total).toBe(20.19);
    expect(report.rows[0].amount).toBe(20.19);
    expect(report.by_operator).toEqual([{ key: "syriatel", count: 1, amount: 20.19 }]);
  });
});

describe("buildFinancialSummary", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("transfer-history", JSON.stringify([
      // Today (relative to fixed "now" below)
      { phone: "0999000000", amount: "10", price: "15", operator: "mtn", timestamp: new Date(2026, 6, 15, 9, 0).getTime(), status: "success" },
      // This week + last 10 days (Wed Jul 15 -> week starts Mon Jul 13)
      { phone: "0999000001", amount: "30", price: "40", operator: "mtn", timestamp: new Date(2026, 6, 14, 9, 0).getTime(), status: "success" },
      // This month only (before this week); Syriatel quantity = 2019 / 100 = 20.19
      { phone: "0933000000", amount: "2019", price: "3000", operator: "syriatel", timestamp: new Date(2026, 6, 2, 9, 0).getTime(), status: "failed" },
      // Older than the month bucket and outside last 10 days
      { phone: "0933000001", amount: "500", price: "600", operator: "syriatel", timestamp: new Date(2026, 5, 20, 9, 0).getTime(), status: "success" },
    ]));
  });

  it("buckets amounts per period with per-operator breakdown", () => {
    const now = new Date(2026, 6, 15, 12, 0); // Wed Jul 15 2026, local time
    const buckets = buildFinancialSummary(now);
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    expect(buckets.map((b) => b.key)).toEqual(["today", "week", "month", "all"]);

    const today = byKey.get("today")!;
    expect(today.count).toBe(1);
    expect(today.amount).toBe(15);
    expect(today.quantity).toBe(10);
    expect(today.distributor_fee).toBe(0);
    expect(today.by_operator).toEqual([{ key: "mtn", count: 1, amount: 15, quantity: 10, distributor_fee: 0 }]);

    const week = byKey.get("week")!;
    expect(week.count).toBe(2);
    expect(week.amount).toBe(55);
    expect(week.quantity).toBe(40);

    const month = byKey.get("month")!;
    expect(month.count).toBe(3);
    expect(month.amount).toBe(3055);
    expect(month.quantity).toBeCloseTo(60.19, 5);
    expect(month.distributor_fee).toBe(0);
    expect(month.by_operator).toEqual([
      { key: "mtn", count: 2, amount: 55, quantity: 40, distributor_fee: 0 },
      { key: "syriatel", count: 1, amount: 3000, quantity: 20.19, distributor_fee: 0 },
    ]);

    const all = byKey.get("all")!;
    expect(all.count).toBe(4);
    expect(all.amount).toBe(3655);
    expect(all.quantity).toBeCloseTo(65.19, 5);
    expect(all.success_count).toBe(3);
    expect(all.failure_count).toBe(1);
  });

  it("returns empty buckets when there is no history", () => {
    localStorage.clear();
    const buckets = buildFinancialSummary(new Date(2026, 6, 15, 12, 0));
    expect(buckets.map((b) => b.key)).toEqual(["today", "week", "month", "all"]);
    for (const bucket of buckets) {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
      expect(bucket.quantity).toBe(0);
      expect(bucket.by_operator).toEqual([]);
    }
  });
});

describe("buildFinancialSummary with distributor rate", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("distributor-rate-v1", "7"); // pay 1070 per 1000
    localStorage.setItem("transfer-history", JSON.stringify([
      { phone: "0999000000", amount: "1000", price: "1100", operator: "mtn", timestamp: new Date(2026, 6, 15, 9, 0).getTime(), status: "success" },
      { phone: "0933000000", amount: "2019", price: "3000", operator: "syriatel", timestamp: new Date(2026, 6, 15, 9, 30).getTime(), status: "success" },
    ]));
  });

  it("charges the distributor fee on the deducted quantity (7% default)", () => {
    const buckets = buildFinancialSummary(new Date(2026, 6, 15, 12, 0));
    const today = buckets.find((b) => b.key === "today")!;

    // quantity = 1000 + 20.19 = 1020.19 -> fee = 71.4133
    expect(today.quantity).toBeCloseTo(1020.19, 5);
    expect(today.distributor_fee).toBeCloseTo(71.4133, 4);

    const mtn = today.by_operator.find((d) => d.key === "mtn")!;
    const syriatel = today.by_operator.find((d) => d.key === "syriatel")!;
    expect(mtn.distributor_fee).toBeCloseTo(70, 5); // 1000 * 7%
    expect(syriatel.distributor_fee).toBeCloseTo(1.4133, 4); // 20.19 * 7%
  });

  it("falls back to a zero fee when no rate is set", () => {
    localStorage.setItem("distributor-rate-v1", "");
    const buckets = buildFinancialSummary(new Date(2026, 6, 15, 12, 0));
    for (const bucket of buckets) {
      expect(bucket.distributor_fee).toBe(0);
    }
  });
});

describe("buildDailyBreakdown", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("transfer-history", JSON.stringify([
      // Jul 15 (today)
      { phone: "0999000000", amount: "10", price: "15", operator: "mtn", timestamp: new Date(2026, 6, 15, 9, 0).getTime(), status: "success" },
      // Jul 14
      { phone: "0999000001", amount: "30", price: "40", operator: "mtn", timestamp: new Date(2026, 6, 14, 9, 0).getTime(), status: "success" },
      // Jul 10; Syriatel quantity = 2019 / 100 = 20.19
      { phone: "0933000000", amount: "2019", price: "3000", operator: "syriatel", timestamp: new Date(2026, 6, 10, 9, 0).getTime(), status: "success" },
      // Jul 1 -> outside the last-10-days window (window starts Jul 6 local midnight)
      { phone: "0933000001", amount: "500", price: "600", operator: "syriatel", timestamp: new Date(2026, 6, 1, 9, 0).getTime(), status: "success" },
    ]));
  });

  it("returns one row per calendar date, newest first, with per-operator detail", () => {
    const rows = buildDailyBreakdown(10, new Date(2026, 6, 15, 12, 0));
    expect(rows).toHaveLength(10);
    expect(rows[0].date).toBe(new Date(2026, 6, 15).toISOString());
    expect(rows[9].date).toBe(new Date(2026, 6, 6).toISOString());

    // Today
    expect(rows[0].count).toBe(1);
    expect(rows[0].amount).toBe(15);
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].distributor_fee).toBe(0);

    // Yesterday
    expect(rows[1].count).toBe(1);
    expect(rows[1].amount).toBe(40);

    // Empty day renders zeros
    expect(rows[2].count).toBe(0);
    expect(rows[2].amount).toBe(0);
    expect(rows[2].distributor_fee).toBe(0);

    // Jul 10 with Syriatel cost split
    expect(rows[5].date).toBe(new Date(2026, 6, 10).toISOString());
    expect(rows[5].count).toBe(1);
    expect(rows[5].amount).toBe(3000);
    expect(rows[5].quantity).toBeCloseTo(20.19, 5);
    expect(rows[5].by_operator).toEqual([{ key: "syriatel", count: 1, amount: 3000, quantity: 20.19, distributor_fee: 0 }]);

    // The Jul 1 record must be excluded from the window
    const totalSales = rows.reduce((s, r) => s + r.amount, 0);
    expect(totalSales).toBe(3055);
  });
});
