import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_profile",
  title: "Get my profile",
  description: "Return the signed-in user's profile (display name, email, phone).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("profiles")
      .select("user_id,email,display_name,phone,created_at,updated_at")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return errorResult(error.message);
    return textResult(data ?? { user_id: ctx.getUserId(), email: ctx.getUserEmail() });
  },
});
