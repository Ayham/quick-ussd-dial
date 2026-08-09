import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Server-controlled offline validation policy. The client reads this and never
// hardcodes cadence / grace / force requirements.
function computeValidationPolicy(profile: {
  license_status?: string | null;
  trial_end?: string | null;
  expiry_date?: string | null;
  account_status?: string | null;
}): {
  minimum_validation_interval_ms: number;
  offline_grace_ms: number;
  next_required_validation: string;
  force_validation: boolean;
  license_expiration: string | null;
  revoked: boolean;
  validation_policy: "normal" | "expiring_soon" | "force";
} {
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
    || (profile.license_status === "blocked" || profile.license_status === "revoked" || profile.license_status === "rejected");
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
    || profile.license_status === "pending" || profile.license_status === "inactive";
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
      .select("license_status, license_type, trial_start, trial_end, expiry_date, account_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) throw new Error("profile_not_found");

    const now = new Date();
    const trialEnd = profile.trial_end ? new Date(profile.trial_end) : null;
    const expiryDate = profile.expiry_date ? new Date(profile.expiry_date) : null;

    let valid = true;
    let reason: string | null = null;

    if (profile.account_status === "suspended") { valid = false; reason = "account_suspended"; }
    else if (profile.account_status === "blocked") { valid = false; reason = "account_blocked"; }
    else if (profile.license_status === "trial" && trialEnd && trialEnd < now) { valid = false; reason = "trial_expired"; }
    else if (profile.license_status === "expired") { valid = false; reason = "license_expired"; }
    else if (profile.license_status === "rejected") { valid = false; reason = "activation_rejected"; }
    else if (profile.license_status === "blocked") { valid = false; reason = "license_blocked"; }
    else if (profile.license_status === "revoked") { valid = false; reason = "license_revoked"; }
    else if (profile.license_status === "pending") { valid = false; reason = "activation_pending"; }
    else if (profile.license_status === "inactive") { valid = false; reason = "license_inactive"; }
    else if (expiryDate && expiryDate < now && profile.license_status !== "permanent") { valid = false; reason = "license_expired"; }

    const trialRemainingDays = profile.license_status === "trial" && trialEnd
      ? Math.max(0, Math.floor((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return new Response(JSON.stringify({
      valid,
      reason,
      license_status: profile.license_status,
      trial_remaining_days: trialRemainingDays,
      validation_policy: computeValidationPolicy(profile),
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
