// Admin-only — generate a license key in AB12-CD34-EF56 format.
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

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function gen12(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CHARS[b % CHARS.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauth" }, 401, req);
    const token = auth.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: cErr } = await userClient.auth.getUser(token);
    if (cErr || !claims?.user?.id) return json({ error: "unauth" }, 401, req);

    const userId = claims.user.id;
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles || []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "forbidden" }, 403, req);

    const body = await req.json();
    const ussdNumbers = Array.isArray(body.ussd_numbers) ? body.ussd_numbers.map(String) : [];
    const expiryDate = body.expiry_date || null;
    const permanent = !!body.permanent;
    const level = body.level || "standard";
    const notes = body.notes || null;
    const licenseUserId = (typeof body.user_id === "string" && body.user_id.trim()) ? body.user_id.trim() : null;
    const deviceId: string | null = (typeof body.device_id === "string" && body.device_id.trim()) ? body.device_id.trim() : null;
    const allowPending = body.allow_pending === true; // must be explicit to create an unbound license
    if (!permanent && !expiryDate) return json({ error: "expiry_date_required" }, 400, req);
    if (!deviceId && !allowPending) {
      return json({ error: "device_id_required", hint: "Pass device_id, or allow_pending:true to create an unbound license." }, 400, req);
    }

    if (deviceId) {
      const { error: deviceErr } = await sb.from("devices").upsert({
        device_id: deviceId,
        user_id: licenseUserId,
        last_seen: new Date().toISOString(),
      }, { onConflict: "device_id" });
      if (deviceErr) return json({ error: deviceErr.message }, 500, req);
    }

    // Try a few times in case of UNIQUE collision
    for (let i = 0; i < 5; i++) {
      const key = gen12();
      const { data, error } = await sb.from("licenses").insert({
        license_key: key,
        ussd_numbers: ussdNumbers,
        expiry_date: permanent ? null : expiryDate,
        permanent,
        level,
        notes,
        device_id: deviceId,
        user_id: licenseUserId,
        created_by: userId,
        status: deviceId ? "active" : "pending",
        activated_at: deviceId ? new Date().toISOString() : null,
      }).select("*").single();
      if (!error && data) {
        await sb.from("admin_actions").insert({
          admin_id: userId,
          action: "create_license",
          target_type: "license",
          target_id: data.id,
          details: { license_key: key, device_id: deviceId, expiry_date: expiryDate, permanent },
        });
        return json({ ok: true, license: data, formatted: formatKey(key) }, 200, req);
      }
      if (error && !error.message.includes("duplicate")) return json({ error: error.message }, 500, req);
    }
    return json({ error: "could not generate unique key" }, 500, req);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, req);
  }
});

function formatKey(k: string): string {
  return `${k.slice(0, 4)}-${k.slice(4, 8)}-${k.slice(8, 12)}`;
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}
