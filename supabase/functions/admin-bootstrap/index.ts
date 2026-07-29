// Admin-only — promotes the calling signed-in user to the 'admin' role
// IF no admin exists yet. After the first admin is set, only existing admins
// can promote others (via this same endpoint with target_user_id).
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [Deno.env.get("APP_SITE_URL") || "http://localhost:5173", "http://localhost:5173", "http://localhost:3000", "http://localhost:8080"];
function getCorsHeaders(origin: string | null) {
  const safeOrigin = origin || Deno.env.get("APP_SITE_URL") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauth" }, 401, req);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    const userId = claims?.user?.id;
    if (!userId) return json({ error: "unauth" }, 401, req);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.target_user_id || userId;

    const { count } = await sb.from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count || 0) > 0) {
      // Only existing admins can add more
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
      if (!(roles || []).some((r) => r.role === "admin")) return json({ error: "forbidden" }, 403, req);
    }

    const { error } = await sb.from("user_roles")
      .upsert({ user_id: targetUserId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return json({ error: error.message }, 500, req);

    return json({ ok: true, user_id: targetUserId }, 200, req);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, req);
  }
});

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" } });
}
