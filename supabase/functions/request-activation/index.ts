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

    const body: { device_id?: string; contact_name?: string; contact_phone?: string; ussd_numbers?: string[] } = await req.json().catch(() => ({}));
    if (!body.device_id) throw new Error("device_id_required");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    const { data: rateOk } = await serviceClient.rpc("check_rate_limit", { _key: `activation:${user.id}`, _window_seconds: 60, _max_requests: 3 });
    if (!rateOk) throw new Error("rate_limited");

    // Check for existing pending request
    const { data: existing } = await serviceClient
      .from("activations")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: false, error: "pending_request_exists", request_id: existing.id }), {
        status: 409,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
      });
    }

    const requestToken = crypto.randomUUID();
    const { error: insertError } = await serviceClient
      .from("activations")
      .insert({
        request_token: requestToken,
        device_id: body.device_id,
        user_id: user.id,
        contact_name: body.contact_name || null,
        contact_phone: body.contact_phone || null,
        ussd_numbers: body.ussd_numbers || [],
        status: "pending",
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, request_token: requestToken }), {
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
