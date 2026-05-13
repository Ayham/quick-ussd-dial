import { supabase } from "@/integrations/supabase/client";

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: displayName ? { full_name: displayName } : undefined,
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function isAdminUser(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data || []).some((r) => r.role === "admin");
}
