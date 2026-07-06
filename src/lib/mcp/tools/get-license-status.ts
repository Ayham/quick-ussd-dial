import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_license_status",
  title: "Get license & trial status",
  description: "Return the signed-in user's active licenses and trial status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    const [{ data: licenses, error: le }, { data: trials, error: te }] = await Promise.all([
      sb.from("licenses").select("id,license_key,status,permanent,expiry_date,activated_at,device_id").eq("user_id", ctx.getUserId()),
      sb.from("trials").select("id,device_id,status,started_at,expires_at,days_total"),
    ]);
    if (le) return errorResult(le.message);
    if (te) return errorResult(te.message);
    return textResult({ licenses: licenses ?? [], trials: trials ?? [] });
  },
});
