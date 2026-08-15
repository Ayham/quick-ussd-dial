import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function computeValidationPolicy(profile: {
  license_status?: string | null;
  trial_end?: string | null;
  expiry_date?: string | null;
  account_status?: string | null;
}) {
  const now = Date.now();
  const expiry = profile.license_status === "trial" ? profile.trial_end : profile.expiry_date;
  const expiryMs = expiry ? new Date(expiry).getTime() : null;
  const days = expiryMs === null ? null : Math.max(0, Math.floor((expiryMs - now) / (1000 * 60 * 60 * 24)));

  let intervalHours = 24;
  let policy: "normal" | "expiring_soon" | "force" = "normal";
  if (days !== null && days <= 45) {
    intervalHours = days > 7 ? 6 : 1;
    policy = "expiring_soon";
  }
  if (profile.license_status === "permanent") policy = "normal";

  const force = (profile.account_status === "suspended" || profile.account_status === "blocked")
    || (profile.license_status === "blocked" || profile.license_status === "revoked" || profile.license_status === "rejected" || profile.license_status === "suspended");
  if (force) policy = "force";

  // offline_grace_ms mirrors the ACTUAL remaining offline validity derived from
  // the real expiration date — never a flat grace that extends a license:
  //   • blocked/suspended/revoked/rejected/expired/pending/inactive → 0
  //   • permanent → effectively indefinite
  //   • active/trial with a date → remaining time until expiry_date/trial_end
  //   • undated non-permanent (malformed/legacy) → fallback refresh bound
  let offlineGraceMs: number;
  const hardBlocked = profile.account_status === "suspended" || profile.account_status === "blocked"
    || profile.license_status === "blocked" || profile.license_status === "revoked"
    || profile.license_status === "rejected" || profile.license_status === "expired"
    || profile.license_status === "pending" || profile.license_status === "inactive"
    || profile.license_status === "suspended";
  if (hardBlocked || (expiryMs !== null && expiryMs <= now)) {
    offlineGraceMs = 0;
  } else if (profile.license_status === "permanent") {
    offlineGraceMs = 3650 * 86400000;
  } else if (expiryMs === null) {
    offlineGraceMs = 7 * 86400000; // fallback for undated legacy profiles
  } else {
    offlineGraceMs = Math.max(0, expiryMs - now);
  }

  return {
    minimum_validation_interval_ms: intervalHours * 3600000,
    offline_grace_ms: offlineGraceMs,
    next_required_validation: new Date(now + intervalHours * 3600000).toISOString(),
    force_validation: force,
    license_expiration: expiryMs === null ? null : new Date(expiryMs).toISOString(),
    revoked: profile.license_status === "revoked",
    validation_policy: policy,
  };
}

function computeLicenseDecision(profile: {
  license_status?: string | null;
  account_status?: string | null;
  trial_end?: string | null;
  expiry_date?: string | null;
  license_type?: string | null;
}) {
  const now = Date.now();
  const accountStatus = profile.account_status || "active";
  const licenseStatus = profile.license_status || "inactive";
  const licenseType = profile.license_type || "trial";
  const trialEnd = profile.trial_end ? new Date(profile.trial_end).getTime() : null;
  const expiryDate = profile.expiry_date ? new Date(profile.expiry_date).getTime() : null;
  const isPermanent = licenseStatus === "permanent";
  const isTrial = licenseStatus === "trial";

  // Account status checks (highest priority)
  if (accountStatus === "suspended") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "account_suspended", reasonCode: "account_suspended", isLocked: true };
  }
  if (accountStatus === "blocked") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "account_blocked", reasonCode: "account_blocked", isLocked: true };
  }

  // License status checks
  if (licenseStatus === "trial") {
    if (trialEnd !== null && now >= trialEnd) {
      return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "trial_ended", reasonCode: "trial_ended", isLocked: false };
    }
    return { canOpenApp: true, canTransfer: true, requiresLogout: false, reason: "ok", reasonCode: "ok", isLocked: false };
  }

  if (licenseStatus === "active") {
    if (expiryDate !== null && now >= expiryDate) {
      return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "expired", reasonCode: "expired", isLocked: false };
    }
    return { canOpenApp: true, canTransfer: true, requiresLogout: false, reason: "ok", reasonCode: "ok", isLocked: false };
  }

  if (licenseStatus === "permanent") {
    return { canOpenApp: true, canTransfer: true, requiresLogout: false, reason: "ok", reasonCode: "ok", isLocked: false };
  }

  // These allow app access but block transfers
  if (licenseStatus === "expired") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "expired", reasonCode: "expired", isLocked: false };
  }
  if (licenseStatus === "rejected") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "activation_rejected", reasonCode: "activation_rejected", isLocked: false };
  }
  if (licenseStatus === "pending") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "activation_pending", reasonCode: "inactive", isLocked: false };
  }
  if (licenseStatus === "inactive") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "inactive", reasonCode: "inactive", isLocked: false };
  }
  if (licenseStatus === "revoked") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "license_revoked", reasonCode: "revoked", isLocked: false };
  }
  if (licenseStatus === "blocked") {
    return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "license_blocked", reasonCode: "license_blocked", isLocked: false };
  }
  if (licenseStatus === "suspended") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "suspended", reasonCode: "suspended", isLocked: true };
  }

  // Unknown status
  return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "unknown_status", reasonCode: "unknown_status", isLocked: false };
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type,x-client-info,apikey" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing authorization");

    const token = authHeader.replace("Bearer ", "");
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("user_id, email, display_name, license_status, license_type, trial_start, trial_end, expiry_date, account_status, current_device")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) throw new Error("profile_not_found");

    const now = new Date();
    const trialEnd = profile.trial_end ? new Date(profile.trial_end) : null;
    const expiryDate = profile.expiry_date ? new Date(profile.expiry_date) : null;
    const trialRemainingDays = profile.license_status === "trial" && trialEnd
      ? Math.max(0, Math.floor((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    // Compute license decision using centralized logic
    const decision = computeLicenseDecision(profile);
    const validationPolicy = computeValidationPolicy(profile);

    return new Response(JSON.stringify({
      valid: decision.canOpenApp, // true if user can open app
      user: {
        id: user.id,
        email: user.email,
        display_name: profile.display_name,
      },
      session: {
        exp: null, // Service role client doesn't have user session
        created_at: null,
      },
      license: {
        status: profile.license_status,
        type: profile.license_type,
        trial_start: profile.trial_start,
        trial_end: profile.trial_end,
        expiry_date: profile.expiry_date,
        trial_remaining_days: trialRemainingDays,
        is_locked: decision.isLocked, // true only for suspended/blocked/trial_ended/expired_active
        lock_reason: decision.reason,
        can_transfer: decision.canTransfer,
        can_open_app: decision.canOpenApp,
        requires_logout: decision.requiresLogout,
      },
      device: {
        current_device: profile.current_device,
      },
      validation_policy: validationPolicy,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: err instanceof Error ? err.message : "unknown" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  }
});