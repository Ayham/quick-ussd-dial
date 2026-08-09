import { createClient } from "npm:@supabase/supabase-js@2";

function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
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
            device_id: clientId,
            user_id: userId,
            phone: String(data.phone || ""),
            amount: Number(data.amount || 0),
            package_price: Number(data.package_price || 0),
            operator: String(data.operator || "unknown"),
            status: String(data.status || "completed"),
            created_at: event.timestamp,
          }, { onConflict: "device_id,client_id" })
        : await sb.from("app_events").upsert({
            client_id: event.id,
            device_id: clientId,
            user_id: userId,
            event: event.event,
            data,
            created_at: event.timestamp,
          }, { onConflict: "device_id,client_id" });

      if (result.error) {
        errors++;
        if (event.id) failedEventIds.push(event.id);
      } else {
        inserted++;
      }
    }

    // Best-effort device health report for the Admin Sync Monitor. Runs AFTER
    // the transfer/event sync above and is intentionally isolated: a monitoring
    // write failure must never fail or block the actual data sync.
    if (clientId) {
      try {
        const now = new Date().toISOString();
        const deviceRow: Record<string, unknown> = {
          device_id: clientId,
          last_seen: now,
          last_seen_at: now,
          last_sync_at: now,
          pending_sync_count: Number(body.pending_count ?? 0),
          last_sync_error: errors > 0 ? `${errors} sync_failed` : null,
        };
        if (userId) deviceRow.user_id = userId;
        if (body.app_version) deviceRow.app_version = String(body.app_version);
        if (body.platform) deviceRow.platform = String(body.platform);
        await sb.from("devices").upsert(deviceRow, { onConflict: "device_id" });
      } catch {
        // Monitoring is best-effort; never let it interfere with data sync.
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