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

    const body: { device_id?: string; device_name?: string; device_model?: string; platform?: string; app_version?: string; fingerprint?: string } = await req.json().catch(() => ({}));
    const deviceId = body.device_id;
    if (!deviceId) throw new Error("device_id_required");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    const rateKey = `login:${user.id}`;
    const { data: rateOk } = await serviceClient.rpc("check_rate_limit", { _key: rateKey, _window_seconds: 60, _max_requests: 5 });
    if (!rateOk) throw new Error("rate_limited");

    // Check account status
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("account_status, license_status, current_device")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.account_status === "suspended" || profile?.account_status === "blocked") throw new Error("account_suspended");

    // Enforce single device: reject login from a different device if current_device is set
    if (profile?.current_device && profile.current_device !== deviceId) {
      return new Response(JSON.stringify({ success: false, error: "device_mismatch", current_device: profile.current_device }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
      });
    }

    // Revoke all other sessions for this user
    await serviceClient
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    // Upsert current session
    const sessionId = crypto.randomUUID();
    await serviceClient
      .from("sessions")
      .insert({
        id: sessionId,
        user_id: user.id,
        device_id: deviceId,
        last_seen_at: new Date().toISOString(),
        user_agent: req.headers.get("user-agent") || null,
      });

    // Update profile with current device
    await serviceClient
      .from("profiles")
      .update({ current_device: deviceId, last_login: new Date().toISOString() })
      .eq("user_id", user.id);

    // Upsert device record
    await serviceClient
      .from("devices")
      .upsert({
        device_id: deviceId,
        user_id: user.id,
        name: body.device_name || null,
        model: body.device_model || null,
        platform: body.platform || null,
        app_version: body.app_version || null,
        device_fingerprint: body.fingerprint || null,
        last_seen: new Date().toISOString(),
        is_active: true,
      }, { onConflict: "device_id" });

    return new Response(JSON.stringify({ success: true, session_id: sessionId, device_id: deviceId }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "unknown" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  }
});
