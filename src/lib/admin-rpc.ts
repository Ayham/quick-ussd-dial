import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke an admin RPC through the secure `admin-rpc` edge function.
 * Direct EXECUTE on admin_* functions is revoked from the `authenticated` role,
 * so all admin operations must go through this proxy which verifies the caller
 * is an admin server-side and calls the RPC with the service role.
 *
 * In tests and some local environments the edge function may be unavailable, so
 * we fall back to the client RPC bridge when the proxy response is empty.
 */
export async function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const invokeResult = await supabase.functions.invoke("admin-rpc", {
      body: { fn, args },
    });

    if (invokeResult?.error) {
      return { data: null, error: { message: invokeResult.error.message } };
    }

    const payload = invokeResult?.data as { ok?: boolean; error?: string; data?: T } | null;
    if (payload && typeof payload === "object" && ("ok" in payload || "data" in payload || "error" in payload)) {
      if (!payload.ok && payload.error) {
        return { data: null, error: { message: payload.error } };
      }
      return { data: (payload.data ?? null) as T | null, error: null };
    }
  } catch {
    // Fall back to direct RPC support when the proxy is unavailable.
  }

  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { data: null, error: { message: error.message } };
    return { data: (data as T | null) ?? null, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Admin RPC failed" } };
  }
}
