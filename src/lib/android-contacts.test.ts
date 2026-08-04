import { describe, expect, it } from "vitest";
import { normalizePhone } from "./android-contacts";

describe("normalizePhone", () => {
  it("keeps a plain local number unchanged", () => {
    expect(normalizePhone("0991234567")).toBe("0991234567");
  });

  it("strips separators", () => {
    expect(normalizePhone("099-123-4567")).toBe("0991234567");
    expect(normalizePhone("099 123 4567")).toBe("0991234567");
    expect(normalizePhone("(099) 123-4567")).toBe("0991234567");
  });

  it("normalizes the +963 country-code form to local format", () => {
    expect(normalizePhone("+963991234567")).toBe("0991234567");
    expect(normalizePhone("+963 99 123 4567")).toBe("0991234567");
  });

  it("normalizes the 963 country-code form to local format", () => {
    expect(normalizePhone("963991234567")).toBe("0991234567");
  });

  it("normalizes the 00963 country-code form to local format", () => {
    expect(normalizePhone("00963991234567")).toBe("0991234567");
  });

  it("adds a leading zero to a 9-digit local number", () => {
    expect(normalizePhone("991234567")).toBe("0991234567");
  });

  it("does not mangle short numbers", () => {
    expect(normalizePhone("911")).toBe("911");
  });

  it("does not mangle numbers starting with 963 but that are short/local", () => {
    expect(normalizePhone("96345")).toBe("96345");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("abc")).toBe("");
  });
});
