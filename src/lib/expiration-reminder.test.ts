import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExpirationReminderPlan,
  resolveReminderConfig,
  syncExpirationReminder,
  type ExpirationReminderConfig,
} from "./expiration-reminder";
import type { ValidationPolicy, ValidationResult } from "./license-cache";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

const DAY = 1000 * 60 * 60 * 24;
// Relative to the real clock so the suite never depends on a fixed date
// (the reminder window compares against Date.now()).
const NOW = Date.now();

const config: ExpirationReminderConfig = {
  remindDaysLicense: 7,
  remindDaysTrial: 3,
};

function data(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: true,
    license_status: "active",
    account_status: "active",
    ...overrides,
  };
}

function policy(overrides: Partial<ValidationPolicy> = {}): ValidationPolicy {
  return {
    valid: true,
    minimum_validation_interval_ms: 24 * 3600000,
    offline_grace_ms: 7 * DAY,
    next_required_validation: null,
    force_validation: false,
    license_expiration: null,
    revoked: false,
    validation_policy: "normal",
    ...overrides,
  };
}

describe("getExpirationReminderPlan", () => {
  it("returns null for a permanent license", () => {
    expect(getExpirationReminderPlan(data({ license_status: "permanent" }), config, NOW)).toBeNull();
  });

  it("returns null when there is no data", () => {
    expect(getExpirationReminderPlan(null, config, NOW)).toBeNull();
  });

  it("plans a paid-license reminder inside the license window", () => {
    const plan = getExpirationReminderPlan(
      data({ license_status: "active", expiry_date: new Date(NOW + 5 * DAY).toISOString() }),
      config,
      NOW,
    );
    expect(plan).not.toBeNull();
    expect(plan?.type).toBe("license_expiring");
    expect(plan?.daysLeft).toBe(5);
    expect(plan?.dedupeKey).toMatch(/^license:/);
  });

  it("plans a trial reminder inside the trial window", () => {
    const plan = getExpirationReminderPlan(
      data({ license_status: "trial", trial_end: new Date(NOW + 2 * DAY).toISOString() }),
      config,
      NOW,
    );
    expect(plan).not.toBeNull();
    expect(plan?.type).toBe("trial_ending");
    expect(plan?.daysLeft).toBe(2);
    expect(plan?.dedupeKey).toMatch(/^trial:/);
  });

  it("returns null when the license is not expiring soon enough", () => {
    expect(
      getExpirationReminderPlan(
        data({ license_status: "active", expiry_date: new Date(NOW + 30 * DAY).toISOString() }),
        config,
        NOW,
      ),
    ).toBeNull();
  });

  it("returns null when the trial is not expiring soon enough", () => {
    expect(
      getExpirationReminderPlan(
        data({ license_status: "trial", trial_end: new Date(NOW + 10 * DAY).toISOString() }),
        config,
        NOW,
      ),
    ).toBeNull();
  });

  it("returns null for an already-expired license", () => {
    expect(
      getExpirationReminderPlan(
        data({ license_status: "active", expiry_date: new Date(NOW - DAY).toISOString() }),
        config,
        NOW,
      ),
    ).toBeNull();
  });

  it("returns null for non-active paid statuses", () => {
    expect(
      getExpirationReminderPlan(
        data({ license_status: "revoked", expiry_date: new Date(NOW + 5 * DAY).toISOString() }),
        config,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("resolveReminderConfig", () => {
  it("uses server-provided windows when present", () => {
    const cfg = resolveReminderConfig(policy({ remind_days_license: 14, remind_days_trial: 5 }));
    expect(cfg.remindDaysLicense).toBe(14);
    expect(cfg.remindDaysTrial).toBe(5);
  });

  it("falls back to defaults when the server provides none", () => {
    const cfg = resolveReminderConfig(policy());
    expect(cfg.remindDaysLicense).toBe(7);
    expect(cfg.remindDaysTrial).toBe(3);
  });
});

describe("syncExpirationReminder", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.rpc.mockReset();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("calls the deduplicated server RPC exactly once per boundary", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const d = data({ license_status: "active", expiry_date: new Date(NOW + 5 * DAY).toISOString() });

    await syncExpirationReminder(d, policy());
    await syncExpirationReminder(d, policy());

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_license_expiration_reminders");
  });

  it("does not call the RPC when no reminder is due", async () => {
    await syncExpirationReminder(data({ license_status: "permanent" }), policy());
    await syncExpirationReminder(null, policy());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("skips silently when offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await syncExpirationReminder(
      data({ license_status: "active", expiry_date: new Date(NOW + 5 * DAY).toISOString() }),
      policy(),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
