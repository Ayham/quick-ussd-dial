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

    const body: { device_id?: string } = await req.json().catch(() => ({}));
    const deviceId = body.device_id;

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    // Revoke sessions for this device
    await serviceClient
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .is("revoked_at", null);

    // Clear current_device from profile if it matches
    if (deviceId) {
      await serviceClient
        .from("profiles")
        .update({ current_device: null })
        .eq("user_id", user.id)
        .eq("current_device", deviceId);
    }

    // Deactivate device
    if (deviceId) {
      await serviceClient
        .from("devices")
        .update({ is_active: false })
        .eq("device_id", deviceId);
    }

    return new Response(JSON.stringify({ success: true }), {
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
