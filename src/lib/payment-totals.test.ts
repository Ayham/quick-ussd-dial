import { describe, it, expect } from "vitest";
import {
  computePaymentTotals,
  normalizeCurrency,
  isValidPaymentAmount,
  isKnownMethod,
  PAYMENT_CURRENCIES,
  PAYMENT_METHODS,
} from "./payment-totals";

describe("computePaymentTotals", () => {
  it("never mixes currencies - SYP and USD stay separate", () => {
    const result = computePaymentTotals([
      { amount: 100000, currency: "SYP" },
      { amount: 50000, currency: "SYP" },
      { amount: 25, currency: "USD" },
    ]);
    expect(result).toEqual([
      { currency: "SYP", total: 150000, count: 2 },
      { currency: "USD", total: 25, count: 1 },
    ]);
  });

  it("sums only SYP when all payments are SYP", () => {
    const result = computePaymentTotals([
      { amount: 100000, currency: "SYP" },
      { amount: 200000, currency: "SYP" },
    ]);
    expect(result).toEqual([{ currency: "SYP", total: 300000, count: 2 }]);
  });

  it("sums only USD when all payments are USD", () => {
    const result = computePaymentTotals([{ amount: 50, currency: "USD" }]);
    expect(result).toEqual([{ currency: "USD", total: 50, count: 1 }]);
  });

  it("handles empty input", () => {
    expect(computePaymentTotals([])).toEqual([]);
  });

  it("normalizes lowercase and missing currencies to SYP", () => {
    const result = computePaymentTotals([
      { amount: 10, currency: "syp" },
      { amount: 20, currency: null },
      { amount: 30, currency: undefined },
    ]);
    expect(result).toEqual([{ currency: "SYP", total: 60, count: 3 }]);
  });

  it("orders currencies alphabetically", () => {
    const result = computePaymentTotals([
      { amount: 1, currency: "USD" },
      { amount: 2, currency: "SYP" },
    ]);
    expect(result.map((r) => r.currency)).toEqual(["SYP", "USD"]);
  });
});

describe("normalizeCurrency", () => {
  it("accepts SYP and USD only", () => {
    expect(normalizeCurrency("SYP")).toBe("SYP");
    expect(normalizeCurrency("USD")).toBe("USD");
    expect(normalizeCurrency("EUR")).toBe("SYP");
    expect(normalizeCurrency(null)).toBe("SYP");
    expect(normalizeCurrency("")).toBe("SYP");
  });
});

describe("isValidPaymentAmount", () => {
  it("rejects zero, negative, null and non-numbers", () => {
    expect(isValidPaymentAmount(0)).toBe(false);
    expect(isValidPaymentAmount(-5)).toBe(false);
    expect(isValidPaymentAmount(null)).toBe(false);
    expect(isValidPaymentAmount(undefined)).toBe(false);
    expect(isValidPaymentAmount(Number.NaN)).toBe(false);
  });
  it("accepts positive numbers", () => {
    expect(isValidPaymentAmount(1)).toBe(true);
    expect(isValidPaymentAmount(0.5)).toBe(true);
    expect(isValidPaymentAmount(100000)).toBe(true);
  });
});

describe("constants", () => {
  it("exposes SYP and USD currencies", () => {
    expect(PAYMENT_CURRENCIES).toEqual(["SYP", "USD"]);
  });
  it("exposes the four payment methods", () => {
    expect(PAYMENT_METHODS).toEqual(["sham_cash", "syriatel_cash", "mtn_cash", "cash"]);
  });
  it("isKnownMethod matches the four methods", () => {
    expect(isKnownMethod("sham_cash")).toBe(true);
    expect(isKnownMethod("syriatel_cash")).toBe(true);
    expect(isKnownMethod("mtn_cash")).toBe(true);
    expect(isKnownMethod("cash")).toBe(true);
    expect(isKnownMethod("visa")).toBe(false);
    expect(isKnownMethod(null)).toBe(false);
  });
});
