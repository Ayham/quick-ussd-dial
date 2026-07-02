import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTransferReport } from "./reports";

vi.mock("./device-id", () => ({ getDeviceId: () => "device-1" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("offline reports", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    localStorage.setItem("transfer-history", JSON.stringify([
      { phone: "0999000000", amount: "1000", operator: "mtn", timestamp: Date.UTC(2026, 6, 1), status: "success" },
      { phone: "0933000000", amount: "2000", operator: "syriatel", timestamp: Date.UTC(2026, 6, 1), status: "failed" },
    ]));
  });

  it("builds filtered, paged summaries from the offline cache", async () => {
    const report = await fetchTransferReport({
      operator: "mtn",
      period: "day",
      page: 1,
      page_size: 20,
    });

    expect(report.source).toBe("offline");
    expect(report.total).toBe(1);
    expect(report.amount_total).toBe(1000);
    expect(report.success_count).toBe(1);
    expect(report.by_operator).toEqual([{ key: "mtn", count: 1, amount: 1000 }]);
  });
});
