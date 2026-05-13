// Public device sync endpoint — no auth required.
// Devices push batched events; we upsert into Supabase using service role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface DeviceMeta {
  device_id: string;
  name?: string;
  model?: string;
  platform?: string;
  app_version?: string;
  language?: string;
  timezone?: string;
}

interface SyncEvent {
  id?: string;
  event: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const device: DeviceMeta = body.device || {};
    const events: SyncEvent[] = body.events || [];
    const deviceId = device.device_id || body.device_id;

    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 4) {
      return json({ error: "device_id required" }, 400);
    }

    // 1) upsert device row
    await sb.from("devices").upsert({
      device_id: deviceId,
      name: device.name,
      model: device.model,
      platform: device.platform,
      app_version: device.app_version,
      language: device.language,
      timezone: device.timezone,
      last_seen: new Date().toISOString(),
    }, { onConflict: "device_id" });

    // 2) dispatch events
    let inserted = 0, errors = 0;
    for (const ev of events) {
      try {
        const data = ev.data || {};
        switch (ev.event) {
          case "transfer": {
            await sb.from("transfers").upsert({
              client_id: ev.id,
              device_id: deviceId,
              phone: String(data.phone || ""),
              amount: Number(data.amount || 0),
              operator: String(data.operator || "unknown"),
              status: String(data.status || "completed"),
              created_at: ev.timestamp,
            }, { onConflict: "device_id,client_id" });
            break;
          }
          case "distributor_topup":
          case "distributor_payment": {
            // skip — handled via dedicated upsert if needed
            await sb.from("app_events").insert({ device_id: deviceId, event: ev.event, data });
            break;
          }
          default: {
            await sb.from("app_events").insert({
              device_id: deviceId,
              event: ev.event,
              data,
              created_at: ev.timestamp,
            });
          }
        }
        inserted++;
      } catch (e) {
        errors++;
        await sb.from("sync_logs").insert({
          device_id: deviceId, event: ev.event, status: "error",
          error: (e as Error).message, payload: ev as unknown as Record<string, unknown>,
        });
      }
    }

    // 3) Return current license status for the device (for offline-first sync down)
    const { data: lic } = await sb.from("licenses")
      .select("license_key, status, level, expiry_date, permanent, ussd_numbers")
      .eq("device_id", deviceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: dev } = await sb.from("devices")
      .select("is_blocked, is_active, notes")
      .eq("device_id", deviceId)
      .maybeSingle();

    return json({ ok: true, inserted, errors, license: lic, device: dev });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
