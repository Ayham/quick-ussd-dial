import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type,x-client-info" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing authorization");

    const token = authHeader.replace("Bearer ", "");
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    const { data: sessionData } = await serviceClient.auth.getSession();
    const session = sessionData?.session;

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

    let isLocked = false;
    let lockReason: string | null = null;

    if (profile.account_status === "suspended" || profile.account_status === "blocked") {
      isLocked = true;
      lockReason = "account_suspended";
    } else if (profile.license_status === "trial" && trialEnd && trialEnd < now) {
      isLocked = true;
      lockReason = "trial_expired";
    } else if (profile.license_status === "expired" || profile.license_status === "rejected" || profile.license_status === "blocked") {
      isLocked = true;
      lockReason = "license_inactive";
    } else if (expiryDate && expiryDate < now && profile.license_status !== "permanent") {
      isLocked = true;
      lockReason = "license_expired";
    }

    return new Response(JSON.stringify({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: profile.display_name,
      },
      session: {
        exp: session?.expires_at ? new Date(session.expires_at).toISOString() : null,
        created_at: session?.created_at,
      },
      license: {
        status: profile.license_status,
        type: profile.license_type,
        trial_start: profile.trial_start,
        trial_end: profile.trial_end,
        expiry_date: profile.expiry_date,
        trial_remaining_days: trialRemainingDays,
        is_locked: isLocked,
        lock_reason: lockReason,
      },
      device: {
        current_device: profile.current_device,
      },
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
