import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion, isValidVersion, parseVersion } from "./version";

describe("parseVersion", () => {
  it("parses full semver", () => {
    expect(parseVersion("1.0.7")).toEqual({ major: 1, minor: 0, patch: 7, prerelease: [] });
  });

  it("parses missing segments as zero", () => {
    expect(parseVersion("1.0")).toEqual({ major: 1, minor: 0, patch: 0, prerelease: [] });
    expect(parseVersion("1")).toEqual({ major: 1, minor: 0, patch: 0, prerelease: [] });
  });

  it("accepts a leading v prefix and surrounding whitespace", () => {
    expect(parseVersion("  v1.2.3 ")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it("parses prerelease identifiers", () => {
    expect(parseVersion("1.0.7-beta")).toEqual({ major: 1, minor: 0, patch: 7, prerelease: ["beta"] });
    expect(parseVersion("1.0.7-beta.2")).toEqual({ major: 1, minor: 0, patch: 7, prerelease: ["beta", "2"] });
  });

  it("rejects invalid versions", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion("1.2.3.4")).toBeNull();
    expect(parseVersion("1..2")).toBeNull();
    expect(parseVersion("1.2.3-")).toBeNull();
  });

  it("isValidVersion mirrors parseVersion", () => {
    expect(isValidVersion("1.0.6")).toBe(true);
    expect(isValidVersion("v1.0.6")).toBe(true);
    expect(isValidVersion("garbage")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("treats equal versions as equal", () => {
    expect(compareVersions("1.0.6", "1.0.6")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("v1.0.6", "1.0.6")).toBe(0);
  });

  it("detects newer versions", () => {
    expect(compareVersions("1.0.7", "1.0.6")).toBe(1);
    expect(compareVersions("1.1.0", "1.0.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
  });

  it("detects older versions", () => {
    expect(compareVersions("1.0.5", "1.0.6")).toBe(-1);
    expect(compareVersions("1.0.9", "1.1.0")).toBe(-1);
    expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
  });

  it("handles missing segments numerically", () => {
    expect(compareVersions("1.0.5", "1.0")).toBe(1);
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  it("treats invalid versions as older than any valid version", () => {
    expect(compareVersions("", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "abc")).toBe(1);
    expect(compareVersions("abc", "def")).toBe(0);
  });

  it("never treats a prerelease as a stable release", () => {
    expect(compareVersions("1.0.7-beta", "1.0.7")).toBe(-1);
    expect(compareVersions("1.0.7", "1.0.7-beta")).toBe(1);
    expect(compareVersions("1.0.7-beta", "1.0.6")).toBe(1);
    expect(compareVersions("1.0.7-alpha", "1.0.7-beta")).toBe(-1);
    expect(compareVersions("1.0.7-beta.1", "1.0.7-beta")).toBe(1);
    expect(compareVersions("1.0.7-rc.1", "1.0.7")).toBe(-1);
  });
});

describe("isNewerVersion", () => {
  it("returns true only when remote is strictly newer", () => {
    expect(isNewerVersion("1.0.7", "1.0.6")).toBe(true);
    expect(isNewerVersion("1.0.6", "1.0.6")).toBe(false);
    expect(isNewerVersion("1.0.5", "1.0.6")).toBe(false);
    expect(isNewerVersion("1.0.7-beta", "1.0.6")).toBe(true);
    expect(isNewerVersion("1.0.7-beta", "1.0.7")).toBe(false);
    expect(isNewerVersion(null, "1.0.6")).toBe(false);
    expect(isNewerVersion("garbage", "1.0.6")).toBe(false);
  });
});
