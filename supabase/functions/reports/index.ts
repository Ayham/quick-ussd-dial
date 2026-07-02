import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ ok: false, reason: "auth_required" }, 401);

    const token = authorization.slice("Bearer ".length);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ ok: false, reason: "auth_required" }, 401);

    const userId = authData.user.id;
    const { data: roles, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) return json({ ok: false, reason: roleError.message }, 500);
    const isAdmin = (roles ?? []).some((row) => row.role === "admin");

    const body = await req.json().catch(() => ({}));
    const adminUserFilter = isAdmin ? optionalUuid(body.user_id) : null;
    const { data, error } = await serviceClient.rpc("report_transfers", {
      _request_user: userId,
      _is_admin: isAdmin,
      _date_from: optionalText(body.date_from),
      _date_to: optionalText(body.date_to),
      _operator: optionalText(body.operator),
      _status: optionalText(body.status),
      _user_id: adminUserFilter,
      _device_id: optionalText(body.device_id),
      _trial_id: optionalUuid(body.trial_id),
      _license_id: optionalUuid(body.license_id),
      _access_source: optionalText(body.access_source),
      _period: ["day", "week", "month"].includes(body.period) ? body.period : "day",
      _page: boundedInteger(body.page, 1, 1, 1_000_000),
      _page_size: boundedInteger(body.page_size, 50, 1, 100),
    });
    if (error) return json({ ok: false, reason: error.message }, 500);

    return json(data ?? { ok: true, rows: [], periods: [], total: 0 });
  } catch (error) {
    return json({ ok: false, reason: (error as Error).message }, 500);
  }
});

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalUuid(value: unknown): string | null {
  const text = optionalText(value);
  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
