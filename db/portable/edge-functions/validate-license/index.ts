import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    else if (expiryDate && expiryDate < now && profile.license_status !== "permanent") { valid = false; reason = "license_expired"; }

    const trialRemainingDays = profile.license_status === "trial" && trialEnd
      ? Math.max(0, Math.floor((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return new Response(JSON.stringify({ valid, reason, license_status: profile.license_status, trial_remaining_days: trialRemainingDays }), {
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
