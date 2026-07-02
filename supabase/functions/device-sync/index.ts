import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const device = body.device || {};
    const events = Array.isArray(body.events) ? body.events : [];
    const deviceId = String(device.device_id || body.device_id || "");
    const fingerprint = device.device_fingerprint ?? body.fingerprint ?? null;
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
    if (deviceId.length < 4) return json({ ok: false, error: "device_id required" }, 400);

    const { data: existing, error: lookupError } = await sb.from("devices")
      .select("id, user_id, device_fingerprint, app_instance_id")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (lookupError) return json({ ok: false, error: lookupError.message }, 500);

    const logSecurity = async (event: string, data: Record<string, unknown>) => {
      await Promise.all([
        sb.from("app_events").insert({
          device_id: deviceId, user_id: userId, event, data, created_at: new Date().toISOString(),
        }),
        sb.from("audit_logs").insert({
          target_user_id: existing?.user_id ?? userId,
          device_id: deviceId,
          action: event,
          entity: "devices",
          entity_id: existing?.id ?? deviceId,
          metadata: data,
        }),
      ]);
    };

    if (existing?.user_id && userId && existing.user_id !== userId) {
      await logSecurity("device_owner_mismatch", {
        stored_user_id: existing.user_id, attempted_user_id: userId,
      });
      return json({ ok: true, state: "device_mismatch", reason: "device_owner_mismatch", device: existing });
    }
    if (existing?.device_fingerprint && fingerprint && existing.device_fingerprint !== fingerprint) {
      await logSecurity("fingerprint_mismatch", {
        stored_fingerprint: existing.device_fingerprint, attempted_fingerprint: fingerprint,
      });
      return json({ ok: true, state: "fingerprint_mismatch", reason: "fingerprint_mismatch", device: existing });
    }
    if (existing?.app_instance_id && device.app_instance_id && existing.app_instance_id !== device.app_instance_id) {
      await logSecurity("app_instance_changed", {
        previous_app_instance_id: existing.app_instance_id,
        app_instance_id: device.app_instance_id,
      });
    }

    const now = new Date().toISOString();
    const mutable = {
      app_instance_id: device.app_instance_id ?? existing?.app_instance_id ?? null,
      android_id: device.android_id ?? null,
      name: device.name ?? null,
      model: device.model ?? null,
      platform: device.platform ?? null,
      app_version: device.app_version ?? null,
      language: device.language ?? null,
      timezone: device.timezone ?? null,
      user_id: existing?.user_id ?? userId,
      last_seen: now,
      last_seen_at: now,
      last_sync_at: now,
      last_activity_at: now,
      last_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    };
    const registration = existing
      ? await sb.from("devices").update(mutable).eq("device_id", deviceId)
      : await sb.from("devices").insert({
          device_id: deviceId,
          device_fingerprint: fingerprint,
          first_seen_at: now,
          lifecycle_state: "trial",
          ...mutable,
        });
    if (registration.error) {
      await sb.from("sync_logs").insert({
        device_id: deviceId, user_id: userId, event: "device_registration",
        status: "failed", payload: { device }, error: registration.error.message,
      });
      return json({ ok: false, error: registration.error.message }, 500);
    }

    let inserted = 0;
    let errors = 0;
    const failedEventIds: string[] = [];
    for (const event of events.slice(0, 100)) {
      const data = event.data || {};
      const result = event.event === "transfer"
        ? await sb.from("transfers").upsert({
            client_id: event.id,
            device_id: deviceId,
            phone: String(data.phone || ""),
            amount: Number(data.amount || 0),
            operator: String(data.operator || "unknown"),
            status: String(data.status || "completed"),
            user_id: userId,
            created_at: event.timestamp,
          }, { onConflict: "device_id,client_id" })
        : event.event === "contact_upsert"
        ? userId
          ? await sb.from("contacts").upsert({
              client_id: event.id,
              device_id: deviceId,
              user_id: userId,
              name: String(data.name || ""),
              phone: String(data.phone || ""),
              phone_normalized: String(data.phone || ""),
            }, { onConflict: "user_id,phone_normalized" })
          : { error: new Error("auth_required") }
        : event.event === "contact_delete"
        ? userId
          ? await sb.from("contacts").delete()
              .eq("user_id", userId)
              .eq("phone_normalized", String(data.phone || ""))
          : { error: new Error("auth_required") }
        : event.event === "activation_request"
        ? userId
          ? await sb.from("activations").upsert({
              request_token: String(data.request_token || event.id),
              device_id: deviceId,
              user_id: userId,
              contact_name: data.contact_name ? String(data.contact_name) : null,
              contact_phone: data.contact_phone ? String(data.contact_phone) : null,
              ussd_numbers: Array.isArray(data.ussd_numbers) ? data.ussd_numbers.map(String) : [],
              status: "pending",
            }, { onConflict: "request_token" })
          : { error: new Error("auth_required") }
        : await sb.from("app_events").upsert({
            client_id: event.id,
            device_id: deviceId,
            user_id: userId,
            event: event.event,
            data,
            created_at: event.timestamp,
          }, { onConflict: "device_id,client_id" });
      if (result.error) {
        errors++;
        if (event.id) failedEventIds.push(event.id);
        await sb.from("sync_logs").insert({
          device_id: deviceId, user_id: userId, event: event.event, status: "failed",
          payload: { event_id: event.id ?? null }, error: result.error.message,
        });
      } else {
        inserted++;
      }
    }

    await sb.from("sync_logs").insert({
      device_id: deviceId, user_id: userId, event: "device_sync",
      status: errors ? "failed" : "synced",
      payload: { records_count: inserted, errors },
      error: errors ? `${errors} event(s) failed` : null,
    });

    const { data: heartbeat, error: heartbeatError } = await sb.rpc("device_heartbeat", {
      _device_id: deviceId,
      _fingerprint: fingerprint,
      _app_instance_id: device.app_instance_id ?? null,
      _app_version: device.app_version ?? null,
      _platform: device.platform ?? null,
      _user_id: userId,
    });
    if (heartbeatError) return json({ ok: false, error: heartbeatError.message }, 500);

    return json({ inserted, errors, failed_event_ids: failedEventIds, ...(heartbeat || {}) });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
