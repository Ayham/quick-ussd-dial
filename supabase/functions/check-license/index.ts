// Public endpoint — verify a license key against a device using the
// activate_license RPC so binding & mismatch checks are enforced server-side.
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
    const { license_key, device_id, fingerprint } = await req.json();
    if (!license_key || !device_id) return json({ valid: false, reason: "missing" }, 400);

    const normalized = normalizeKey(String(license_key));
    if (normalized.length !== 12) return json({ valid: false, reason: "format" }, 200);

    // Block check
    const { data: dev } = await sb.from("devices")
      .select("is_blocked, is_banned")
      .eq("device_id", device_id)
      .maybeSingle();
    if (dev?.is_blocked || dev?.is_banned) return json({ valid: false, reason: "blocked" });

    // Bind via RPC first, then validate through the server-authoritative path.
    const { data: rpc, error: rpcErr } = await sb.rpc("activate_license", {
      _license_key: normalized,
      _device_id: String(device_id),
      _fingerprint: fingerprint ? String(fingerprint) : null,
    });
    if (rpcErr) return json({ valid: false, reason: rpcErr.message }, 500);
    const res = rpc as { ok: boolean; reason?: string; license?: Record<string, unknown> } | null;
    if (!res?.ok) return json({ valid: false, reason: res?.reason || "invalid" });

    const { data: validation, error: validationErr } = await sb.rpc("validate_license", {
      _license_key: normalized,
      _device_id: String(device_id),
      _fingerprint: fingerprint ? String(fingerprint) : null,
    });
    if (validationErr) return json({ valid: false, reason: validationErr.message }, 500);
    const validated = validation as { ok: boolean; reason?: string; license?: Record<string, unknown> } | null;
    if (!validated?.ok) return json({ valid: false, reason: validated?.reason || "invalid" });

    const lic = validated.license!;
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
