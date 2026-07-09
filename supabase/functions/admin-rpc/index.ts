// Admin RPC proxy: verifies the caller is an admin, then invokes the requested
// SECURITY DEFINER function using the service role. This lets us revoke direct
// EXECUTE on those functions from the `authenticated` role without breaking the
// admin panel.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Whitelist of admin-only RPCs callable through this proxy.
const ALLOWED = new Set([
  "admin_extend_license",
  "admin_convert_license",
  "admin_extend_trial",
  "admin_end_trial",
  "admin_convert_trial",
  "admin_decide_activation",
  "admin_set_role",
  "admin_unblock_device",
  "admin_set_license_status",
  "admin_block_device",
  "admin_transfer_license",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

    // Verify admin via a table read (RLS-safe via service client).
    const { data: roleRow, error: roleErr } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) return json({ ok: false, error: roleErr.message }, 500);
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const fn = String(body?.fn || "");
    const args = (body?.args ?? {}) as Record<string, unknown>;
    if (!ALLOWED.has(fn)) return json({ ok: false, error: "unknown_fn" }, 400);

    const { data, error } = await service.rpc(fn, args);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
