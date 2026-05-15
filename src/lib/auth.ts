import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  language: string;
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
  phone?: string,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth`,
      data: {
        full_name: displayName,
        phone,
      },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signInWithGoogle(next = "/") {
  const redirectTo = `${window.location.origin}/auth?next=${encodeURIComponent(next)}`;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth?mode=reset`,
  });
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

export async function getProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, phone, language")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data) return data as UserProfile;
  // Fallback: profile row not yet inserted (trigger missed, OAuth flow, etc.)
  return {
    user_id: user.id,
    display_name: (user.user_metadata as { full_name?: string })?.full_name ?? null,
    email: user.email ?? null,
    phone: (user.user_metadata as { phone?: string })?.phone ?? null,
    language: "ar",
  };
}

export async function updateProfile(patch: Partial<Pick<UserProfile, "display_name" | "phone" | "language">>) {
  const user = await getCurrentUser();
  if (!user) return { error: new Error("not authenticated") };
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email ?? null,
        ...patch,
      },
      { onConflict: "user_id" },
    );
  return { error };
}
