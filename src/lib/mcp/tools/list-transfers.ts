import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_transfers",
  title: "List recent transfers",
  description: "Return the signed-in user's recent USSD unit transfers, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return (1-200)"),
    operator: z.enum(["MTN", "Syriatel"]).optional().describe("Filter by operator"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, operator }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("transfers")
      .select("*")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (operator) q = q.eq("operator", operator);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0, rows: data ?? [] });
  },
});
