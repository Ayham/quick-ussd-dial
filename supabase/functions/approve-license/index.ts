import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type,x-client-info,apikey" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing authorization");
    const token = authHeader.replace("Bearer ", "");

    const body: { activation_id?: string; license_type?: string; duration_days?: number; permanent?: boolean; notes?: string } = await req.json().catch(() => ({}));
    if (!body.activation_id) throw new Error("activation_id_required");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) throw new Error("invalid_token");

    // Verify admin
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roleData || roleData.length === 0) throw new Error("unauthorized");

    // Get the activation request
    const { data: activation } = await serviceClient
      .from("activations")
      .select("*")
      .eq("id", body.activation_id)
      .eq("status", "pending")
      .single();

    if (!activation) throw new Error("activation_not_found_or_already_processed");

    const isPermanent = body.permanent === true;
    let expiryDate: string | null = null;
    let licenseType: string;

    if (isPermanent) {
      licenseType = "permanent";
    } else {
      const days = body.duration_days || 30;
      const date = new Date();
      date.setDate(date.getDate() + days);
      expiryDate = date.toISOString().split("T")[0];
      if (days <= 30) licenseType = "days_30";
      else if (days <= 90) licenseType = "days_90";
      else if (days <= 180) licenseType = "days_180";
      else licenseType = "days_365";
    }

    const now = new Date().toISOString();

    // Update activation
    await serviceClient
      .from("activations")
      .update({
        status: "approved",
        processed_by: user.id,
        processed_at: now,
        notes: body.notes || null,
      })
      .eq("id", body.activation_id);

    // Update user profile
    await serviceClient
      .from("profiles")
      .update({
        license_status: isPermanent ? "permanent" : "active",
        license_type: isPermanent ? "permanent" : licenseType as any,
        expiry_date: expiryDate,
        account_status: "active",
        updated_at: now,
      })
      .eq("user_id", activation.user_id);

    // Log admin action
    await serviceClient
      .from("admin_actions")
      .insert({
        admin_id: user.id,
        action: "approve_license",
        target_type: "user",
        target_id: activation.user_id,
        details: {
          activation_id: body.activation_id,
          license_type: licenseType,
          expiry_date: expiryDate,
          permanent: isPermanent,
          notes: body.notes,
        },
      });

    return new Response(JSON.stringify({ success: true, license_type: licenseType, expiry_date: expiryDate, permanent: isPermanent }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "unknown" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  }
});
