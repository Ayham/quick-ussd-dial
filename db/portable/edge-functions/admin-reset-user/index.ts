// One-shot helper: delete a user by email and recreate as confirmed admin.
// REQUIRES caller to be an authenticated admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [Deno.env.get("APP_SITE_URL") || "http://localhost:5173", "http://localhost:5173", "http://localhost:3000"];
function getCorsHeaders(origin: string | null) {
  const o = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": o ?? ALLOWED_ORIGINS[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401, req);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, error: "unauthorized" }, 401, req);

    const { data: roleRow } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403, req);

    const { email, password, display_name } = await req.json();
    if (!email || !password) {
      return json({ ok: false, error: "email and password required" }, 400, req);
    }

    const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      await service.auth.admin.deleteUser(existing.id);
    }

    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: display_name ?? email },
    });
    if (createErr || !created.user) {
      return json({ ok: false, error: createErr?.message ?? "create failed" }, 500, req);
    }

    await service.from("user_roles").upsert(
      { user_id: created.user.id, role: "admin" },
      { onConflict: "user_id,role" },
    );

    return json({ ok: true, user_id: created.user.id, email }, 200, req);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500, req);
  }
});
