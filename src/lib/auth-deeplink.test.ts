import { describe, expect, it } from "vitest";
import { isRaseedDeepLink } from "@/lib/auth";

describe("isRaseedDeepLink", () => {
  it("accepts the lowercase scheme used by browsers/Android normalization", () => {
    expect(isRaseedDeepLink("com.blueorbittechnologies.raseed://auth?code=abc")).toBe(true);
    expect(isRaseedDeepLink("com.blueorbittechnologies.raseed://auth")).toBe(true);
  });

  it("accepts the mixed-case scheme for backward compatibility", () => {
    expect(isRaseedDeepLink("com.BlueOrbitTechnologies.Raseed://auth?code=abc")).toBe(true);
  });

  it("rejects null, undefined and foreign schemes", () => {
    expect(isRaseedDeepLink(null)).toBe(false);
    expect(isRaseedDeepLink(undefined)).toBe(false);
    expect(isRaseedDeepLink("com.notallowed.example://auth")).toBe(false);
    expect(isRaseedDeepLink("https://example.com/auth")).toBe(false);
    expect(isRaseedDeepLink("")).toBe(false);
  });
});
