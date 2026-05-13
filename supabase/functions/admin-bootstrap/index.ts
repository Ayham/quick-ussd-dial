// Admin-only — promotes the calling signed-in user to the 'admin' role
// IF no admin exists yet. After the first admin is set, only existing admins
// can promote others (via this same endpoint with target_user_id).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) return json({ error: "unauth" }, 401);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.target_user_id || userId;

    const { count } = await sb.from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count || 0) > 0) {
      // Only existing admins can add more
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
      if (!(roles || []).some((r) => r.role === "admin")) return json({ error: "forbidden" }, 403);
    }

    const { error } = await sb.from("user_roles")
      .upsert({ user_id: targetUserId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, user_id: targetUserId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
