import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { canonicalBlob, signBlob } from "../_shared/signing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Profile = {
  user_id: string;
  license_status?: string | null;
  license_type?: string | null;
  trial_end?: string | null;
  expiry_date?: string | null;
  account_status?: string | null;
  current_device?: string | null;
};

// Server-controlled offline validation policy. The client reads this and never
// hardcodes cadence / grace / force requirements.
function computeValidationPolicy(profile: Profile) {
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
    offlineGraceMs = 7 * 86400000;
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

function computeLicenseDecision(profile: Profile) {
  const now = Date.now();
  const accountStatus = profile.account_status || "active";
  const licenseStatus = profile.license_status || "inactive";
  const trialEnd = profile.trial_end ? new Date(profile.trial_end).getTime() : null;
  const expiryDate = profile.expiry_date ? new Date(profile.expiry_date).getTime() : null;

  if (accountStatus === "suspended") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "account_suspended", reasonCode: "account_suspended", isLocked: true };
  }
  if (accountStatus === "blocked") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "account_blocked", reasonCode: "account_blocked", isLocked: true };
  }
  if (licenseStatus === "suspended") {
    return { canOpenApp: false, canTransfer: false, requiresLogout: true, reason: "suspended", reasonCode: "suspended", isLocked: true };
  }
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
  return { canOpenApp: true, canTransfer: false, requiresLogout: false, reason: "unknown_status", reasonCode: "unknown_status", isLocked: false };
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type,x-client-info,apikey" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing authorization");
    const token = authHeader.replace("Bearer ", "");

    const body = await req.json().catch(() => ({})) as { device_id?: string };
    const deviceId = body.device_id ?? null;

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    // Rate limit: 10 validations per minute per user
    const { data: rateOk } = await serviceClient.rpc("check_rate_limit", { _key: `validate_license:${user.id}`, _window_seconds: 60, _max_requests: 10 });
    if (!rateOk) throw new Error("rate_limited");

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("user_id, license_status, license_type, trial_start, trial_end, expiry_date, account_status, current_device")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) throw new Error("profile_not_found");

    // Device-level checks (server-authoritative, mirrors validate_device_session).
    let deviceBanned = false;
    if (profile.current_device) {
      const { data: deviceRow } = await serviceClient
        .from("devices")
        .select("is_blocked, is_banned, lifecycle_state")
        .eq("device_id", profile.current_device)
        .maybeSingle();
      deviceBanned = Boolean(deviceRow && (deviceRow.is_blocked || deviceRow.is_banned || deviceRow.lifecycle_state === "blocked"));
    }
    const deviceMismatch = Boolean(deviceId && profile.current_device && profile.current_device !== deviceId);

    const base = computeLicenseDecision(profile);
    let decision = base;
    if (deviceBanned) {
      decision = { ...base, canOpenApp: false, canTransfer: false, requiresLogout: false, reason: "device_banned", reasonCode: "device_banned", isLocked: true };
    } else if (deviceMismatch) {
      decision = { ...base, canOpenApp: false, canTransfer: false, requiresLogout: false, reason: "device_mismatch", reasonCode: "device_mismatch", isLocked: true };
    }

    const validationPolicy = computeValidationPolicy(profile);
    const trialRemainingDays = profile.license_status === "trial" && profile.trial_end
      ? Math.max(0, Math.floor((new Date(profile.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    const verdict = {
      valid: decision.canOpenApp,
      reason: decision.reason,
      user_id: user.id,
      license_status: profile.license_status,
      account_status: profile.account_status,
      trial_end: profile.trial_end,
      expiry_date: profile.expiry_date,
      current_device: profile.current_device,
      can_open_app: decision.canOpenApp,
      can_transfer: decision.canTransfer,
      requires_logout: decision.requiresLogout,
      is_locked: decision.isLocked,
    };

    const serverTime = new Date().toISOString();
    const blob = canonicalBlob(serverTime, verdict, validationPolicy);
    const signature = await signBlob(blob);

    return new Response(JSON.stringify({
      valid: decision.canOpenApp, // backward-compatible
      reason: decision.reason,
      license_status: profile.license_status,
      trial_remaining_days: trialRemainingDays,
      can_transfer: decision.canTransfer,
      can_open_app: decision.canOpenApp,
      requires_logout: decision.requiresLogout,
      validation_policy: validationPolicy,
      signed: { blob, signature, server_time: serverTime },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ valid: false, error: message }), {
      status: message === "invalid_token" || message === "missing authorization" ? 401 : 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  }
});
