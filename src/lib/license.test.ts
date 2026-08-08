import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { calculateExpiryDate, formatLicenseTypeLabel } from "./license";

describe("calculateExpiryDate", () => {
  beforeEach(() => {
    const fixedDate = new Date("2026-08-07T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for lifetime", () => {
    expect(calculateExpiryDate("lifetime")).toBeNull();
  });

  it("returns null for custom_date when no date provided", () => {
    expect(calculateExpiryDate("custom_date")).toBeNull();
  });

  it("uses provided custom date for custom_date", () => {
    const result = calculateExpiryDate("custom_date", "2028-12-31");
    expect(result).toBe("2028-12-31");
  });

  it("calculates year_1 as activation_date + 1 year", () => {
    const result = calculateExpiryDate("year_1");
    expect(result).toBe("2027-08-07");
  });

  it("calculates year_2 as activation_date + 2 years", () => {
    const result = calculateExpiryDate("year_2");
    expect(result).toBe("2028-08-07");
  });

  it("calculates year_3 as activation_date + 3 years", () => {
    const result = calculateExpiryDate("year_3");
    expect(result).toBe("2029-08-07");
  });
});

describe("formatLicenseTypeLabel", () => {
  const mockT = (key: string) => key;

  it("maps trial type correctly", () => {
    expect(formatLicenseTypeLabel("trial", mockT)).toBe("activation.trialType");
  });

  it("maps year_1 type correctly", () => {
    expect(formatLicenseTypeLabel("year_1", mockT)).toBe("activation.year1");
  });

  it("maps year_2 type correctly", () => {
    expect(formatLicenseTypeLabel("year_2", mockT)).toBe("activation.year2");
  });

  it("maps year_3 type correctly", () => {
    expect(formatLicenseTypeLabel("year_3", mockT)).toBe("activation.year3");
  });

  it("maps custom_date type correctly", () => {
    expect(formatLicenseTypeLabel("custom_date", mockT)).toBe("activation.customDate");
  });

  it("maps lifetime type correctly", () => {
    expect(formatLicenseTypeLabel("lifetime", mockT)).toBe("activation.lifetime");
  });

  it("returns the raw type for unknown types", () => {
    expect(formatLicenseTypeLabel("unknown" as any, mockT)).toBe("unknown");
  });
});
