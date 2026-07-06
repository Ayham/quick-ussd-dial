import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_devices",
  title: "List my devices",
  description: "Return every device registered to the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("devices")
      .select("device_id,platform,app_version,lifecycle_state,is_active,is_blocked,last_seen_at,first_seen_at")
      .eq("user_id", ctx.getUserId())
      .order("last_seen_at", { ascending: false });
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0, rows: data ?? [] });
  },
});
