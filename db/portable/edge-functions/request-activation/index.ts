// Public endpoint — trial-expired devices request activation.
// Returns a unique token that becomes part of the share link.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let userId: string | null = null;

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    userId = data.user?.id ?? null;
    if (!userId) return json({ error: "auth_required" }, 401);

    const body = await req.json();
    const deviceId = String(body.device_id || "").trim();
    const ussdNumbers = Array.isArray(body.ussd_numbers) ? body.ussd_numbers.map(String) : [];
    const contactPhone = body.contact_phone ? String(body.contact_phone) : null;
    const contactName = body.contact_name ? String(body.contact_name) : null;

    if (!deviceId || deviceId.length < 4) return json({ error: "device_id required" }, 400);

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
      return json({ ok: true, token: existing.request_token, reused: true });
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
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, token });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
