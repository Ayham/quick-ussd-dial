// Admin-only — pulls historical data from the public Google Sheet and inserts.
// We read the sheet via its CSV-export URL (sheet must be shared "anyone with link").
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SHEET_ID = "1qYSzMhPoNACaPAxgd9S6I9UK1mVl7FX0Fo3Pg8lHNds";

function csvToRows(csv: string): string[][] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], inQ = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQ) {
      if (c === '"' && csv[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function fetchSheet(gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return csvToRows(await res.text());
}

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
    if (!claims?.claims?.sub) return json({ error: "unauth" }, 401);
    const userId = claims.claims.sub;
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles || []).some((r) => r.role === "admin")) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const gids: string[] = Array.isArray(body.gids) && body.gids.length ? body.gids : ["1555140549", "0"];

    const summary: Record<string, unknown> = {};

    for (const gid of gids) {
      try {
        const rows = await fetchSheet(gid);
        if (!rows.length) { summary[gid] = { rows: 0 }; continue; }
        const header = rows[0].map((h) => h.trim().toLowerCase());
        const data = rows.slice(1).filter((r) => r.some((c) => c && c.trim()));

        // Heuristic: try to match common column names.
        // Devices sheet: device_id / id / model / platform / app_version
        // Transfers sheet: device_id / phone / amount / operator / timestamp / status
        // Generic event sheet: store as app_events
        const idxOf = (name: string) =>
          header.findIndex((h) => h === name || h === name.replace("_", " "));

        const devCol = idxOf("device_id") >= 0 ? idxOf("device_id") : idxOf("deviceid");
        const phoneCol = idxOf("phone");
        const amountCol = idxOf("amount");
        const opCol = idxOf("operator");
        const tsCol = idxOf("timestamp") >= 0 ? idxOf("timestamp") : idxOf("created_at");
        const statusCol = idxOf("status");
        const eventCol = idxOf("event");

        let inserted = 0;
        if (devCol >= 0 && phoneCol >= 0 && amountCol >= 0) {
          // Treat as transfers
          for (const r of data) {
            const deviceId = r[devCol]?.trim();
            if (!deviceId) continue;
            await sb.from("devices").upsert({ device_id: deviceId, last_seen: new Date().toISOString() }, { onConflict: "device_id" });
            await sb.from("transfers").insert({
              device_id: deviceId,
              phone: r[phoneCol]?.trim() || "",
              amount: Number(r[amountCol]) || 0,
              operator: (r[opCol] || "unknown").toLowerCase(),
              status: r[statusCol] || "completed",
              created_at: tsCol >= 0 && r[tsCol] ? r[tsCol] : new Date().toISOString(),
            });
            inserted++;
          }
        } else if (devCol >= 0 && eventCol >= 0) {
          // Generic events
          for (const r of data) {
            const deviceId = r[devCol]?.trim();
            if (!deviceId) continue;
            await sb.from("devices").upsert({ device_id: deviceId, last_seen: new Date().toISOString() }, { onConflict: "device_id" });
            const dataObj: Record<string, string> = {};
            header.forEach((h, i) => { if (i !== devCol && i !== eventCol) dataObj[h] = r[i] || ""; });
            await sb.from("app_events").insert({
              device_id: deviceId, event: r[eventCol] || "imported", data: dataObj,
              created_at: tsCol >= 0 && r[tsCol] ? r[tsCol] : new Date().toISOString(),
            });
            inserted++;
          }
        }
        summary[gid] = { rows: data.length, inserted, header };
      } catch (e) {
        summary[gid] = { error: (e as Error).message };
      }
    }

    await sb.from("admin_actions").insert({
      admin_id: userId, action: "migrate_sheets", details: summary,
    });

    return json({ ok: true, summary });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
