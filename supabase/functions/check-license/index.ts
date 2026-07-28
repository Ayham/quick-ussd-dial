// Public endpoint — verify a license key against a device using the
// activate_license RPC so binding & mismatch checks are enforced server-side.
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

function normalizeKey(k: string): string {
  return k.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });
  try {
    const { license_key, device_id, fingerprint } = await req.json();
    if (!license_key || !device_id) return json({ valid: false, reason: "missing" }, 400, req);

    const normalized = normalizeKey(String(license_key));
    if (normalized.length !== 12) return json({ valid: false, reason: "format" }, 200, req);

    // Block check
    const { data: dev } = await sb.from("devices")
      .select("is_blocked, is_banned")
      .eq("device_id", device_id)
      .maybeSingle();
    if (dev?.is_blocked || dev?.is_banned) return json({ valid: false, reason: "blocked" }, 200, req);

    // Bind via RPC first, then validate through the server-authoritative path.
    const { data: rpc, error: rpcErr } = await sb.rpc("activate_license", {
      _license_key: normalized,
      _device_id: String(device_id),
      _fingerprint: fingerprint ? String(fingerprint) : null,
    });
    if (rpcErr) return json({ valid: false, reason: rpcErr.message }, 500, req);
    const res = rpc as { ok: boolean; reason?: string; license?: Record<string, unknown> } | null;
    if (!res?.ok) return json({ valid: false, reason: res?.reason || "invalid" }, 200, req);

    const { data: validation, error: validationErr } = await sb.rpc("validate_license", {
      _license_key: normalized,
      _device_id: String(device_id),
      _fingerprint: fingerprint ? String(fingerprint) : null,
    });
    if (validationErr) return json({ valid: false, reason: validationErr.message }, 500, req);
    const validated = validation as { ok: boolean; reason?: string; license?: Record<string, unknown> } | null;
    if (!validated?.ok) return json({ valid: false, reason: validated?.reason || "invalid" }, 200, req);

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
    }, 200, req);
  } catch (e) {
    return json({ valid: false, reason: (e as Error).message }, 500, req);
  }
});

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}
