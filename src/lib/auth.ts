import { supabase } from "@/integrations/supabase/client";

function normalizePhoneValue(phone?: string | null): string | null {
  if (!phone) return null;
  let value = phone.replace(/[^\d+]/g, "");
  if (value.startsWith("+963")) value = "0" + value.slice(4);
  if (value.startsWith("963")) value = "0" + value.slice(3);
  return value.length >= 10 ? value : null;
}

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
  const normalizedPhone = normalizePhoneValue(phone);
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth`,
      data: {
        full_name: displayName,
        phone: normalizedPhone,
      },
    },
  });

  if (!result.error && result.data.user) {
    await supabase.from("profiles").upsert({
      user_id: result.data.user.id,
      email: result.data.user.email ?? email,
      display_name: displayName ?? null,
      phone: normalizedPhone,
      language: "ar",
    }, { onConflict: "user_id" });
  }

  return result;
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

function getAdminAllowlist(): Set<string> {
  const values = [
    import.meta.env.VITE_ADMIN_EMAILS,
    import.meta.env.VITE_ADMIN_EMAILS_OVERRIDE,
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(values);
}

function getRoleValues(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined): string[] {
  const values: string[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") values.push(item.toLowerCase());
      }
      return;
    }
    if (typeof value === "string") values.push(value.toLowerCase());
  };

  if (user?.app_metadata) {
    collect(user.app_metadata.roles);
    collect(user.app_metadata.role);
  }
  if (user?.user_metadata) {
    collect(user.user_metadata.roles);
    collect(user.user_metadata.role);
  }
  return values;
}

export async function isAdminUser(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const allowlist = getAdminAllowlist();
  if (user.email && allowlist.has(user.email.toLowerCase())) return true;

  const roleValues = getRoleValues(user);
  if (roleValues.some((role) => role === "admin" || role === "super_admin" || role === "sys_admin")) {
    return true;
  }

  try {
    const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!error && typeof data === "boolean") return data;
  } catch {
    // Fall back to the table-based lookup below.
  }

  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (roleRows || []).some((r) => ["admin", "super_admin", "sys_admin"].includes(r.role));
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

  const normalizedPatch = {
    ...patch,
    phone: patch.phone === undefined ? undefined : normalizePhoneValue(patch.phone),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email ?? null,
        ...normalizedPatch,
      },
      { onConflict: "user_id" },
    );

  if (error) return { error };

  const metadataPatch: Record<string, unknown> = {};
  if (patch.display_name !== undefined) metadataPatch.full_name = patch.display_name ?? null;
  if (patch.phone !== undefined) metadataPatch.phone = normalizedPatch.phone;
  if (patch.language !== undefined) metadataPatch.language = patch.language;

  if (Object.keys(metadataPatch).length > 0) {
    const { error: metadataError } = await supabase.auth.updateUser({ data: metadataPatch });
    if (metadataError) return { error: metadataError };
  }

  return { error: null };
}
