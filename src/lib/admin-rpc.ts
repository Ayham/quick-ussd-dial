import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke an admin RPC through the secure `admin-rpc` edge function.
 * Direct EXECUTE on admin_* functions is revoked from the `authenticated` role,
 * so all admin operations must go through this proxy which verifies the caller
 * is an admin server-side and calls the RPC with the service role.
 */
export async function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const { data, error } = await supabase.functions.invoke("admin-rpc", {
    body: { fn, args },
  });
  if (error) return { data: null, error: { message: error.message } };
  const payload = data as { ok?: boolean; error?: string; data?: T } | null;
  if (!payload?.ok) {
    return { data: null, error: { message: payload?.error || "Admin RPC failed" } };
  }
  return { data: (payload.data ?? null) as T | null, error: null };
}
