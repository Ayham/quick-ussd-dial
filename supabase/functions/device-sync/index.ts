// Public device sync endpoint — no auth required.
// Devices push batched events; we upsert into Supabase using service role.
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
      return json({ error: "device_id required" }, 400);
    }

    // 1) upsert device row. Fail closed if registration cannot be stored.
    const { data: savedDevice, error: deviceErr } = await sb.from("devices").upsert({
      device_id: deviceId,
      device_fingerprint: device.device_fingerprint ?? null,
      app_instance_id: device.app_instance_id ?? null,
      android_id: device.android_id ?? null,
      name: device.name,
      model: device.model,
      platform: device.platform,
      app_version: device.app_version,
      language: device.language,
      timezone: device.timezone,
      user_id: userId,
      last_seen: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      last_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }, { onConflict: "device_id" }).select("*").single();

    if (deviceErr || !savedDevice) {
      await sb.from("sync_logs").insert({
        device_id: deviceId,
        user_id: userId,
        event: "device_registration",
        status: "failed",
        payload: { device },
        error: deviceErr?.message || "device registration failed",
      });
      return json({ ok: false, error: deviceErr?.message || "device registration failed" }, 500);
    }

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
              user_id: userId,
              created_at: ev.timestamp,
            }, { onConflict: "device_id,client_id" });
            break;
          }
          case "distributor_topup":
          case "distributor_payment": {
            // skip — handled via dedicated upsert if needed
            await sb.from("app_events").insert({ device_id: deviceId, user_id: userId, event: ev.event, data });
            break;
          }
          default: {
            await sb.from("app_events").insert({
              device_id: deviceId,
              user_id: userId,
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
          device_id: deviceId,
          user_id: userId,
          event: ev.event,
          status: "failed",
          payload: { record_count: 1, event_id: ev.id ?? null },
          error: (e as Error).message,
        });
      }
    }

    await sb.from("sync_logs").insert({
      device_id: deviceId,
      user_id: userId,
      event: "device_sync",
      status: errors > 0 ? "failed" : "synced",
      payload: { records_count: inserted, errors },
      error: errors > 0 ? `${errors} event(s) failed` : null,
    });

    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: trialInsertErr } = await sb.from("trials").upsert({
      device_id: deviceId,
      expires_at: trialExpiresAt,
      days_total: 30,
      status: "active",
    }, { onConflict: "device_id", ignoreDuplicates: true });

    if (trialInsertErr) {
      return json({ ok: false, error: trialInsertErr.message }, 500);
    }

    const { data: trial, error: trialFetchErr } = await sb.from("trials")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (trialFetchErr) return json({ ok: false, error: trialFetchErr.message }, 500);

    // 3) Return current license status for the device (for offline-first sync down)
    const { data: lic } = await sb.from("licenses")
      .select("license_key, status, level, expiry_date, permanent, ussd_numbers")
      .eq("device_id", deviceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({ ok: true, inserted, errors, license: lic, device: savedDevice, trial });
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
