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

    const body: { device_id?: string; device_name?: string; device_model?: string; platform?: string; app_version?: string; fingerprint?: string; force?: boolean; refresh_token?: string } = await req.json().catch(() => ({}));
    const deviceId = body.device_id;
    if (!deviceId) throw new Error("device_id_required");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    // Web/browser logins (e.g. admin panel) don't participate in single-device
    // enforcement and must never revoke the mobile app's session or overwrite
    // current_device. Just record the login time.
    if (body.platform === "web") {
      await serviceClient
        .from("profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true, device_id: deviceId, platform: "web" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
      });
    }

    // Check account status
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("account_status, license_status, current_device")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.account_status === "suspended" || profile?.account_status === "blocked") throw new Error("account_suspended");

    // Reject login from a device that has been banned or blocked by an admin.
    const { data: deviceRow } = await serviceClient
      .from("devices")
      .select("is_blocked, is_banned, lifecycle_state")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (deviceRow && (deviceRow.is_blocked || deviceRow.is_banned || deviceRow.lifecycle_state === "blocked")) {
      return new Response(JSON.stringify({ success: false, error: "device_banned", device_id: deviceId }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
      });
    }

    // Enforce single device: reject login from a different device if current_device is set.
    // The client may explicitly pass force=true to log the other device out and take over.
    if (profile?.current_device && profile.current_device !== deviceId) {
      if (!body.force) {
        return new Response(JSON.stringify({ success: false, error: "device_mismatch", current_device: profile.current_device }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
        });
      }
    }

    // Log out every OTHER device's real Supabase auth session so it can no
    // longer refresh. Runs on force takeover as well as after an admin device
    // reset (current_device cleared) or a previous device logout: whichever
    // device binds next is the only one that stays signed in.
    const { data: displaced } = await serviceClient
      .from("device_auth")
      .select("id, refresh_token")
      .eq("user_id", user.id)
      .neq("device_id", deviceId)
      .is("revoked_at", null);
    for (const row of displaced ?? []) {
      if (row.refresh_token) {
        try {
          // Redeem the displaced device's refresh token: GoTrue rotates it and
          // invalidates the old one, so the displaced device's session can no
          // longer refresh. (admin.signOut() expects a user JWT, not a refresh
          // token, so it cannot be used here.)
          await serviceClient.auth.refreshSession({ refresh_token: row.refresh_token });
        } catch {}
      }
      await serviceClient
        .from("device_auth")
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id);
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

    // Store this device's auth refresh token so a future bind can revoke
    // this exact Supabase session.
    await serviceClient
      .from("device_auth")
      .upsert({
        user_id: user.id,
        device_id: deviceId,
        refresh_token: body.refresh_token || null,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,device_id" });

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
