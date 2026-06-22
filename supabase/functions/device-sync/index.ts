// Public device sync endpoint.
// - Upserts device metadata
// - Pushes batched offline events (transfers + app_events)
// - Delegates state resolution to the `device_heartbeat` RPC so the server is
//   the single source of truth for trial / license / lifecycle / force_update.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeviceMeta {
  device_id: string;
  device_fingerprint?: string;
  app_instance_id?: string;
  android_id?: string;
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
    const fingerprint = device.device_fingerprint ?? body.fingerprint ?? null;
    let userId: string | null = null;

    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
      userId = data.user?.id ?? null;
    }

    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 4) {
      return json({ ok: false, error: "device_id required" }, 400);
    }

    // 1) Upsert metadata (heartbeat RPC also touches last_seen, but we store the
    // richer device profile here). Fail-closed on registration error.
    const nowIso = new Date().toISOString();
    const { error: deviceErr } = await sb.from("devices").upsert({
      device_id: deviceId,
      device_fingerprint: fingerprint,
      app_instance_id: device.app_instance_id ?? null,
      android_id: device.android_id ?? null,
      name: device.name,
      model: device.model,
      platform: device.platform,
      app_version: device.app_version,
      language: device.language,
      timezone: device.timezone,
      user_id: userId,
      last_seen: nowIso,
      last_seen_at: nowIso,
      last_sync_at: nowIso,
      last_activity_at: nowIso,
      last_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }, { onConflict: "device_id" });

    if (deviceErr) {
      await sb.from("sync_logs").insert({
        device_id: deviceId, user_id: userId, event: "device_registration",
        status: "failed", payload: { device }, error: deviceErr.message,
      });
      return json({ ok: false, error: deviceErr.message }, 500);
    }

    // 2) Drain offline event queue (best-effort; failures are logged per-event)
    let inserted = 0, errors = 0;
    for (const ev of events) {
      try {
        const data = ev.data || {};
        if (ev.event === "transfer") {
          await sb.from("transfers").upsert({
            client_id: ev.id,
            device_id: deviceId,
            phone: String(data.phone || ""),
            amount: Number(data.amount || 0),
            operator: String(data.operator || "unknown"),
            status: String(data.status || "completed"),
            user_id: userId,
            created_at: ev.timestamp,
          }, { onConflict: "device_id,client_id" });
        } else {
          await sb.from("app_events").insert({
            device_id: deviceId, user_id: userId,
            event: ev.event, data, created_at: ev.timestamp,
          });
        }
        inserted++;
      } catch (e) {
        errors++;
        await sb.from("sync_logs").insert({
          device_id: deviceId, user_id: userId, event: ev.event, status: "failed",
          payload: { event_id: ev.id ?? null }, error: (e as Error).message,
        });
      }
    }

    await sb.from("sync_logs").insert({
      device_id: deviceId, user_id: userId, event: "device_sync",
      status: errors > 0 ? "failed" : "synced",
      payload: { records_count: inserted, errors },
      error: errors > 0 ? `${errors} event(s) failed` : null,
    });

    // 3) Authoritative state via RPC — single source of truth.
    const { data: hb, error: hbErr } = await sb.rpc("device_heartbeat", {
      _device_id: deviceId,
      _fingerprint: fingerprint,
      _app_version: device.app_version ?? null,
      _platform: device.platform ?? null,
    });
    if (hbErr) return json({ ok: false, error: hbErr.message }, 500);

    const h = (hb ?? {}) as Record<string, unknown>;
    return json({
      ok: true,
      inserted,
      errors,
      state: h.state,
      reason: h.reason,
      lifecycle_state: h.lifecycle_state,
      device: h.device,
      license: h.license,
      trial: h.trial,
      force_update: h.force_update,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
