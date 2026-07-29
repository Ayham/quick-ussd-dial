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

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });

  try {
    const body = await req.json();
    const events = Array.isArray(body.events) ? body.events : [];
    const clientId = String(body.client_id || "");

    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data } = await userClient.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }

    let inserted = 0;
    let errors = 0;
    const failedEventIds: string[] = [];

    for (const event of events.slice(0, 100)) {
      const data = event.data || {};
      const result = event.event === "transfer"
        ? await sb.from("transfers").upsert({
            client_id: event.id,
            user_id: userId,
            phone: String(data.phone || ""),
            amount: Number(data.amount || 0),
            operator: String(data.operator || "unknown"),
            status: String(data.status || "completed"),
            created_at: event.timestamp,
          }, { onConflict: "client_id" })
        : event.event === "contact_upsert" && userId
        ? await sb.from("contacts").upsert({
            client_id: event.id,
            user_id: userId,
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            phone_normalized: String(data.phone || ""),
          }, { onConflict: "user_id,phone_normalized" })
        : event.event === "contact_delete" && userId
        ? await sb.from("contacts").delete()
            .eq("user_id", userId)
            .eq("phone_normalized", String(data.phone || ""))
        : await sb.from("app_events").upsert({
            client_id: event.id,
            user_id: userId,
            event: event.event,
            data,
            created_at: event.timestamp,
          }, { onConflict: "client_id" });

      if (result.error) {
        errors++;
        if (event.id) failedEventIds.push(event.id);
      } else {
        inserted++;
      }
    }

    return json({ ok: true, inserted, errors, failed_event_ids: failedEventIds }, 200, req);
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500, req);
  }
});

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}
