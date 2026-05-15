// Public endpoint — verify a license key against device.
// Returns full license details if valid, else reason.
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

function normalizeKey(k: string): string {
  return k.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { license_key, device_id } = await req.json();
    if (!license_key || !device_id) return json({ valid: false, reason: "missing" }, 400);

    const normalized = normalizeKey(String(license_key));
    if (normalized.length !== 12) return json({ valid: false, reason: "format" }, 200);

    const { data: lic } = await sb.from("licenses")
      .select("*")
      .eq("license_key", normalized)
      .maybeSingle();

    if (!lic) return json({ valid: false, reason: "not_found" });
    if (lic.status === "revoked") return json({ valid: false, reason: "revoked" });
    if (!lic.permanent && lic.expiry_date && new Date(lic.expiry_date) < new Date()) {
      await sb.from("licenses").update({ status: "expired" }).eq("id", lic.id);
      return json({ valid: false, reason: "expired" });
    }

    // Bind to device on first activation
    if (!lic.device_id) {
      await sb.from("licenses").update({
        device_id, status: "active", activated_at: new Date().toISOString(),
      }).eq("id", lic.id);
      lic.device_id = device_id;
      lic.status = "active";
    } else if (lic.device_id !== device_id) {
      return json({ valid: false, reason: "wrong_device" });
    }

    return json({
      valid: true,
      license: {
        license_key: lic.license_key,
        status: lic.status,
        level: lic.level,
        expiry_date: lic.expiry_date,
        permanent: lic.permanent,
        ussd_numbers: lic.ussd_numbers,
      },
    });
  } catch (e) {
    return json({ valid: false, reason: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
