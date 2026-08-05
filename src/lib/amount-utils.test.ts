import { describe, expect, it } from "vitest";
import { getActualDeductedAmount } from "./amount-utils";

describe("getActualDeductedAmount", () => {
  it("divides Syriatel amounts by 100", () => {
    expect(getActualDeductedAmount("syriatel", 2019)).toBe(20.19);
    expect(getActualDeductedAmount("syriatel", 2307)).toBe(23.07);
    expect(getActualDeductedAmount("syriatel", 72115)).toBe(721.15);
  });

  it("keeps MTN amounts unchanged", () => {
    expect(getActualDeductedAmount("mtn", 20)).toBe(20);
    expect(getActualDeductedAmount("mtn", 72115)).toBe(72115);
  });

  it("matches the operator case-insensitively", () => {
    expect(getActualDeductedAmount("SYRIATEL", 2019)).toBe(20.19);
    expect(getActualDeductedAmount("Syriatel", 2019)).toBe(20.19);
    expect(getActualDeductedAmount("MTN", 20)).toBe(20);
  });

  it("treats unknown or missing operators like MTN", () => {
    expect(getActualDeductedAmount("unknown", 2019)).toBe(2019);
    expect(getActualDeductedAmount(undefined, 20)).toBe(20);
    expect(getActualDeductedAmount(null, 20)).toBe(20);
  });
});
