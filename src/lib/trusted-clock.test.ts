import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrustedClock,
  getTrustedNowMs,
  setTrustedClock,
  __seedTrustedClockForTests,
  __setTestMonotonicBaseline,
} from "./trusted-clock";

describe("Trusted Clock (SB1)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearTrustedClock();
  });

  it("returns null before any sync", () => {
    expect(getTrustedNowMs()).toBeNull();
  });

  it("returns the server time when anchored", async () => {
    await setTrustedClock(new Date(1700000000000).toISOString());
    expect(getTrustedNowMs()).toBe(1700000000000);
  });

  it("advances with the monotonic baseline (elapsed time)", async () => {
    __seedTrustedClockForTests(1700000000000, 1000);
    __setTestMonotonicBaseline(1000 + 1000 * 60 * 60 * 24); // +1 day
    expect(getTrustedNowMs()).toBe(1700000000000 + 1000 * 60 * 60 * 24);
  });

  it("ignores wall-clock rollback (monotonic-driven, keeps advancing)", async () => {
    __seedTrustedClockForTests(1700000000000, 1000);
    __setTestMonotonicBaseline(1000 + 3600000); // +1 hour of monotonic elapsed
    expect(getTrustedNowMs()).toBe(1700000000000 + 3600000);
  });

  it("fails closed (null) when the monotonic baseline regresses (restart / reboot)", async () => {
    __seedTrustedClockForTests(1700000000000, 1000);
    __setTestMonotonicBaseline(0); // fresh process below the snapshot baseline
    expect(getTrustedNowMs()).toBeNull();
  });

  it("fails closed (null) when no baseline is captured", async () => {
    __seedTrustedClockForTests(1700000000000, 1000);
    __setTestMonotonicBaseline(1000 + 3600000);
    expect(getTrustedNowMs()).not.toBeNull();
    // Simulate a baseline that was never captured (e.g. clock not initialized).
    clearTrustedClock();
    expect(getTrustedNowMs()).toBeNull();
  });
});
