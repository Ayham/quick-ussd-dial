import { describe, expect, it } from "vitest";
import {
  computeLicenseDecision,
  type DecisionInput,
} from "./license-decision";

// Reference: the mandatory Access Matrix (§1-57 task):
//   Login✅/App✅/Transfer✅ : trial valid, active valid, permanent
//   Login✅/App✅/Transfer❌ : expired, rejected, pending, inactive, revoked, license_status='blocked'
//   Login❌/App❌/Transfer❌ : account_status suspended/blocked, license_status='suspended'
// "Login" here maps to `requiresLogout` (session must be cleared) on the client.

const AUTH = { authenticated: true, userId: "u1" };

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    license_status: "active",
    account_status: "active",
    trial_end: null,
    expiry_date: new Date(Date.now() + 86400000 * 60).toISOString(),
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

describe("computeLicenseDecision — Acceptance Matrix", () => {
  it("trial active → Login✅ / App✅ / Transfer✅", () => {
    const d = computeLicenseDecision(AUTH, input({
      license_status: "trial",
      trial_end: daysFromNow(10),
      expiry_date: null,
    }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(true);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBeNull();
  });

  it("active license valid → Login✅ / App✅ / Transfer✅", () => {
    const d = computeLicenseDecision(AUTH, input({
      license_status: "active",
      expiry_date: daysFromNow(30),
    }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(true);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBeNull();
  });

  it("permanent license → Login✅ / App✅ / Transfer✅ and daysRemaining null", () => {
    const d = computeLicenseDecision(AUTH, input({
      license_status: "permanent",
      expiry_date: null,
      trial_end: null,
    }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(true);
    expect(d.requiresLogout).toBe(false);
    expect(d.daysRemaining).toBeNull();
  });

  it("expired license → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "expired" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("expired");
  });

  it("active license past its expiry_date → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({
      license_status: "active",
      expiry_date: daysFromNow(-1),
    }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("expired");
  });

  it("trial ended (past trial_end) → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({
      license_status: "trial",
      trial_end: daysFromNow(-1),
      expiry_date: null,
    }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("trial_ended");
  });

  it("rejected → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "rejected" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("activation_rejected");
  });

  it("pending → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "pending" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("inactive");
  });

  it("inactive → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "inactive" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("inactive");
  });

  it("revoked → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "revoked" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("revoked");
  });

  it("license blocked → Login✅ / App✅ / Transfer❌", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "blocked" }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("license_blocked");
  });

  it("account suspended → Login❌ / App❌ / Transfer❌ (requiresLogout)", () => {
    const d = computeLicenseDecision(AUTH, input({ account_status: "suspended" }));
    expect(d.canOpenApp).toBe(false);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(true);
    expect(d.reasonCode).toBe("suspended");
  });

  it("account blocked → Login❌ / App❌ / Transfer❌ (requiresLogout)", () => {
    const d = computeLicenseDecision(AUTH, input({ account_status: "blocked" }));
    expect(d.canOpenApp).toBe(false);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(true);
    expect(d.reasonCode).toBe("blocked");
  });

  it("license suspended → Login❌ / App❌ / Transfer❌ (requiresLogout)", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "suspended" }));
    expect(d.canOpenApp).toBe(false);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(true);
    expect(d.reasonCode).toBe("suspended");
  });
});

describe("computeLicenseDecision — priority & edge handling", () => {
  it("account suspension wins over a revoked policy flag (never masked)", () => {
    const d = computeLicenseDecision(AUTH, input({ account_status: "suspended" }), { revoked: true });
    expect(d.canOpenApp).toBe(false);
    expect(d.requiresLogout).toBe(true);
    expect(d.reasonCode).toBe("suspended");
  });

  it("account block wins over a revoked policy flag (never masked)", () => {
    const d = computeLicenseDecision(AUTH, input({ account_status: "blocked" }), { revoked: true });
    expect(d.canOpenApp).toBe(false);
    expect(d.requiresLogout).toBe(true);
    expect(d.reasonCode).toBe("blocked");
  });

  it("license suspended wins over a revoked policy flag", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "suspended" }), { revoked: true });
    expect(d.canOpenApp).toBe(false);
    expect(d.requiresLogout).toBe(true);
  });

  it("revoked policy flag blocks transfers while the cached license looks active", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "active" }), { revoked: true });
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("revoked");
  });

  it("null data → unverified, app blocked without logout", () => {
    const d = computeLicenseDecision(AUTH, null);
    expect(d.canOpenApp).toBe(false);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("unverified");
  });

  it("unknown license status → app usable, transfers blocked (unknown_status)", () => {
    const d = computeLicenseDecision(AUTH, input({ license_status: "weird_value" as never }));
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("unknown_status");
  });

  it("null/missing license status falls back to inactive (not logged out)", () => {
    const d = computeLicenseDecision(AUTH, { account_status: "active", trial_end: null, expiry_date: null, license_status: undefined });
    expect(d.canOpenApp).toBe(true);
    expect(d.canTransfer).toBe(false);
    expect(d.requiresLogout).toBe(false);
    expect(d.reasonCode).toBe("inactive");
  });

  it("reports daysRemaining for dated licenses, null for permanent", () => {
    // Deterministic: anchor both the dates and the decision to the same fixed
    // "now" so Date.now() advancing mid-test can never round a boundary down.
    const nowMs = Date.now();
    const dated = (days: number) => new Date(nowMs + days * 86400000).toISOString();
    const d1 = computeLicenseDecision(AUTH, input({ license_status: "active", expiry_date: dated(3) }), { now: nowMs });
    expect(d1.daysRemaining).toBe(3);
    const d2 = computeLicenseDecision(AUTH, input({ license_status: "permanent", expiry_date: null }), { now: nowMs });
    expect(d2.daysRemaining).toBeNull();
    const d3 = computeLicenseDecision(AUTH, input({ license_status: "trial", trial_end: dated(2), expiry_date: null }), { now: nowMs });
    expect(d3.daysRemaining).toBe(2);
  });
});
