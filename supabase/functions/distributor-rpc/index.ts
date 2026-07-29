// Distributor RPC proxy: verifies the caller is a distributor or admin,
// then invokes the requested SECURITY DEFINER function using the service role.
// Distributors can only operate on their assigned customers.
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

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Whitelist of functions callable through this proxy.
const ALLOWED = new Set([
  "distributor_get_dashboard_stats",
  "distributor_get_customers",
  "distributor_get_customer_detail",
  "distributor_get_transactions",
  "distributor_get_topup_requests",
  "distributor_add_debt",
  "distributor_register_payment",
  "distributor_adjust_balance",
  "distributor_complete_topup",
  "distributor_cancel_topup",
  "distributor_update_customer_notes",
  "distributor_update_customer_secret",
  "distributor_add_transaction",
  "customer_create_topup_request",
  "distributor_assign_customer",
  "distributor_move_customer",
  "process_accounting",
  "complete_topup_request",
  "move_customer",
]);

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req?.headers.get("origin") ?? null), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401, req);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, error: "unauthorized" }, 401, req);

    const userId = userData.user.id;

    // Verify caller is admin or distributor
    const { data: roleRow } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = !!roleRow;

    let isDistributor = false;
    if (!isAdmin) {
      const { data: profile } = await service
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      isDistributor = profile?.role === "distributor";
    }

    if (!isAdmin && !isDistributor) {
        return json({ ok: false, error: "forbidden" }, 403, req);
    }

    const body = await req.json().catch(() => ({}));
    const fn = String(body?.fn || "");
    const args = (body?.args ?? {}) as Record<string, unknown>;
    if (!ALLOWED.has(fn)) return json({ ok: false, error: "unknown_fn" }, 400, req);

    // For distributor callers, validate they only act on assigned customers
    if (isDistributor && !isAdmin) {
      const customerId = args._customer_id as string | undefined;
      const requestId = args._request_id as string | undefined;

      // Admin-only functions
      const adminOnlyFns = new Set([
        "distributor_assign_customer", "distributor_move_customer",
        "assign_customer_to_distributor", "move_customer",
      ]);
      if (adminOnlyFns.has(fn)) {
      return json({ ok: false, error: "forbidden" }, 403, req);
      }

      if (customerId) {
        const { data: assignment } = await service
          .from("distributor_customers")
          .select("id")
          .eq("distributor_id", userId)
          .eq("customer_id", customerId)
          .maybeSingle();
        if (!assignment) return json({ ok: false, error: "customer_not_assigned" }, 403, req);
      }

      if (requestId) {
        const { data: request } = await service
          .from("topup_requests")
          .select("distributor_id, customer_id")
          .eq("id", requestId)
          .maybeSingle();
        if (!request || request.distributor_id !== userId) {
          return json({ ok: false, error: "request_not_assigned" }, 403, req);
        }
      }
    }

    // Set created_by to the caller for accounting functions
    if (fn === "process_accounting") {
      args._created_by = userId;
    } else if (fn === "complete_topup_request") {
      args._completed_by = userId;
    }

    const { data, error } = await service.rpc(fn, args);
    if (error) return json({ ok: false, error: error.message }, 500, req);
    return json({ ok: true, data }, 200, req);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500, req);
  }
});
