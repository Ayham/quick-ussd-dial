// Public endpoint — trial-expired devices request activation.
// Returns a unique token that becomes part of the share link.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [Deno.env.get("APP_SITE_URL") || "http://localhost:5173", "http://localhost:5173", "http://localhost:3000"];
function getCorsHeaders(origin: string | null) {
  const o = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": o ?? ALLOWED_ORIGINS[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function genToken(len = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });

  try {
    let userId: string | null = null;

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "auth_required" }, 401, req);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    userId = data.user?.id ?? null;
    if (!userId) return json({ error: "auth_required" }, 401, req);

    const body = await req.json();
    const deviceId = String(body.device_id || "").trim();
    const ussdNumbers = Array.isArray(body.ussd_numbers) ? body.ussd_numbers.map(String) : [];
    const contactPhone = body.contact_phone ? String(body.contact_phone) : null;
    const contactName = body.contact_name ? String(body.contact_name) : null;

    if (!deviceId || deviceId.length < 4) return json({ error: "device_id required" }, 400, req);

    const { data: device, error: deviceLookupError } = await sb.from("devices")
      .select("id, user_id, is_blocked, is_banned")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (deviceLookupError) return json({ error: deviceLookupError.message }, 500, req);
    if (device?.user_id && device.user_id !== userId) {
      await sb.from("audit_logs").insert({
        target_user_id: device.user_id,
        device_id: deviceId,
        action: "activation_owner_mismatch",
        entity: "devices",
        entity_id: device.id,
        metadata: { attempted_user_id: userId },
      });
      return json({ error: "device_owner_mismatch" }, 403, req);
    }
    if (device?.is_blocked || device?.is_banned) return json({ error: "device_blocked" }, 403, req);
    if (!device) {
      const { error: insertDeviceError } = await sb.from("devices").insert({
        device_id: deviceId,
        user_id: userId,
        lifecycle_state: "pending_activation",
        first_seen_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });
      if (insertDeviceError) return json({ error: insertDeviceError.message }, 500, req);
    } else {
      await sb.from("devices").update({
        user_id: device.user_id ?? userId,
        last_seen: new Date().toISOString(),
      }).eq("device_id", deviceId);
    }

    const { data: activeLicense } = await sb.from("licenses")
      .select("id")
      .eq("device_id", deviceId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (activeLicense) return json({ error: "already_active" }, 409, req);

    // Reuse latest pending request for this device (deduplicate)
    const { data: existing } = await sb.from("activations")
      .select("request_token, status")
      .eq("device_id", deviceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    if (existing) {
      await sb.from("activations").update({
        user_id: userId,
        contact_phone: contactPhone,
        contact_name: contactName,
        ussd_numbers: ussdNumbers,
      }).eq("request_token", existing.request_token);
      return json({ ok: true, token: existing.request_token, reused: true }, 200, req);
    }

    const token = genToken(10);
    const { error } = await sb.from("activations").insert({
      request_token: token,
      device_id: deviceId,
      user_id: userId,
      ussd_numbers: ussdNumbers,
      contact_phone: contactPhone,
      contact_name: contactName,
    });
    if (error) return json({ error: error.message }, 500, req);

    await sb.from("audit_logs").insert({
      target_user_id: userId,
      device_id: deviceId,
      action: "activation_requested",
      entity: "activations",
      entity_id: token,
      metadata: { contact_phone: contactPhone },
    });

    return json({ ok: true, token }, 200, req);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, req);
  }
});

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}
