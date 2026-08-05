import { describe, expect, it, beforeEach } from "vitest";
import { getAmountDisplayStyle, saveAmountDisplayStyle } from "./amount-display";

describe("amount display style settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to grid", () => {
    expect(getAmountDisplayStyle()).toBe("grid");
  });

  it("persists the horizontal mode", () => {
    saveAmountDisplayStyle("horizontal");
    expect(getAmountDisplayStyle()).toBe("horizontal");
  });

  it("persists the grid mode", () => {
    saveAmountDisplayStyle("horizontal");
    saveAmountDisplayStyle("grid");
    expect(getAmountDisplayStyle()).toBe("grid");
  });

  it("falls back to grid for invalid stored values", () => {
    localStorage.setItem("amount-display-style", "bogus");
    expect(getAmountDisplayStyle()).toBe("grid");
  });
});
