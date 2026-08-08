import { supabase } from "@/integrations/supabase/client";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import i18n from "@/lib/i18n";

function normalizePhoneValue(phone?: string | null): string | null {
  if (!phone) return null;
  let value = phone.replace(/[^\d+]/g, "");
  if (value.startsWith("+963")) value = "0" + value.slice(4);
  if (value.startsWith("963")) value = "0" + value.slice(3);
  return value.length >= 10 ? value : null;
}

const CAPACITOR_SCHEME = "com.BlueOrbitTechnologies.Raseed";
const OAUTH_REDIRECT_PATH = "/auth";

function getCapacitorRedirectUrl(): string {
  return `${CAPACITOR_SCHEME}://auth`;
}

function isCapacitorNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (win.Capacitor?.isNativePlatform?.()) return true;
  return (
    (window.location.protocol === "https:" && window.location.host === "localhost") ||
    window.location.protocol === "capacitor:"
  );
}

function getRedirectUrl(): string {
  if (isCapacitorNativePlatform()) {
    return getCapacitorRedirectUrl();
  }
  return window.location.origin;
}

function getAuthCallbackUrl(mode: "verify" | "reset"): string {
  if (isCapacitorNativePlatform()) {
    return `${CAPACITOR_SCHEME}://auth?mode=${mode}`;
  }
  return `${window.location.origin}/auth?mode=${mode}`;
}

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  language: string;
  shop_name: string | null;
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
      emailRedirectTo: getAuthCallbackUrl("verify"),
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

let oauthBrowserOpen = false;

export async function signInWithGoogle(next = "/") {
  const redirectTo = getRedirectUrl();
  const native = isCapacitorNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // Native: open the URL ourselves via the Custom Tab and never let the
      // WebView navigate to it. On web, let supabase-js navigate the tab.
      skipBrowserRedirect: native,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) return { error };

  const oauthUrl = data?.url;
  if (!oauthUrl) return { error: new Error(i18n.t("errors.noOAuthUrl")) };

  if (native) {
    oauthBrowserOpen = true;
    try {
      await Browser.open({ url: oauthUrl, windowName: "_system" });
    } catch {
      oauthBrowserOpen = false;
    }
  }

  return { error: null };
}

const processedOAuthCodes = new Set<string>();

export async function handleOAuthDeepLink(url: string) {
  const urlObj = new URL(url);
  const code = urlObj.searchParams.get("code");
  if (!code) {
    // Deep link without an auth code (e.g. plain email-confirmation mode) —
    // nothing to exchange; not an OAuth sign-in.
    return { error: new Error(i18n.t("errors.noAuthCode")) };
  }

  // The OAuth browser is done; close the Custom Tab so the app becomes
  // visible again instead of staying stuck behind the browser.
  if (oauthBrowserOpen) {
    oauthBrowserOpen = false;
    Browser.close().catch(() => {});
  }

  if (processedOAuthCodes.has(code)) {
    return { data: null, error: null, alreadyHandled: true };
  }
  processedOAuthCodes.add(code);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    toast.error(error.message);
    return { error };
  }
  toast.success(i18n.t("toast.signInSuccess"));
  return { data, error: null };
}

export async function listenForOAuthCallback(): Promise<() => void> {
  const remove = await App.addListener("appUrlOpen", (event) => {
    const url = event.url;
    if (url && url.startsWith(`${CAPACITOR_SCHEME}://`)) {
      handleOAuthDeepLink(url).then((result) => {
        if (result.error) {
          console.error("OAuth callback error:", result.error.message);
        }
      });
    }
  });
  return () => { remove.remove(); };
}

export async function getInitialDeepLink(): Promise<string | null> {
  const { url } = await App.getLaunchUrl() ?? {};
  return url ?? null;
}

export function getOAuthRedirectUrl(): string {
  return getCapacitorRedirectUrl();
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) return i18n.t("errors.emailRequired");
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return i18n.t("errors.invalidEmail");
  return null;
}

export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length < 10) return i18n.t("errors.phoneTooShort");
  return null;
}

export function validatePasswordStrength(password: string): string | null {
  if (!password) return i18n.t("errors.passwordRequired");
  if (password.length < 6) return i18n.t("errors.passwordTooShort");
  return null;
}

export function validatePasswordsMatch(password: string, confirm: string): string | null {
  if (password !== confirm) return i18n.t("errors.passwordsMismatch");
  return null;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthCallbackUrl("reset"),
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
    .select("user_id, display_name, email, phone, language, shop_name")
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
    shop_name: null,
  };
}

export async function updateProfile(patch: Partial<Pick<UserProfile, "display_name" | "phone" | "language" | "shop_name">>) {
  const user = await getCurrentUser();
  if (!user) return { error: new Error(i18n.t("errors.notAuthenticated")) };

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
