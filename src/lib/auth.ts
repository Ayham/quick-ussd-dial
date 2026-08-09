import { supabase } from "@/integrations/supabase/client";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import i18n from "@/lib/i18n";

const TRACE_TAG = "RASEED_AUTH";

// Temporary diagnostic instrumentation for the Android Google OAuth flow.
// Logs only metadata (presence/length/short prefix), never tokens or secrets.
export function authTrace(stage: string, detail?: Record<string, unknown> | string) {
  const ts = new Date().toISOString();
  const body = detail
    ? typeof detail === "string"
      ? detail
      : Object.entries(detail)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" ")
    : "";
  console.log(`[${TRACE_TAG}] ${ts} [${stage}]${body ? ` ${body}` : ""}`);
}

function shortenSecret(value: string | null | undefined): string {
  if (!value) return "absent";
  return `len=${value.length} head=${value.slice(0, 6)} tail=${value.slice(-4)}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  let timedOut = false;
  const guard = new Promise<T | undefined>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      authTrace("AUTH_TIMEOUT", { label, ms });
      resolve(undefined);
    }, ms);
  });
  const result = await Promise.race([promise, guard]);
  if (timedOut) return undefined;
  return result;
}

function normalizePhoneValue(phone?: string | null): string | null {
  if (!phone) return null;
  let value = phone.replace(/[^\d+]/g, "");
  if (value.startsWith("+963")) value = "0" + value.slice(4);
  if (value.startsWith("963")) value = "0" + value.slice(3);
  return value.length >= 10 ? value : null;
}

const CAPACITOR_SCHEME = "com.BlueOrbitTechnologies.Raseed";
const OAUTH_REDIRECT_PATH = "/auth";

// Matches the default supabase-js storage key: `sb-<project-ref>-auth-token`.
const SUPABASE_PROJECT_REF = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const match = url ? /^https:\/\/([^.]+)\./.exec(url) : null;
  return match ? match[1] : "unknown";
})();
const VERIFIER_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token-code-verifier`;

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
  authTrace("GOOGLE_START", { next, native, redirectTo });
  const { data, error } = await withTimeout(
    supabase.auth.signInWithOAuth({
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
    }),
    20000,
    "signInWithOAuth",
  ) ?? { data: undefined, error: new Error("signInWithOAuth timed out") };

  if (error) {
    authTrace("AUTH_ERROR", { stage: "signInWithOAuth", message: error.message });
    return { error };
  }

  const oauthUrl = data?.url;
  if (!oauthUrl) return { error: new Error(i18n.t("errors.noOAuthUrl")) };

  try {
    const parsed = new URL(oauthUrl);
    authTrace("OAUTH_URL", {
      scheme: parsed.protocol,
      host: parsed.host,
      hasCodeChallenge: parsed.searchParams.has("code_challenge"),
      hasCodeChallengeMethod: parsed.searchParams.has("code_challenge_method"),
      hasRedirectTo: parsed.searchParams.has("redirect_to"),
      redirectToParam: parsed.searchParams.get("redirect_to")?.slice(0, 40) ?? "none",
      length: oauthUrl.length,
    });
  } catch {
    authTrace("OAUTH_URL", { unparsable: true, length: oauthUrl.length });
  }

  if (native) {
    oauthBrowserOpen = true;
    try {
      await withTimeout(Browser.open({ url: oauthUrl, windowName: "_blank" }), 20000, "Browser.open");
    } catch {
      oauthBrowserOpen = false;
      authTrace("AUTH_ERROR", { stage: "Browser.open", message: "Browser.open threw" });
    }
  }

  return { error: null };
}

const processedOAuthCodes = new Set<string>();

export async function handleOAuthDeepLink(url: string) {
  authTrace("CALLBACK_PARAMS", { url: url.slice(0, 80) });
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch (err) {
    authTrace("AUTH_ERROR", { stage: "parse", message: String(err) });
    return { error: new Error(i18n.t("errors.noAuthCode")) };
  }

  const hasHashToken = Boolean(urlObj.hash && urlObj.hash.includes("access_token"));
  const hasCode = urlObj.searchParams.has("code");
  const code = urlObj.searchParams.get("code");
  const hasState = urlObj.searchParams.has("state");
  authTrace("CALLBACK_HASH", { hashLength: urlObj.hash.length, hasHashToken });
  authTrace("CALLBACK_CODE", { hasCode, state: hasState, ...(hasCode ? { code: shortenSecret(code) } : {}) });

  if (!code) {
    // Deep link without an auth code (e.g. plain email-confirmation mode) —
    // nothing to exchange; not an OAuth sign-in.
    authTrace("AUTH_ERROR", { stage: "noCode", message: "No ?code= in callback URL" });
    return { error: new Error(i18n.t("errors.noAuthCode")) };
  }

  // The OAuth browser is done; close the Custom Tab so the app becomes
  // visible again instead of staying stuck behind the browser.
  if (oauthBrowserOpen) {
    oauthBrowserOpen = false;
    Browser.close().catch(() => {});
  }

  if (processedOAuthCodes.has(code)) {
    authTrace("CALLBACK_CODE", { alreadyHandled: true });
    return { data: null, error: null, alreadyHandled: true };
  }
  processedOAuthCodes.add(code);

  let beforeSession: string | null = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    beforeSession = sessionData?.session ? "present" : "absent";
  } catch (err) {
    beforeSession = `error:${String(err)}`;
  }
  authTrace("SESSION_BEFORE", { session: beforeSession });

  let verifierState = "unknown";
  try {
    const v = window.localStorage.getItem(VERIFIER_STORAGE_KEY);
    verifierState = v ? shortenSecret(v) : "absent";
  } catch (err) {
    verifierState = `error:${String(err)}`;
  }
  authTrace("SESSION_EXCHANGE", { verifierStorage: verifierState, storageKey: VERIFIER_STORAGE_KEY });

  const { data, error } = await withTimeout(
    supabase.auth.exchangeCodeForSession(code),
    20000,
    "exchangeCodeForSession",
  ) ?? { data: null, error: new Error("exchangeCodeForSession timed out") };

  if (error) {
    authTrace("AUTH_ERROR", { stage: "exchange", message: error.message });
    toast.error(error.message);
    return { error };
  }
  authTrace("SESSION_AFTER", { user: data?.user?.id ? "present" : "absent", email: data?.user?.email ? "present" : "absent" });
  authTrace("SIGNED_IN", { provider: data?.user?.app_metadata?.provider ?? "unknown" });
  toast.success(i18n.t("toast.signInSuccess"));
  return { data, error: null };
}

export async function listenForOAuthCallback(): Promise<() => void> {
  const removeAppUrlOpen = await App.addListener("appUrlOpen", (event) => {
    const url = event.url;
    authTrace("APP_URL_OPEN", { url: url ? url.slice(0, 80) : "undefined" });
    if (url && url.startsWith(`${CAPACITOR_SCHEME}://`)) {
      handleOAuthDeepLink(url).then((result) => {
        if (result.error) {
          authTrace("AUTH_ERROR", { stage: "appUrlOpen handler", message: result.error.message });
          console.error("OAuth callback error:", result.error.message);
        }
      });
    } else {
      authTrace("APP_URL_OPEN", { ignored: true });
    }
  });

  // Fallback for devices/browsers where the deep-link intent back into the app
  // is not delivered while the OAuth browser is open. When the app regains
  // focus after an OAuth session, close the Custom Tab and re-read the launch
  // URL so a missed deep link still gets exchanged.
  let resumePollTimer: number | undefined;
  const removeAppState = await App.addListener("appStateChange", (state) => {
    if (!state.isActive || !oauthBrowserOpen) return;
    oauthBrowserOpen = false;
    Browser.close().catch(() => {});
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const url = await getInitialDeepLink();
      if (url && url.startsWith(`${CAPACITOR_SCHEME}://`)) {
        if (resumePollTimer !== undefined) {
          window.clearInterval(resumePollTimer);
          resumePollTimer = undefined;
        }
        handleOAuthDeepLink(url).then((result) => {
          if (result.error) {
            authTrace("AUTH_ERROR", { stage: "resume deep link", message: result.error.message });
            console.error("OAuth resume error:", result.error.message);
          }
        });
        return;
      }
      if (attempts >= 6) {
        if (resumePollTimer !== undefined) {
          window.clearInterval(resumePollTimer);
          resumePollTimer = undefined;
        }
        authTrace("AUTH_ERROR", { stage: "resume no deep link", message: "No deep link after browser return" });
        toast.error(i18n.t("auth.oauthReturnFailed"));
      }
    };
    resumePollTimer = window.setInterval(poll, 400);
    poll();
  });

  // The user manually closed the Custom Tab without a deep link arriving.
  const removeBrowserFinished = await Browser.addListener("browserFinished", () => {
    if (!oauthBrowserOpen) return;
    oauthBrowserOpen = false;
    authTrace("AUTH_ERROR", { stage: "browser closed manually", message: "No deep link received" });
    toast.error(i18n.t("auth.oauthReturnFailed"));
  });

  return () => {
    removeAppUrlOpen.remove();
    removeAppState.remove();
    removeBrowserFinished.remove();
    if (resumePollTimer !== undefined) window.clearInterval(resumePollTimer);
  };
}

export async function getInitialDeepLink(): Promise<string | null> {
  const { url } = await App.getLaunchUrl() ?? {};
  authTrace("LAUNCH_URL", { url: url ? url.slice(0, 80) : "null" });
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
